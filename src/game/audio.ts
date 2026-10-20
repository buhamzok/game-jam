/**
 * Game sound, played through Web Audio. Sounds come from two packs built by
 * tools/build-sfx.py from tools/sfx-kit.json (all CC0, credits in
 * docs/sound-credits.md): sounds.pack (one-shots plus the event table: bus,
 * gain, pitch range, minimum gap, variations) and loops.pack (music and the
 * graveyard ambience, loaded after the one-shots).
 *
 * Mix: every event plays on a bus (player, enemy, voice, ui) into a master
 * limiter, so stacked hits never clip into mush. Music and ambience have their
 * own buses; announcer lines duck the music while they speak.
 *
 * Timing: each sound is cut to start on its first frame, and the time of its
 * loudest moment is in the pack. `align` (seconds until the moment that
 * matters) starts a sound early, or partway in, so its peak lands on that
 * moment: a whoosh peaks on the hit frame, not after it.
 *
 * Browsers start audio suspended until a tap or key press, so the context
 * resumes on gestures. Host pause (store.paused) suspends it. The mute choice
 * is kept in RUN's device cache (browser storage is blocked in RUN games).
 * Packs are .pack files because Internet Download Manager blanks .mp3/.ogg/.wav
 * responses in Chrome. Sound never blocks boot.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { fetchCdnAsset } from './view/assets.ts';
import { store } from '../state/store.ts';
import { sdkReady } from '../sdk/runSdk.ts';

export type SfxName =
    | 'swingClaw' | 'swingBlade' | 'swingHeavy' | 'hit' | 'hitHeavy' | 'dodge' | 'block' | 'guardBreak' | 'parry'
    | 'witching' | 'wolfHurt' | 'vampHurt' | 'stitchHurt' | 'monsterDown' | 'wolfTransform' | 'vampTransform'
    | 'stitchTransform' | 'wings' | 'growl' | 'smash' | 'rumble' | 'zap' | 'swap' | 'enemySwing' | 'heavyTell'
    | 'enemyHurt' | 'enemyDeath' | 'poiseBreak' | 'crossbow' | 'boltHit' | 'mageCast' | 'mageBlast' | 'bell'
    | 'gameOver' | 'click'
    | 'vo_fight' | 'vo_round1' | 'vo_round2' | 'vo_round3' | 'vo_round4' | 'vo_round5' | 'vo_multikill'
    | 'vo_flawless' | 'vo_gameover';

export type LoopName = 'music' | 'menuMusic' | 'ambience';

export interface PlayOpts {
    /** Extra gain on top of the event's mix level (1 = as mixed). */
    volume?: number;
    /** Stereo position, -1 (left) .. 1 (right). */
    pan?: number;
    /** Seconds until the moment this sound's peak should land. */
    align?: number;
    /** Seconds to wait before playing. */
    delay?: number;
}

type Bus = 'player' | 'enemy' | 'voice' | 'ui';

interface EventDef {
    bus: Bus;
    gain: number;
    rate?: [number, number];
    gap?: number;
    files: string[];
}

interface Clip {
    buffer: AudioBuffer;
    /** Seconds of codec padding to skip at the start. */
    start: number;
    /** Seconds from `start` to the loudest moment. */
    peak: number;
}

const BUS_GAIN: Record<Bus, number> = { player: 1, enemy: 0.85, voice: 1, ui: 0.8 };
const MAX_VOICES_PER_EVENT = 4;
const MUTE_KEY = 'ttt.muted';

const dbToGain = (db: number) => Math.pow(10, db / 20);

function parsePack(buf: ArrayBuffer): { header: Record<string, unknown>; base: number } {
    const len = new DataView(buf).getUint32(0, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as Record<string, unknown>;
    return { header, base: 4 + len };
}

/** First sample above the noise, so MP3 encoder padding never delays a hit. */
function leadingSilence(b: AudioBuffer): number {
    const d = b.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const thr = peak * 0.01;
    const limit = Math.min(d.length, Math.floor(b.sampleRate * 0.1));
    for (let i = 0; i < limit; i++) if (Math.abs(d[i]) > thr) return Math.max(0, i - 32) / b.sampleRate;
    return 0;
}

class GameAudio {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    private readonly buses = new Map<string, GainNode>();
    private musicDuck: GainNode | null = null;
    private readonly clips = new Map<string, Clip>();
    private events: Record<string, EventDef> = {};
    private readonly loops = new Map<LoopName, { clip: Clip; loopSec: number; gain: number }>();
    private readonly lastPlayed = new Map<string, number>();
    private readonly robin = new Map<string, number>();
    private readonly voices = new Map<string, number>();
    private readonly loopPlaying = new Map<'music' | 'ambience', { src: AudioBufferSourceNode; gain: GainNode; name: LoopName }>();
    private wantMusic: LoopName | null | undefined = undefined;
    private wantAmbience: boolean | undefined = undefined;
    private muted = false;
    private loading: Promise<void> | null = null;

    get isMuted(): boolean {
        return this.muted;
    }

    /** Create the context and decode the packs. Safe to call more than once. */
    load(): Promise<void> {
        if (this.loading) return this.loading;
        this.loading = this.doLoad();
        return this.loading;
    }

    private async doLoad(): Promise<void> {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        if (sdkReady()) {
            try {
                this.muted = (await RundotGameAPI.deviceCache.getItem(MUTE_KEY)) === '1';
                store.patch({ muted: this.muted });
            } catch {
                /* no saved choice: sound on */
            }
        }
        const ctx = new Ctx();
        this.ctx = ctx;
        const limiter = ctx.createDynamicsCompressor();
        limiter.threshold.value = -14;
        limiter.knee.value = 6;
        limiter.ratio.value = 4;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.2;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        limiter.connect(this.master).connect(ctx.destination);
        for (const [name, g] of Object.entries(BUS_GAIN)) {
            const bus = ctx.createGain();
            bus.gain.value = g;
            bus.connect(limiter);
            this.buses.set(name, bus);
        }
        this.musicDuck = ctx.createGain();
        this.musicDuck.connect(limiter);
        for (const name of ['music', 'ambience']) {
            const bus = ctx.createGain();
            bus.connect(name === 'music' ? this.musicDuck : limiter);
            this.buses.set(name, bus);
        }
        this.listenForUnlock();
        store.subscribe(() => this.followStore());

        try {
            await this.loadSounds();
        } catch (err) {
            console.warn('[audio] sounds.pack not available; playing without sound', err);
            return;
        }
        // loops are bigger and not needed for the first second of play
        this.loadLoops()
            .then(() => {
                this.wantMusic = this.wantAmbience = undefined;
                this.followStore();
            })
            .catch((err) => console.info('[audio] loops.pack not available', err));
    }

    private async loadSounds(): Promise<void> {
        const pack = await fetchCdnAsset('sfx/sounds.pack');
        const { header, base } = parsePack(pack);
        this.events = header.events as Record<string, EventDef>;
        const sounds = header.sounds as Record<string, [number, number, number]>;
        await Promise.all(
            Object.entries(sounds).map(async ([key, [off, len, peakMs]]) => {
                try {
                    // decodeAudioData detaches its input, so each sound gets its own copy
                    const buffer = await this.ctx!.decodeAudioData(pack.slice(base + off, base + off + len));
                    this.clips.set(key, { buffer, start: leadingSilence(buffer), peak: peakMs / 1000 });
                } catch (err) {
                    console.info(`[audio] ${key} could not be decoded`, err);
                }
            }),
        );
    }

    private async loadLoops(): Promise<void> {
        const pack = await fetchCdnAsset('sfx/loops.pack');
        const { header, base } = parsePack(pack);
        const loops = header.loops as Record<LoopName, { off: number; len: number; loop_sec: number; gain: number }>;
        // a track picked for both menu and fight is stored once; decode it once too
        const clips = new Map<number, Clip>();
        for (const [name, l] of Object.entries(loops) as [LoopName, (typeof loops)[LoopName]][]) {
            let clip = clips.get(l.off);
            if (!clip) {
                const buffer = await this.ctx!.decodeAudioData(pack.slice(base + l.off, base + l.off + l.len));
                clip = { buffer, start: leadingSilence(buffer), peak: 0 };
                clips.set(l.off, clip);
            }
            this.loops.set(name, { clip, loopSec: l.loop_sec, gain: l.gain });
        }
    }

    /**
     * Resume on a tap or key press. Phones only count the finger lifting
     * (pointerup, touchend, click) as a gesture, and iOS also wants a sound
     * started inside it. Kept listening, so audio comes back after a call.
     */
    private listenForUnlock(): void {
        const unlock = () => {
            const ctx = this.ctx;
            if (!ctx || ctx.state === 'running' || store.get().paused) return;
            void ctx.resume();
            const silent = ctx.createBufferSource();
            silent.buffer = ctx.createBuffer(1, 1, 22050);
            silent.connect(ctx.destination);
            silent.start();
        };
        for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, true);
    }

    /** Host pause suspends audio; the screen decides the music. */
    private followStore(): void {
        const ctx = this.ctx;
        if (!ctx) return;
        const s = store.get();
        if (s.paused && ctx.state === 'running') void ctx.suspend();
        else if (!s.paused && ctx.state === 'suspended') void ctx.resume();
        const music: LoopName | null = s.phase === 'menu' ? 'menuMusic' : s.phase === 'playing' && !s.gameOver ? 'music' : null;
        if (music !== this.wantMusic) {
            this.wantMusic = music;
            this.setLoop('music', music);
        }
        const amb = s.phase === 'playing';
        if (amb !== this.wantAmbience) {
            this.wantAmbience = amb;
            this.setLoop('ambience', amb ? 'ambience' : null);
        }
    }

    /** Crossfade a loop slot to `name` (null fades it out). */
    private setLoop(slot: 'music' | 'ambience', name: LoopName | null): void {
        const ctx = this.ctx;
        if (!ctx) return;
        const now = ctx.currentTime;
        const old = this.loopPlaying.get(slot);
        if (old && old.name === name) return;
        const loop = name ? this.loops.get(name) : null;
        if (old && loop && old.src.buffer === loop.clip.buffer) {
            // same track (menu into fight): keep playing, only move to the new level
            old.gain.gain.setTargetAtTime(dbToGain(loop.gain), now, 0.6);
            old.name = name!;
            return;
        }
        if (old) {
            old.gain.gain.setTargetAtTime(0, now, 0.4);
            old.src.stop(now + 2);
            this.loopPlaying.delete(slot);
        }
        if (!name || !loop) return;
        const src = ctx.createBufferSource();
        src.buffer = loop.clip.buffer;
        src.loop = true;
        src.loopStart = loop.clip.start;
        src.loopEnd = loop.clip.start + loop.loopSec;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(dbToGain(loop.gain), now, 0.6);
        src.connect(gain).connect(this.buses.get(slot)!);
        src.start(now, loop.clip.start);
        this.loopPlaying.set(slot, { src, gain, name });
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        if (sdkReady()) RundotGameAPI.deviceCache.setItem(MUTE_KEY, muted ? '1' : '0').catch(() => undefined);
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
        store.patch({ muted });
    }

    /** Play one variation of an event. */
    play(name: SfxName, opts: PlayOpts = {}): void {
        const ctx = this.ctx;
        const ev = this.events[name];
        if (!ctx || !ev || ev.files.length === 0 || this.muted || ctx.state !== 'running') return;
        const now = ctx.currentTime;
        const last = this.lastPlayed.get(name) ?? -1;
        if (ev.gap && now - last < ev.gap) return;
        if ((this.voices.get(name) ?? 0) >= MAX_VOICES_PER_EVENT) return;
        this.lastPlayed.set(name, now);

        // round robin over the variations from a random start
        const i = this.robin.get(name) ?? Math.floor(Math.random() * ev.files.length);
        this.robin.set(name, i + 1);
        const clip = this.clips.get(ev.files[i % ev.files.length]);
        if (!clip) return;

        const src = ctx.createBufferSource();
        src.buffer = clip.buffer;
        const rate = ev.rate ? ev.rate[0] + Math.random() * (ev.rate[1] - ev.rate[0]) : 1;
        src.playbackRate.value = rate;
        const gain = ctx.createGain();
        gain.gain.value = dbToGain(ev.gain) * (opts.volume ?? 1);
        src.connect(gain);
        let out: AudioNode = gain;
        if (opts.pan && ctx.createStereoPanner) {
            const panner = ctx.createStereoPanner();
            panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
            gain.connect(panner);
            out = panner;
        }
        out.connect(this.buses.get(ev.bus) ?? this.buses.get('player')!);

        // line the peak up with the moment it belongs to
        const peak = clip.peak / rate;
        let offset = clip.start;
        let when = now + (opts.delay ?? 0);
        if (opts.align !== undefined) {
            if (peak > opts.align) offset += (peak - opts.align) * rate;
            else when += opts.align - peak;
        }
        src.start(when, offset);
        this.voices.set(name, (this.voices.get(name) ?? 0) + 1);
        src.onended = () => this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1));

        // the announcer ducks the music while it speaks
        if (name.startsWith('vo_') && this.musicDuck) {
            const len = (clip.buffer.duration - clip.start) / rate;
            this.musicDuck.gain.setTargetAtTime(dbToGain(-9), when, 0.05);
            this.musicDuck.gain.setTargetAtTime(1, when + len, 0.3);
        }
    }
}

export const audio = new GameAudio();

// Dev-only handle for checking sound from the browser console before a fight starts.
if (import.meta.env.DEV) (window as unknown as { __audio?: GameAudio }).__audio = audio;

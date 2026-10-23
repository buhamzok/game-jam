/**
 * In-game HUD: a React overlay above the Pixi canvas.
 *
 * The overlay itself is pointer-events-none so taps fall through to the
 * canvas and controls; each interactive element opts back in with
 * pointer-events-auto. `pt-safe-top` (see app.css) pads below the RUN host
 * header.
 */
import { useEffect, useState } from 'react';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { store, useStore } from '../state/store.ts';
import { input } from '../game/input.ts';
import { T, type MonsterKind } from '../game/tuning.ts';
import { audio } from '../game/audio.ts';
import { sdkReady } from '../sdk/runSdk.ts';
import { telemetry } from '../sdk/dailyHunt.ts';
import { sendChallenge } from '../sdk/challenge.ts';
import { freePoints } from '../sdk/progress.ts';
import { boonDef, type BoonId } from '../game/boons.ts';
import { tierFor } from '../game/ranks.ts';

const GRADE_COLOR: Record<string, string> = { SS: '#fde68a', S: '#fbbf24', A: '#c4b5fd', B: '#93c5fd', C: '#86efac', D: '#d1d5db' };

/** Combo meter: hits in a row and the grade, on the right edge; pops on every hit. */
function ComboMeter({ combo, grade }: { combo: number; grade: string }) {
    if (combo < 3) return null;
    const color = GRADE_COLOR[grade] ?? '#fff';
    return (
        <div className="absolute right-3 top-[19%] flex flex-col items-end">
            <div key={combo} className="stay-pop flex items-baseline gap-1.5 drop-shadow-[0_3px_0_rgba(0,0,0,0.85)]">
                <span className="text-4xl font-black italic tabular-nums text-white">{combo}</span>
                <span className="text-sm font-black tracking-widest text-white/80">HITS</span>
            </div>
            <span className="text-3xl font-black italic leading-none drop-shadow-[0_3px_0_rgba(0,0,0,0.85)]" style={{ color }}>
                {grade}
            </span>
        </div>
    );
}

/** A quest just completed: a short toast at the top, gone after 3 s. */
function QuestToast() {
    const toast = useStore((s) => s.questToast);
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => store.patch({ questToast: null }), 3000);
        return () => clearTimeout(t);
    }, [toast]);
    if (!toast) return null;
    return (
        <div className="absolute inset-x-0 top-[13%] flex justify-center px-4">
            <div key={toast.at} className="stay-pop rounded-xl bg-emerald-600/90 px-3 py-1.5 text-center text-xs font-black text-white shadow-lg ring-1 ring-emerald-300/60">
                {'\u2713'} Quest complete: {toast.text} · claim it on the menu
            </div>
        </div>
    );
}

/** End screen: the run in numbers, with the best combo's grade. */
function RunSummary({ s }: { s: NonNullable<ReturnType<typeof store.get>['runStats']> }) {
    const mmss = `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, '0')}`;
    const cells: [string, string | number][] = [
        ['BEST COMBO', s.maxCombo],
        ['PERFECT DODGES', s.perfects],
        ['COUNTERS', s.counters],
        ['BOSSES', s.bosses],
        ['DAMAGE TAKEN', s.damageTaken],
        ['TIME', mmss],
    ];
    return (
        <div className="flex w-full max-w-[340px] items-center gap-3 rounded-2xl bg-black/50 p-3 ring-1 ring-white/10">
            <div className="flex w-16 shrink-0 flex-col items-center">
                <span className="text-[9px] font-black tracking-[0.2em] text-white/50">STYLE</span>
                <span className="text-5xl font-black italic leading-none" style={{ color: GRADE_COLOR[s.grade] ?? '#fff' }}>
                    {s.grade}
                </span>
            </div>
            <div className="grid flex-1 grid-cols-3 gap-x-2 gap-y-1.5 text-center">
                {cells.map(([k, v]) => (
                    <div key={k}>
                        <p className="text-base font-black leading-none text-white tabular-nums">{v}</p>
                        <p className="mt-0.5 text-[8px] font-black tracking-wider text-white/50">{k}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Portal boon pick: three cards; the portal opens once one is taken. Keys 1 2 3 pick too. */
function BoonPicker({ choice, owned }: { choice: BoonId[]; owned: Partial<Record<BoonId, number>> }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
            if (i >= 0 && choice[i]) store.patch({ boonPick: choice[i] });
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [choice]);
    return (
        <div className="pointer-events-auto absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 px-5">
            <p className="stay-pop text-center text-3xl font-black italic tracking-wider text-amber-300 drop-shadow-[0_3px_0_rgba(0,0,0,0.9)]">CHOOSE A BOON</p>
            <p className="text-center text-xs font-bold text-white/70">It lasts the whole run. The portal opens once you pick.</p>
            <div className="flex w-full max-w-[460px] flex-col gap-2.5 landscape:flex-row">
                {choice.map((id, i) => {
                    const d = boonDef(id);
                    const have = owned[id] ?? 0;
                    return (
                        <button
                            key={id}
                            type="button"
                            className="stay-pop flex flex-1 items-center gap-3 rounded-2xl bg-black/75 p-3 text-left ring-2 transition-transform active:scale-95 landscape:flex-col landscape:text-center"
                            style={{ boxShadow: `inset 0 0 0 2px ${d.color}aa`, animationDelay: `${i * 0.08}s` }}
                            onClick={() => {
                                audio.play('click');
                                store.patch({ boonPick: id });
                            }}
                        >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl" style={{ background: `${d.color}33` }}>
                                {d.icon}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-base font-black text-white">
                                    {d.name}
                                    {have > 0 && <span className="ml-1.5 text-xs text-amber-300">x{have + 1}</span>}
                                </span>
                                <span className="block text-xs font-bold text-white/70">{d.desc}</span>
                            </span>
                            <span className="ml-auto hidden text-[10px] font-black text-white/40 landscape:ml-0 landscape:block">{i + 1}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
import portraitWerewolf from '../assets/portrait-werewolf.png';
import portraitVampire from '../assets/portrait-vampire.png';
import portraitStitched from '../assets/portrait-stitched.png';

const PORTRAITS: Record<MonsterKind, string> = {
    werewolf: portraitWerewolf,
    vampire: portraitVampire,
    stitched: portraitStitched,
};

/** The jam page with our entry open on it (from `rundot jam promo`); the share fallback copies it. */
const VOTE_URL = 'https://run.world/jams/octoberjam?game=Zo8tRIGBpGhAGb0XCXoI';

/**
 * Open the jam vote page for a one-tap vote. Order for every device: a new
 * tab/window; inside RUN's cross-origin iframe (blocked popups) a top-frame
 * navigation; on phones the native share sheet as backup; last resort copy.
 */
async function voteRun(): Promise<'opened' | 'copied' | 'failed'> {
    try {
        if (window.open(VOTE_URL, '_blank')) return 'opened';
    } catch { /* fall through */ }
    // Inside the RUN host the game lives in a cross-origin iframe and window.open
    // is popup-blocked; with a real tap we may navigate the top frame instead.
    try {
        window.top!.location.href = VOTE_URL;
        return 'opened';
    } catch { /* sandboxed embed denies top navigation -> fall through */ }
    // Sandboxed RUN embed: ask the host itself to open the vote flow outside
    // the game frame.
    if (sdkReady()) {
        try {
            const cta = await RundotGameAPI.playable.cta({ targetUrl: VOTE_URL });
            if (cta?.completed) return 'opened';
        } catch { /* fall through */ }
    }
    // Phone webviews that swallow both: fall back to the native share sheet.
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (typeof navigator.share === 'function' && isMobile) {
        try {
            await navigator.share({ title: 'Vote for Tag Team Terror', text: 'Play it, then press Vote:', url: VOTE_URL });
            return 'opened';
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return 'failed';
        }
    }
    try {
        await navigator.clipboard.writeText(VOTE_URL);
        return 'copied';
    } catch {
        return 'failed';
    }
}

function toggleMute() {
    audio.setMuted(!audio.isMuted);
    audio.play('click');
}

/** Shield pips: one blocked per full pip; crack one per absorbed hit. */
function GuardPips({ hits, broken }: { hits: number; broken: boolean }) {
    const n = T.guard.maxHits;
    return (
        <div className="flex items-center gap-1">
            {Array.from({ length: n }, (_, i) => {
                const intact = i >= hits && !broken;
                return (
                    <span
                        key={i}
                        className="h-2 flex-1 rounded-full transition-colors duration-100"
                        style={{
                            background: broken ? '#ef4444' : intact ? '#7dd3fc' : '#1e293b',
                            opacity: broken ? 0.35 : intact ? 1 : 0.6,
                            boxShadow: intact && !broken ? '0 0 4px #7dd3fc66' : 'none',
                        }}
                    />
                );
            })}
        </div>
    );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
    const pct = Math.max(0, Math.min(100, (value / max) * 100));
    return (
        <div className="flex items-center gap-2">
            <span className="w-14 text-xs font-black tracking-wider text-white/70">{label}</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/15">
                <div className="h-full rounded-full transition-[width] duration-150 ease-out" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}

/** Small portrait button for one team member; taps swap (or demand Crimson Rain). */
function Portrait({ kind, slot, hp, hpMax, active, rainReady }: { kind: MonsterKind; slot: number; hp: number; hpMax: number; active: boolean; rainReady: boolean }) {
    const ring = active ? 'ring-2 ring-amber-400' : rainReady && !active ? 'ring-2 ring-fuchsia-500 animate-pulse' : 'ring-1 ring-white/20';
    const bar = active ? '#22c55e' : '#94a3b8';
    const dead = hp <= 0;
    return (
        <button
            type="button"
            className={`pointer-events-auto flex h-16 w-14 flex-col justify-between overflow-hidden rounded-xl bg-black/60 ${ring} ${dead ? 'opacity-40 saturate-0' : ''} transition-transform active:scale-95`}
            onPointerDown={() => {
                input.press(`swap${slot}` as Parameters<typeof input.press>[0]);
            }}
        >
            <img src={PORTRAITS[kind]} alt={kind} className="h-10 w-full object-cover" draggable={false} />
            <div className="flex items-center justify-center gap-0.5 pb-1">
                <div className="h-1.5 w-8 overflow-hidden rounded-full bg-black/70">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (hp / hpMax) * 100))}%`, background: bar }} />
                </div>
                <span className="text-[9px] font-bold text-white/60">{slot + 1}</span>
            </div>
        </button>
    );
}

/** End screen: XP this run, level-ups, and a way to spend the points. */
function XpLine({ xp, levels, level, points }: { xp: number; levels: number; level: number; points: number }) {
    if (xp <= 0 && points <= 0) return null;
    return (
        <div className="flex flex-col items-center gap-1.5">
            <p className="text-sm font-black text-amber-200 tabular-nums">
                +{xp} XP{levels > 0 ? ` · LEVEL UP! Now level ${level}` : ` · level ${level}`}
            </p>
            {points > 0 && (
                <button
                    type="button"
                    className="animate-pulse rounded-xl bg-amber-400 px-5 py-2 text-sm font-black text-black shadow-[0_3px_0_#92400e] active:translate-y-0.5"
                    onClick={() => {
                        audio.play('click');
                        store.patch({ phase: 'upgrades', gameOver: false });
                    }}
                >
                    SPEND {points} STAT {points === 1 ? 'POINT' : 'POINTS'}
                </button>
            )}
        </div>
    );
}

function restart() {
    audio.play('click');
    const s = store.get();
    telemetry('run_retry', { wave: s.finalWave, kills: s.finalKills });
    store.patch({ runId: s.runId + 1, gameOver: false });
}

type SettingKey = 'shake' | 'flash' | 'gore' | 'damageNumbers' | 'lowGraphics';

function persistToggle(kind: SettingKey, value: boolean) {
    if (sdkReady()) RundotGameAPI.deviceCache.setItem(`ttt.${kind}`, value ? '1' : '0').catch(() => undefined);
}

function toggleSetting(kind: SettingKey) {
    const next = !store.get()[kind];
    persistToggle(kind, next);
    if (kind === 'shake') store.patch({ shake: next });
    else if (kind === 'flash') store.patch({ flash: next });
    else if (kind === 'gore') store.patch({ gore: next });
    else if (kind === 'damageNumbers') store.patch({ damageNumbers: next });
    else store.patch({ lowGraphics: next });
    audio.play('click');
}

export default function Hud() {
    const hp = useStore((s) => s.hp);
    const hpMax = useStore((s) => s.hpMax);
    const energy = useStore((s) => s.energy);
    const energyMax = useStore((s) => s.energyMax);
    const transReady = useStore((s) => s.transReady);
    const wave = useStore((s) => s.wave);
    const kills = useStore((s) => s.kills);
    const banner = useStore((s) => s.banner);
    const bannerSub = useStore((s) => s.bannerSub);
    const paused = useStore((s) => s.paused);
    const gameOver = useStore((s) => s.gameOver);
    const finalWave = useStore((s) => s.finalWave);
    const finalKills = useStore((s) => s.finalKills);
    const team = useStore((s) => s.team);
    const activeMonster = useStore((s) => s.activeMonster);
    const rainReady = useStore((s) => s.rainReady);
    const guardHits = useStore((s) => s.guardHits);
    const guardCd = useStore((s) => s.guardCd);
    const trans = useStore((s) => s.trans);
    const transLabel = useStore((s) => s.transLabel);
    const transLeft = useStore((s) => s.transLeft);
    const cutIn = useStore((s) => s.cutIn);
    const muted = useStore((s) => s.muted);
    const shake = useStore((s) => s.shake);
    const flash = useStore((s) => s.flash);
    const gore = useStore((s) => s.gore);
    const damageNumbers = useStore((s) => s.damageNumbers);
    const lowGraphics = useStore((s) => s.lowGraphics);
    const dailyRank = useStore((s) => s.dailyRank);
    const dailyPlayers = useStore((s) => s.dailyPlayers);
    const bestWave = useStore((s) => s.bestWave);
    const bossHp = useStore((s) => s.bossHp);
    const challenge = useStore((s) => s.challenge);
    const challengeBeaten = useStore((s) => s.challengeBeaten);
    const soulsEarned = useStore((s) => s.soulsEarned);
    const realmName = useStore((s) => s.realmName);
    const pvpResult = useStore((s) => s.pvpResult);
    const mode = useStore((s) => s.mode);
    const rival = useStore((s) => s.rival);
    const portalOpen = useStore((s) => s.portalOpen);
    const souls = useStore((s) => s.souls);
    const level = useStore((s) => s.level);
    const startRealm = useStore((s) => s.startRealm);
    const tutorial = useStore((s) => s.tutorial);
    const boonChoice = useStore((s) => s.boonChoice);
    const boons = useStore((s) => s.boons);
    const combo = useStore((s) => s.combo);
    const comboGrade = useStore((s) => s.comboGrade);
    const runStats = useStore((s) => s.runStats);
    const rankDelta = useStore((s) => s.pvpRankDelta);
    const rank = useStore((s) => s.pvpRank);
    const xpEarned = useStore((s) => s.xpEarned);
    const levelsGained = useStore((s) => s.levelsGained);
    const points = useStore((s) => freePoints(s));
    const [shareState, setShareState] = useState<'idle' | 'busy' | 'shared' | 'copied' | 'failed'>('idle');
    const [voteState, setVoteState] = useState<'idle' | 'opened' | 'copied' | 'failed'>('idle');

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (gameOver && (e.code === 'Enter' || e.code === 'Space')) {
                e.preventDefault();
                restart();
            } else if (e.code === 'Escape') {
                e.preventDefault();
                store.patch({ phase: 'menu', gameOver: false });
            } else if (e.code === 'KeyM') {
                toggleMute();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [gameOver]);

    return (
        <div className="pointer-events-none absolute inset-0 pt-safe-top">
            <div className="flex items-start gap-3 p-3">
                <div className="flex w-full max-w-[420px] flex-1 flex-col gap-1.5 rounded-xl bg-black/45 p-2.5">
                    <Bar value={hp} max={hpMax} color={hp / hpMax > 0.35 ? '#22c55e' : '#ef4444'} label="HP" />
                    <Bar value={energy} max={energyMax} color={transReady ? '#fde68a' : '#f59e0b'} label={team[activeMonster] ? T.monsters[team[activeMonster].kind].energyLabel : 'MOON'} />
                    <GuardPips hits={guardHits} broken={guardCd > 0} />
                    {trans && (
                        <div className="text-center text-[10px] font-black tracking-[0.3em] text-amber-300 tabular-nums">
                            {transLabel} {transLeft}s · +{Math.round((T.trans.dmgMult - 1) * 100)}% DMG
                        </div>
                    )}
                    <div className="flex justify-between gap-2 text-xs font-bold text-white/70 tabular-nums">
                        <span className="min-w-0 truncate">
                            {mode === 'pvp' ? `VS ${rival?.name ?? 'RIVAL'}` : `Wave ${wave}`}
                            {realmName && <span className="ml-1.5 text-[10px] font-black tracking-wider text-violet-300/80">{realmName.replace(/^THE /, '')}</span>}
                        </span>
                        <span className="shrink-0">
                            <span className="mr-1.5 rounded bg-amber-400/90 px-1 text-[10px] font-black text-black">LV {level}</span>
                            KOs {kills}
                        </span>
                    </div>
                    {portalOpen && <div className="animate-pulse text-center text-[10px] font-black tracking-[0.2em] text-violet-300">{'\u2728'} PORTAL OPEN</div>}
                    {Object.keys(boons).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {(Object.entries(boons) as [BoonId, number][]).map(([id, n]) => (
                                <span key={id} title={boonDef(id).name} className="rounded-md px-1 text-[11px] font-black text-white" style={{ background: `${boonDef(id).color}44` }}>
                                    {boonDef(id).icon}
                                    {n > 1 ? <span className="ml-0.5 text-[9px]">x{n}</span> : null}
                                </span>
                            ))}
                        </div>
                    )}
                    {challenge && (
                        <div className={`text-center text-[10px] font-black tracking-[0.15em] tabular-nums ${challengeBeaten ? 'text-emerald-300' : 'text-amber-300'}`}>
                            {challengeBeaten ? `\u2713 BEAT ${challenge.from.toUpperCase()}'S WAVE ${challenge.wave}` : `\u2694 BEAT ${challenge.from.toUpperCase()}: PASS WAVE ${challenge.wave}`}
                        </div>
                    )}
                    {bossHp && (
                        <div>
                            <div className="flex justify-between text-[10px] font-black tracking-[0.25em] text-rose-300">
                                <span>{bossHp.name}</span>
                                <span className="tabular-nums">{Math.ceil(bossHp.frac * 100)}%</span>
                            </div>
                            <div className="relative mt-0.5 h-2 overflow-hidden rounded-full bg-black/60">
                                <div className="h-full rounded-full bg-rose-500 transition-[width] duration-100" style={{ width: `${Math.max(2, bossHp.frac * 100)}%` }} />
                                {/* notch where phase 2 starts; it goes once the boss is past it */}
                                {bossHp.mark && bossHp.frac > bossHp.mark && <div className="absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${bossHp.mark * 100}%` }} />}
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex gap-1.5">
                    {team.map((m, i) => (
                        <Portrait
                            key={m.kind}
                            kind={m.kind}
                            slot={i}
                            hp={m.hp}
                            hpMax={m.hpMax}
                            active={i === activeMonster}
                            rainReady={rainReady}
                        />
                    ))}
                </div>
                <button
                    type="button"
                    aria-label="Settings"
                    className="pointer-events-auto rounded-xl bg-black/45 p-2 transition-transform active:scale-95"
                    onClick={() => {
                        audio.play('click');
                        store.patch({ paused: true });
                    }}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3.2" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                </button>
            </div>

            {cutIn && (
                <div className="absolute inset-x-0 top-[28%] flex justify-center">
                    <p className="banner-pop text-6xl font-black italic tracking-wider drop-shadow-[0_4px_0_rgba(0,0,0,0.85)]" style={{ color: cutIn.kind === 'stitched' ? '#f87171' : cutIn.kind === 'vampire' ? '#e879f9' : '#fde68a' }}>
                        {cutIn.title}
                    </p>
                </div>
            )}

            {!gameOver && <ComboMeter combo={combo} grade={comboGrade} />}
            {!gameOver && <QuestToast />}

            {boonChoice && !gameOver && <BoonPicker choice={boonChoice} owned={boons} />}

            {tutorial && !gameOver && (
                <div className="absolute inset-x-0 top-[17%] flex justify-center px-4">
                    <div key={tutorial.step} className="stay-pop w-full max-w-[380px] rounded-2xl bg-black/70 px-4 py-3 text-center ring-2 ring-amber-400/70 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black tracking-[0.3em] text-amber-300">
                                TUTORIAL {tutorial.step} / {tutorial.total}
                            </p>
                            <button
                                type="button"
                                className="pointer-events-auto rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-black tracking-wider text-white/70 active:scale-95"
                                onClick={() => {
                                    audio.play('click');
                                    store.patch({ tutorialSkip: true });
                                }}
                            >
                                SKIP
                            </button>
                        </div>
                        <p className="mt-1 text-base font-black leading-snug text-white">{tutorial.text}</p>
                        {tutorial.note && <p className="mt-0.5 text-xs font-bold text-amber-200">{tutorial.note}</p>}
                        <div className="mt-2 flex gap-1">
                            {Array.from({ length: tutorial.total }, (_, i) => (
                                <div key={i} className={`h-1 flex-1 rounded-full ${i < tutorial.step - 1 ? 'bg-amber-400' : i === tutorial.step - 1 ? 'bg-amber-200' : 'bg-white/15'}`} />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {banner && (
                <div className="absolute inset-x-0 top-[22%] flex flex-col items-center gap-2 px-6">
                    <p className="banner-pop text-5xl font-black tracking-widest text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]">{banner}</p>
                    {bannerSub && <p className="banner-pop text-center text-base font-black tracking-wide text-amber-200 drop-shadow-[0_2px_0_rgba(0,0,0,0.9)]">{bannerSub}</p>}
                </div>
            )}

            {gameOver && mode === 'pvp' && (
                <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/75 px-10 text-center">
                    <p className={`text-6xl font-black italic tracking-wide ${pvpResult === 'win' ? 'text-amber-300' : 'text-rose-400'}`}>{pvpResult === 'win' ? 'VICTORY' : 'DEFEAT'}</p>
                    <p className="text-lg font-bold text-white/80">
                        {pvpResult === 'win' ? `You beat ${rival?.name ?? 'your rival'}'s tag team` : `${rival?.name ?? 'Your rival'}'s team wins this one`}
                        {rival?.bot ? ' (bot)' : ''}
                    </p>
                    {rankDelta && (
                        <div className="flex flex-col items-center">
                            <p className={`text-xl font-black tabular-nums ${rankDelta.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                                {rankDelta.delta >= 0 ? '+' : ''}
                                {rankDelta.delta} RP
                            </p>
                            <p className="text-xs font-black tabular-nums" style={{ color: tierFor(rank.rp).color }}>
                                {tierFor(rank.rp).icon} {tierFor(rank.rp).name} · {rank.rp} RP
                            </p>
                            {rankDelta.tierUp && <p className="stay-pop mt-1 text-lg font-black text-amber-300">RANK UP: {rankDelta.tierUp.toUpperCase()}!</p>}
                        </div>
                    )}
                    {runStats && <RunSummary s={runStats} />}
                    {soulsEarned > 0 && (
                        <p className="text-sm font-black text-violet-200 tabular-nums">
                            {'\u{1F47B}'} +{soulsEarned} Souls ({souls} total)
                        </p>
                    )}
                    <XpLine xp={xpEarned} levels={levelsGained} level={level} points={points} />
                    <button
                        type="button"
                        className="w-60 rounded-2xl bg-gradient-to-b from-rose-400 to-rose-600 py-3.5 text-xl font-black text-white shadow-[0_5px_0_#881337] active:translate-y-1"
                        onClick={() => {
                            audio.play('click');
                            const s = store.get();
                            store.patch({ runId: s.runId + 1, gameOver: false });
                        }}
                    >
                        REMATCH
                    </button>
                    <button
                        type="button"
                        className="w-60 rounded-xl bg-white/10 py-2.5 text-base font-black text-white ring-1 ring-white/15 active:scale-95"
                        onClick={() => {
                            audio.play('click');
                            store.patch({ phase: 'pvp', rival: null, gameOver: false });
                        }}
                    >
                        NEW RIVAL
                    </button>
                    <button
                        type="button"
                        className="text-sm font-bold text-white/60 underline"
                        onClick={() => {
                            audio.play('click');
                            store.patch({ phase: 'menu', gameOver: false, mode: 'hunt' });
                        }}
                    >
                        Menu
                    </button>
                </div>
            )}

            {gameOver && mode !== 'pvp' && (
                <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto bg-black/70 px-10 py-6">
                    <p className="text-5xl font-black tracking-wide text-red-400">HUNTED</p>
                    <p className="text-lg font-bold text-white/80 tabular-nums">
                        Wave {finalWave} · {finalKills} KOs
                    </p>
                    {runStats && <RunSummary s={runStats} />}
                    {finalWave > bestWave && startRealm === 0 && (
                        <p className="text-sm font-black tracking-wide text-amber-300">NEW PERSONAL BEST!</p>
                    )}
                    {challenge && (
                        <p className={`text-center text-base font-black ${challengeBeaten ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {challengeBeaten ? `You beat ${challenge.from}'s wave ${challenge.wave}!` : `${challenge.from} still leads: wave ${challenge.wave}`}
                        </p>
                    )}
                    {soulsEarned > 0 && (
                        <p className="text-sm font-black text-violet-200 tabular-nums">
                            {'\u{1F47B}'} +{soulsEarned} Souls ({souls} total): spend them on skins in the menu
                        </p>
                    )}
                    <XpLine xp={xpEarned} levels={levelsGained} level={level} points={points} />
                    <p className="text-sm font-bold text-white/60 tabular-nums">
                        {dailyRank != null ? `Daily Hunts today: rank ${dailyRank}${dailyPlayers ? ` of ${dailyPlayers}` : ''}` : 'Daily Hunt: wave saved'}
                    </p>
                    <button
                        type="button"
                        className="rounded-2xl bg-amber-400 px-8 py-4 text-xl font-black text-black shadow-lg ring-2 ring-amber-200/60 transition-transform active:scale-95"
                        onClick={async () => {
                            audio.play('click');
                            setVoteState('opened');
                            setVoteState(await voteRun());
                        }}
                    >
                        {voteState === 'copied' ? 'Vote link copied — open & press Vote' : voteState === 'failed' ? 'Vote: run.world/jams/octoberjam' : 'VOTE FOR US'}
                    </button>
                    <p className="text-sm font-bold text-white/80">
                        Takes 10 seconds: opens the jam page with our card already highlighted. Sign in first if asked, then press <span className="text-amber-300">Vote</span>.
                    </p>
                    <button
                        type="button"
                        disabled={shareState === 'busy'}
                        className="rounded-xl bg-violet-500 px-6 py-2 text-base font-black text-white shadow transition-transform active:scale-95 disabled:opacity-60"
                        onClick={async () => {
                            audio.play('click');
                            setShareState('busy');
                            setShareState(await sendChallenge(finalWave, finalKills));
                        }}
                    >
                        {shareState === 'copied'
                            ? 'Challenge copied: paste it to a friend'
                            : shareState === 'shared'
                              ? 'Challenge sent!'
                              : shareState === 'failed'
                                ? 'Share from the jam page'
                                : challenge
                                  ? `\u2694 Challenge ${challenge.from} back`
                                  : `\u2694 Challenge a friend: beat wave ${finalWave}`}
                    </button>
                    <button
                        type="button"
                        className="rounded-2xl bg-amber-500 px-10 py-4 text-xl font-black text-black shadow-lg transition-transform active:scale-95"
                        onClick={restart}
                    >
                        Try again
                    </button>
                    <button
                        type="button"
                        className="text-sm font-bold text-white/60 underline"
                        onClick={() => {
                            audio.play('click');
                            store.patch({ phase: 'menu', gameOver: false });
                        }}
                    >
                        Menu
                    </button>
                </div>
            )}

            {paused && !gameOver && (
                <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-black/60 px-10">
                    <div className="flex w-64 flex-col gap-4 rounded-2xl bg-black/50 p-5 ring-1 ring-white/15">
                        <p className="text-center text-xl font-black tracking-widest text-white">PAUSED</p>
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                className={`rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 ${muted ? 'opacity-50' : ''}`}
                                onClick={toggleMute}
                            >
                                Sound: {muted ? 'OFF' : 'ON'}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 ${shake ? '' : 'opacity-50'}`}
                                onClick={() => toggleSetting('shake')}
                            >
                                Shake: {shake ? 'ON' : 'OFF'}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 ${flash ? '' : 'opacity-50'}`}
                                onClick={() => toggleSetting('flash')}
                            >
                                Flash: {flash ? 'ON' : 'OFF'}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 ${gore ? '' : 'opacity-50'}`}
                                onClick={() => toggleSetting('gore')}
                            >
                                Gore: {gore ? 'ON' : 'OFF'}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 ${damageNumbers ? '' : 'opacity-50'}`}
                                onClick={() => toggleSetting('damageNumbers')}
                            >
                                Damage numbers: {damageNumbers ? 'ON' : 'OFF'}
                            </button>
                            <button
                                type="button"
                                className={`rounded-xl bg-white/10 px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 ${lowGraphics ? '' : 'opacity-50'}`}
                                onClick={() => toggleSetting('lowGraphics')}
                            >
                                Low graphics: {lowGraphics ? 'ON' : 'OFF'}
                            </button>
                        </div>
                        <button
                            type="button"
                            className="rounded-xl bg-amber-500 px-4 py-3 text-base font-black text-black transition-transform active:scale-95"
                            onClick={() => {
                                audio.play('click');
                                store.patch({ paused: false });
                            }}
                        >
                            Resume
                        </button>
                        <button
                            type="button"
                            className="text-sm font-bold text-white/60 underline"
                            onClick={() => {
                                audio.play('click');
                                store.patch({ phase: 'menu', paused: false });
                            }}
                        >
                            Menu
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

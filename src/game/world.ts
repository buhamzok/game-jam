/**
 * The arena simulation: owns the player, the hunters and their bolts, runs
 * waves and resolves every hit between them. It draws nothing; the 3D view
 * reads its state each frame and effects go through the Fx interface.
 *
 * Time works on three clocks:
 *   - real time: effects text, overlays, camera (handled by the view);
 *   - sim time: 0 during hitstop, otherwise real time;
 *   - enemy time: sim time slowed down during Witching Hour (hunters and their bolts).
 * Units: sim units, y down (the view maps 100 units to 1 meter).
 */
import { T, DEG, type EnemyAttackDef, type SwingDef, type MonsterKind } from './tuning.ts';
import { C, type Fx } from './fxTypes.ts';
import { Player } from './player.ts';
import { Hunter, wrapAngle, type HunterKind, type WaveMods } from './hunter.ts';
import { store } from '../state/store.ts';
import type { SfxName } from './audio.ts';

/** Each monster's pain voice, transformation voice and swing. */
const HURT_VOICE: Record<MonsterKind, SfxName> = { werewolf: 'wolfHurt', vampire: 'vampHurt', stitched: 'stitchHurt' };
const TRANS_VOICE: Record<MonsterKind, SfxName> = { werewolf: 'wolfTransform', vampire: 'vampTransform', stitched: 'stitchTransform' };
const ROUND_VOICE: SfxName[] = ['vo_round1', 'vo_round2', 'vo_round3', 'vo_round4', 'vo_round5'];

/** Boss waves: the Gravelord rises every N waves. */
export function isBossWave(wave: number): boolean {
    return wave % T.difficulty.bossEvery === 0;
}

/** A crossbow bolt in flight. Reflected bolts belong to the player and hit hunters instead. */
export interface Bolt {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    dmg: number;
    owner: 'enemy' | 'player';
    /** Seconds of flight left. */
    life: number;
    /** Already passed through a dodging or invulnerable player; it cannot hit them again. */
    passed: boolean;
    trailT: number;
}

/** How a hit aimed at the player was handled. */
type HitResult = 'miss' | 'perfect' | 'dodged' | 'parried' | 'blocked' | 'immune' | 'hit';

const BOLT_R = 12;
let nextBoltId = 1;

export class World {
    readonly player: Player;
    hunters: Hunter[] = [];
    bolts: Bolt[] = [];
    /** Real seconds of Witching Hour left. */
    witching = 0;
    over = false;

    private wave = 0;
    private kills = 0;
    private waveTimer: number = T.waves.delay;
    private bannerTimer = 0;
    /** Seconds left of the Crimson Rain opportunity window after a big move. */
    private bigMoveTimer = 0;
    private rainCd = 0;
    /** Seconds left on the Stitched's Lightning Rod damage buff. */
    private rod = 0;
    /** Night Swarm: seconds until the bats bite again. */
    private auraT = 0;
    /** Real seconds since the run started (announcer timing). */
    private clock = 0;
    /** Times of recent kills, for the "multi kill" call. */
    private killTimes: number[] = [];
    private multiKillCd = 0;
    /** The player took damage this wave (no "flawless" call). */
    private waveHurt = false;
    private waveCleared = true;
    /** Delayed sim events (aftershocks), in sim time. */
    private pending: { t: number; fn: () => void }[] = [];
    private hud = {
        hp: -1,
        energy: -1,
        special: false,
        perfect: false,
        witching: false,
        wave: -1,
        kills: -1,
        active: -1,
        teamHp: '' as string,
        rain: false,
        guardHits: 0,
        guardCd: 0,
        trans: false,
        transLeft: 0,
        boss: '' as string,
    };

    constructor(readonly fx: Fx) {
        this.player = new Player(this);
        store.patch({ gameOver: false, banner: '', bannerSub: '' });
        this.syncHud();
    }

    // ---- queries -----------------------------------------------------------

    attackersActive(): number {
        let n = 0;
        for (const h of this.hunters) if (h.isAttacking()) n++;
        return n;
    }

    /** How many hunters may wind up or strike at once; grows with the wave. */
    maxAttackers(): number {
        const d = T.difficulty;
        return Math.min(d.maxAttackersCap, T.maxAttackers + Math.floor(Math.max(0, this.wave - 1) / d.attackersEvery));
    }

    nearestHunter(x: number, y: number, range: number): Hunter | null {
        let best: Hunter | null = null;
        let bestD = range;
        for (const h of this.hunters) {
            if (!h.targetable) continue;
            const d = Math.hypot(h.x - x, h.y - y) - h.r;
            if (d < bestD) {
                bestD = d;
                best = h;
            }
        }
        return best;
    }

    /** Damage multiplier on everything the active monster deals: Lightning Rod and transformations. */
    outMult(): number {
        return (this.rod > 0 ? T.tag.rodMult : 1) * (this.player.transT > 0 ? T.trans.dmgMult : 1);
    }

    /** Run `fn` after `delay` seconds of sim time (paused by hitstop). */
    later(delay: number, fn: () => void): void {
        this.pending.push({ t: delay, fn });
    }

    // ---- hit resolution ----------------------------------------------------

    /** The player's swing reaches its active frame. */
    playerSwing(s: SwingDef, kind: MonsterKind): void {
        const p = this.player;
        const half = (s.arcDeg / 2) * DEG;
        const finisher = s === T.monsters[kind].combo[T.monsters[kind].combo.length - 1];
        const swarm = kind === 'vampire' && p.transT > 0;
        this.fx.slash(p.x, p.y, p.facing, s.range * 0.85, s.arcDeg * DEG, swarm ? C.bat : finisher ? 0xffffff : C.spark, finisher ? 16 : 11);
        if (swarm) this.fx.spray(p.x, p.y, p.facing, s.arcDeg * DEG, C.bat, 10, 620, 6, 0.3);
        let hits = 0;
        const dmg = s.dmg * this.outMult();
        for (const h of this.hunters) {
            if (!h.targetable) continue;
            const dx = h.x - p.x;
            const dy = h.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d - h.r > s.range) continue;
            const ang = Math.atan2(dy, dx);
            const reach = half + Math.asin(Math.min(1, h.r / Math.max(d, 1)));
            if (d > p.r + h.r && Math.abs(wrapAngle(ang - p.facing)) > reach) continue;
            hits++;
            h.takeHit(dmg, s.poise, { angle: ang, knock: s.knock });
            this.fx.spray(h.x, h.y, ang, 1.2, C.spark, 8);
        }
        if (hits > 0) {
            p.addEnergy(T.energy.perHit * hits);
            // Night Swarm lifesteal on every landed hit
            if (swarm) p.heal(dmg * T.trans.vampire.healFrac * hits);
            this.fx.sound('hit', { volume: finisher ? 1.2 : 1 });
            if (finisher || kind === 'stitched') this.fx.sound('hitHeavy', { volume: finisher ? 1 : 0.55 });
            this.fx.freeze(s.hitstop);
            this.fx.shake(s.shake);
        }
    }

    /**
     * Shared defense check for every enemy hit: melee cones, bolts and blasts.
     * `hitsNow` says the hit covers the player's body, `hitsOrigin` that it
     * covers the spot a dodge started from (that still counts as a perfect dodge).
     */
    private resolvePlayerHit(dmg: number, fromAngle: number, hitsNow: boolean, hitsOrigin: boolean): HitResult {
        const p = this.player;
        if (!p.alive) return 'miss';
        if (p.state === 'dodge') {
            if (!hitsNow && !hitsOrigin) return 'miss';
            if (p.st <= T.dodge.perfectWindow && p.perfectCd <= 0) {
                this.perfectDodge();
                return 'perfect';
            }
            return 'dodged';
        }
        if (!hitsNow) return 'miss';
        if (p.parryOpen) return 'parried';
        if (p.state === 'guard' && p.guardBreakCd <= 0) {
            this.guardBlock();
            return 'blocked';
        }
        if (p.invuln > 0 || p.phasing) return 'immune';

        const hurtVoice = HURT_VOICE[p.kind()];
        p.takeHit(dmg, fromAngle);
        this.waveHurt = true;
        this.fx.sound('hit', { volume: 0.85 });
        this.fx.sound(hurtVoice);
        this.fx.text(p.x, p.y - 30, `-${dmg}`, C.blood, 32, 0.7);
        this.fx.burst(p.x, p.y, C.blood, 10, 300, 6, 0.35);
        this.fx.freeze(0.06);
        this.fx.shake(0.4);
        this.fx.flash(0xdc2626, 0.3);
        if (!p.alive) this.gameOver();
        return 'hit';
    }

    /** A held guard absorbs a hit: one shield pip, and the 5th breaks the guard. */
    private guardBlock(): void {
        const p = this.player;
        const broken = p.blockHit();
        this.fx.sound(broken ? 'guardBreak' : 'block');
        if (broken) this.fx.sound('hitHeavy', { volume: 0.8 });
        this.fx.text(p.x, p.y - 40, 'BLOCK', C.block, 30, 0.6);
        this.fx.ring(p.x, p.y, p.r, p.r * 2.2, C.block, 6, 0.2);
        this.fx.freeze(0.04);
        this.fx.shake(0.1);
        if (broken) {
            this.fx.text(p.x, p.y - 80, 'GUARD BREAK', C.blood, 38, 1.0);
            this.fx.ring(p.x, p.y, p.r, p.r * 3.2, C.blood, 12, 0.45);
            this.fx.shake(0.3);
        }
    }

    /** A melee hunter's attack reaches its active frame. */
    hunterStrike(h: Hunter, atk: EnemyAttackDef): void {
        const p = this.player;
        const hitsNow = h.zoneHits(atk, p.x, p.y, p.r);
        const hitsOrigin = p.state === 'dodge' && h.zoneHits(atk, p.dodgeOX, p.dodgeOY, p.r);
        const result = this.resolvePlayerHit(atk.dmg, Math.atan2(p.y - h.y, p.x - h.x), hitsNow, hitsOrigin);
        if (result !== 'parried') return;
        if (atk.heavy) {
            p.startCounter(h);
            return;
        }
        // parried jab: no damage, small push on the hunter
        h.takeHit(0, 8, { angle: Math.atan2(h.y - p.y, h.x - p.x), knock: 160 });
        this.fx.sound('parry', { volume: 0.8 });
        this.fx.text(p.x, p.y - 40, 'BLOCK', C.block, 30, 0.6);
        this.fx.ring(p.x, p.y, p.r, p.r * 2.2, C.block, 6, 0.2);
        this.fx.freeze(0.05);
        this.fx.shake(0.12);
    }

    /** The Gravelord lands its Grave Leap on the locked circle: dodge out (red), or parry it. */
    bossLand(h: Hunter, atk: EnemyAttackDef): void {
        const p = this.player;
        const r = atk.radius ?? 175;
        const x = h.x;
        const y = h.y;
        this.fx.ring(x, y, 20, r * 1.15, C.jab, 14, 0.45);
        this.fx.ring(x, y, 10, r * 0.7, 0xffffff, 8, 0.3);
        this.fx.crack(x, y, r * 1.1, C.jab, 1.4);
        this.fx.burst(x, y, 0x6b5a48, 26, 620, 9, 0.6, false);
        this.fx.shake(0.75);
        this.fx.sound('smash', { x });
        this.fx.sound('rumble', { x });
        const hitsNow = Math.hypot(p.x - x, p.y - y) <= r + p.r;
        const hitsOrigin = p.state === 'dodge' && Math.hypot(p.dodgeOX - x, p.dodgeOY - y) <= r + p.r;
        const away = Math.atan2(p.y - y, p.x - x);
        const result = this.resolvePlayerHit(atk.dmg, away, hitsNow, hitsOrigin);
        if (result === 'hit') p.push(away, 420);
        if (result !== 'parried') return;
        // parried landing: the guard holds and the golem staggers
        h.takeHit(0, 30, { angle: Math.atan2(h.y - p.y, h.x - p.x), knock: 160 });
        this.fx.sound('parry');
        this.fx.text(p.x, p.y - 40, 'BLOCK', C.block, 30, 0.6);
        this.fx.ring(p.x, p.y, p.r, p.r * 2.2, C.block, 6, 0.2);
        this.fx.freeze(0.06);
    }

    /** Half hp: the Gravelord roars into phase 2, pushes the player away and raises two hunters. */
    onBossEnrage(h: Hunter): void {
        const p = this.player;
        const t = T.boss.roar;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d < t.pushRadius) p.push(Math.atan2(p.y - h.y, p.x - h.x), t.push * (1 - d / t.pushRadius) + 200);
        this.fx.ring(h.x, h.y, h.r, t.pushRadius, C.blood, 16, 0.6);
        this.fx.ring(h.x, h.y, h.r, t.pushRadius * 1.5, C.heavy, 10, 0.8);
        this.fx.crack(h.x, h.y, t.pushRadius * 0.9, C.blood, 1.6);
        this.fx.burst(h.x, h.y, 0x3b3630, 30, 520, 9, 0.7, false);
        this.fx.text(h.x, h.y - 150, 'ENRAGED', C.blood, 48, 1.4);
        this.fx.freeze(0.18);
        this.fx.shake(0.9);
        this.fx.flash(C.blood, 0.35);
        this.fx.sound('growl', { x: h.x, volume: 1.3 });
        this.fx.sound('rumble', { x: h.x });
        this.fx.sound('bell', { delay: 0.3 });
        store.patch({ banner: 'GRAVELORD ENRAGED', bannerSub: 'The dead rise. Watch for the leap!' });
        this.bannerTimer = T.waves.bannerTime + 0.4;
        const mods = this.waveMods();
        for (let i = 0; i < t.adds; i++) {
            const ang = Math.random() * Math.PI * 2;
            const b = this.bounds(T.hunter.radius);
            const x = Math.max(b.x0, Math.min(b.x1, h.x + Math.cos(ang) * 260));
            const y = Math.max(b.y0, Math.min(b.y1, h.y + Math.sin(ang) * 260));
            this.hunters.push(new Hunter(this, x, y, i % 2 === 0 ? 'knight' : 'barbarian', mods));
            this.fx.ring(x, y, 10, 90, C.blood, 8, 0.5);
        }
    }

    /** The Gravelord falls: slow motion, every hunter left crumbles, the team heals and refills. */
    onBossKilled(h: Hunter): void {
        const p = this.player;
        this.fx.freeze(0.45);
        this.fx.flash(0xffffff, 0.6);
        this.fx.shake(1);
        this.fx.ring(h.x, h.y, h.r, 520, 0xfde68a, 18, 0.9);
        this.fx.ring(h.x, h.y, h.r, 320, 0xffffff, 10, 0.6);
        this.fx.burst(h.x, h.y, 0x3b3630, 40, 640, 10, 0.9, false);
        this.fx.burst(h.x, h.y, 0xfde68a, 30, 520, 7, 0.8);
        this.fx.text(h.x, h.y - 170, 'GRAVELORD FALLS', 0xfde68a, 52, 1.8);
        this.fx.sound('rumble', { volume: 1.2 });
        this.fx.sound('bell', { delay: 0.2 });
        this.fx.sound('vo_flawless', { delay: 1.0 });
        for (const o of this.hunters) if (o !== h) o.crumble();
        for (const m of p.team) {
            if (!m.alive) continue;
            m.hp = Math.min(T.monsters[m.kind].hp, m.hp + T.monsters[m.kind].hp * T.boss.killHeal);
            m.energy = T.energy.max;
        }
        this.fx.text(p.x, p.y - 90, `+${Math.round(T.boss.killHeal * 100)}% HP`, C.rod, 32, 1.4);
        store.patch({ banner: 'GRAVELORD DEFEATED', bannerSub: 'Your team heals and powers up' });
        this.bannerTimer = T.waves.bannerTime + 1;
        // no "flawless" call from the wave-clear check on top of this one
        this.waveHurt = true;
    }

    /** The rogue fires: a bolt leaves along its locked aim line. */
    fireBolt(h: Hunter, atk: EnemyAttackDef): void {
        const speed = atk.speed ?? 1000;
        const cx = Math.cos(h.facing);
        const cy = Math.sin(h.facing);
        this.bolts.push({
            id: nextBoltId++,
            x: h.x + cx * (h.r + 10),
            y: h.y + cy * (h.r + 10),
            vx: cx * speed,
            vy: cy * speed,
            dmg: atk.dmg,
            owner: 'enemy',
            life: atk.range / speed + 0.25,
            passed: false,
            trailT: 0,
        });
        this.fx.spray(h.x + cx * h.r, h.y + cy * h.r, h.facing, 0.5, C.bolt, 6, 300, 4, 0.2);
        this.fx.sound('crossbow', { x: h.x });
    }

    /** The mage's circle detonates. */
    blast(h: Hunter, atk: EnemyAttackDef, x: number, y: number): void {
        const p = this.player;
        const r = atk.radius ?? 120;
        this.fx.ring(x, y, 10, r * 1.1, C.heavy, 14, 0.45);
        this.fx.burst(x, y, C.heavy, 22, 420, 7, 0.45);
        this.fx.shake(0.15);
        this.fx.sound('mageBlast', { x });
        const hitsNow = Math.hypot(p.x - x, p.y - y) <= r + p.r;
        const hitsOrigin = p.state === 'dodge' && Math.hypot(p.dodgeOX - x, p.dodgeOY - y) <= r + p.r;
        const result = this.resolvePlayerHit(atk.dmg, Math.atan2(p.y - y, p.x - x), hitsNow, hitsOrigin);
        if (result !== 'parried') return;
        // parried blast: warp to the mage and counter it
        const steps = 6;
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            this.fx.trail(p.x + (h.x - p.x) * t, p.y + (h.y - p.y) * t, C.counter, p.r, 0.35);
        }
        p.startCounter(h);
    }

    private updateBolts(enemyDt: number, dt: number): void {
        const p = this.player;
        const hw = T.arena.w / 2;
        const hh = T.arena.h / 2;
        for (const b of this.bolts) {
            const bdt = b.owner === 'enemy' ? enemyDt : dt;
            if (bdt <= 0) continue;
            b.x += b.vx * bdt;
            b.y += b.vy * bdt;
            b.life -= bdt;
            b.trailT -= bdt;
            if (b.trailT <= 0) {
                b.trailT = 0.03;
                this.fx.trail(b.x, b.y, b.owner === 'enemy' ? C.bolt : C.counter, 16, 0.22);
            }
            if (Math.abs(b.x) > hw || Math.abs(b.y) > hh) b.life = 0;
            if (b.life <= 0) continue;

            if (b.owner === 'player') {
                for (const h of this.hunters) {
                    if (!h.targetable || Math.hypot(h.x - b.x, h.y - b.y) > h.r + BOLT_R) continue;
                    const ang = Math.atan2(b.vy, b.vx);
                    h.takeHit(T.reflect.dmg * this.outMult(), T.reflect.poise, { angle: ang, knock: 260 });
                    this.fx.sound('boltHit', { x: h.x });
                    this.fx.sound('hit', { x: h.x });
                    this.fx.spray(h.x, h.y, ang, 1.2, C.counter, 12, 480, 6, 0.35);
                    this.fx.freeze(0.06);
                    this.fx.shake(0.25);
                    b.life = 0;
                    break;
                }
                continue;
            }
            if (b.passed) continue;
            const hitsNow = Math.hypot(p.x - b.x, p.y - b.y) <= p.r + BOLT_R;
            const hitsOrigin = p.state === 'dodge' && Math.hypot(p.dodgeOX - b.x, p.dodgeOY - b.y) <= p.r + BOLT_R;
            const result = this.resolvePlayerHit(b.dmg, Math.atan2(b.vy, b.vx), hitsNow, hitsOrigin);
            if (result === 'miss') continue;
            if (result === 'hit' || result === 'blocked') this.fx.sound('boltHit', { x: b.x });
            if (result === 'parried') this.reflectBolt(b);
            else if (result === 'perfect' || result === 'dodged' || result === 'immune') b.passed = true;
            else b.life = 0;
        }
        this.bolts = this.bolts.filter((b) => b.life > 0);
    }

    /** Parried bolt: it flies back at the nearest hunter (usually the shooter). */
    private reflectBolt(b: Bolt): void {
        const p = this.player;
        const speed = Math.hypot(b.vx, b.vy) * T.reflect.speedMult;
        const target = this.nearestHunter(p.x, p.y, 2000);
        const ang = target ? Math.atan2(target.y - b.y, target.x - b.x) : Math.atan2(-b.vy, -b.vx);
        b.vx = Math.cos(ang) * speed;
        b.vy = Math.sin(ang) * speed;
        b.owner = 'player';
        b.life = 2;
        p.addEnergy(T.energy.perCounter * 0.5);
        this.fx.sound('parry');
        this.fx.text(p.x, p.y - 50, 'DEFLECT!', C.counter, 40, 0.9);
        this.fx.ring(p.x, p.y, p.r, p.r * 3, C.counter, 10, 0.3);
        this.fx.freeze(0.08);
        this.fx.shake(0.3);
        this.fx.flash(C.counter, 0.2);
    }

    private perfectDodge(): void {
        const p = this.player;
        this.witching = T.witching.duration;
        p.perfectCd = T.witching.cooldown;
        p.addEnergy(T.energy.perPerfect);
        this.fx.sound('witching');
        this.fx.text(p.x, p.y - 60, 'WITCHING HOUR', C.counter, 40, 1.1);
        this.fx.ring(p.x, p.y, p.r, 260, C.heavy, 10, 0.45);
        this.fx.shake(0.15);
        this.fx.flash(C.counter, 0.25);
    }

    /** The counter's zip reaches the hunter. */
    counterStrike(h: Hunter): void {
        const p = this.player;
        const ang = Math.atan2(h.y - p.y, h.x - p.x);
        const c = T.counter;
        h.takeHit(c.dmg * this.outMult(), c.poise, { angle: ang, knock: c.knock });
        p.addEnergy(T.energy.perCounter);
        this.bigMoveTimer = T.tag.rainWindow;
        this.fx.sound('parry');
        this.fx.sound('hit', { volume: 1.2 });
        this.fx.sound('hitHeavy');
        this.fx.text(p.x, p.y - 60, 'COUNTER!', C.counter, 46, 1.0);
        this.fx.slash(p.x, p.y, ang, 120, 200 * DEG, 0xffffff, 18, 0.2);
        this.fx.spray(h.x, h.y, ang, 1.6, C.counter, 16, 560, 7, 0.4);
        this.fx.ring(h.x, h.y, h.r, h.r * 4, C.counter, 10, 0.4);
        this.fx.freeze(c.hitstop);
        this.fx.shake(0.6);
        this.fx.flash(C.counter, 0.35);
    }

    // ---- transformations ---------------------------------------------------

    /** Q pressed with a full bar: cut-in card and flash while the transform pose plays. */
    onTransBegin(kind: MonsterKind): void {
        this.fx.sound(TRANS_VOICE[kind]);
        if (kind === 'vampire') this.fx.sound('wings', { delay: 0.35 });
        if (kind === 'stitched') this.fx.sound('zap', { delay: 0.3 });
        this.fx.flash(0xffffff, 0.3);
        this.fx.freeze(0.2);
        this.fx.shake(0.3);
        store.patch({ cutIn: { kind, title: T.trans[kind].label } });
        setTimeout(() => store.patch({ cutIn: null }), 1000);
    }

    /** The transform pose ends and the form kicks in. */
    onTransStart(kind: MonsterKind): void {
        const p = this.player;
        const fx = this.fx;
        if (kind === 'stitched') {
            // Red Overcharge: heal the team, shock nearby hunters
            const t = T.trans.stitched;
            for (const m of p.team) {
                if (!m.alive) continue;
                m.hp = Math.min(T.monsters[m.kind].hp, m.hp + T.monsters[m.kind].hp * t.teamHealFrac);
            }
            for (const h of this.hunters) {
                if (!h.targetable) continue;
                const d = Math.hypot(h.x - p.x, h.y - p.y);
                if (d > t.shockRadius) continue;
                h.takeHit(t.shockDmg, t.shockPoise, { angle: Math.atan2(h.y - p.y, h.x - p.x), knock: t.shockKnock });
            }
            fx.ring(p.x, p.y, p.r, t.shockRadius, C.overcharge, 14, 0.5);
            fx.crack(p.x, p.y, t.shockRadius * 0.8, C.overcharge, 1.2);
            fx.burst(p.x, p.y, C.overcharge, 24, 520, 7, 0.5);
        }
        if (kind === 'vampire') {
            // she breaks apart into the swarm
            fx.burst(p.x, p.y, C.bat, 30, 480, 8, 0.6, false);
            fx.ring(p.x, p.y, p.r, p.r * 4, C.counter, 12, 0.6);
            this.auraT = 0.2;
        }
        if (kind === 'werewolf') {
            fx.ring(p.x, p.y, p.r, p.r * 4, C.wolf, 12, 0.6);
            fx.burst(p.x, p.y, 0x111111, 24, 420, 9, 0.6, false);
        }
        fx.text(p.x, p.y - 110, `+${Math.round((T.trans.dmgMult - 1) * 100)}% DMG`, 0xfde68a, 30, 1.2);
        fx.shake(0.35);
        this.syncHud();
    }

    onTransEnd(kind: MonsterKind): void {
        const p = this.player;
        const fx = this.fx;
        if (kind === 'werewolf') {
            // howl shockwave
            const t = T.trans.werewolf;
            for (const h of this.hunters) {
                if (!h.targetable) continue;
                const d = Math.hypot(h.x - p.x, h.y - p.y);
                if (d > t.endRadius) continue;
                h.takeHit(t.endDmg, 40, { angle: Math.atan2(h.y - p.y, h.x - p.x), knock: t.endKnock });
            }
            fx.ring(p.x, p.y, p.r, t.endRadius, C.wolf, 14, 0.5);
            fx.text(p.x, p.y - 80, 'HOWL', C.wolf, 40, 1.0);
            fx.sound('growl');
            fx.sound('rumble');
            fx.shake(0.35);
        }
        if (kind === 'vampire') fx.burst(p.x, p.y, C.bat, 20, 360, 7, 0.5, false);
    }

    /** Night Swarm: the bats bite every hunter close to the swarm. */
    private updateAura(dt: number): void {
        const p = this.player;
        if (p.transT <= 0 || p.kind() !== 'vampire' || dt <= 0) return;
        const t = T.trans.vampire;
        this.auraT -= dt;
        if (this.auraT > 0) return;
        this.auraT = t.auraInterval;
        for (const h of this.hunters) {
            if (!h.targetable || Math.hypot(h.x - p.x, h.y - p.y) - h.r > t.auraRadius) continue;
            h.takeHit(t.auraDmg * this.outMult(), 4, { angle: Math.atan2(h.y - p.y, h.x - p.x), knock: 30 });
            this.fx.burst(h.x, h.y, C.bat, 5, 220, 5, 0.25);
        }
    }

    // ---- specials ----------------------------------------------------------

    /** Swarm Slam on the way: each hunter the swarm flies through is bitten once. */
    swarmBite(x: number, y: number, bitten: Set<number>): void {
        const p = this.player;
        const pc = T.monsters.vampire.special;
        for (const h of this.hunters) {
            if (!h.targetable || bitten.has(h.id)) continue;
            if (Math.hypot(h.x - x, h.y - y) > p.r + h.r + 30) continue;
            bitten.add(h.id);
            const ang = Math.atan2(h.y - y, h.x - x);
            h.takeHit((pc.pathDmg ?? 8) * this.outMult(), 10, { angle: ang, knock: 90 });
            this.fx.sound('hit', { volume: 0.5, x: h.x });
            this.fx.spray(h.x, h.y, ang, 1.4, C.bat, 8, 360, 5, 0.3);
        }
    }

    /** Moon Pounce lands, the Swarm Slam dives, or the Thunder Smash hits the ground: area hit around (x, y). */
    specialLand(kind: MonsterKind, x: number, y: number): void {
        const pc = T.monsters[kind].special;
        const transformedRed = kind === 'stitched' && this.player.transT > 0;
        const color = kind === 'vampire' ? C.counter : kind === 'stitched' ? (transformedRed ? C.overcharge : C.rod) : C.wolf;
        const hits = this.areaHit(x, y, pc.radius, pc.dmg, pc.poise, pc.knock);
        if (hits > 0) this.bigMoveTimer = T.tag.rainWindow;
        this.fx.ring(x, y, 20, pc.radius * 1.25, color, 14, 0.45);
        this.fx.ring(x, y, 10, pc.radius * 0.8, 0xffffff, 8, 0.3);
        this.fx.burst(x, y, color, 24, 520, 8, 0.5);
        this.fx.freeze(hits > 0 ? pc.hitstop : 0.05);
        this.fx.shake(0.7);
        this.fx.flash(color, 0.25);

        if (pc.style === 'smash') {
            this.fx.sound('smash');
            this.fx.sound('rumble');
            this.fx.sound('hitHeavy');
        } else {
            this.fx.sound('hit', { volume: 1.3 });
            this.fx.sound('hitHeavy');
            if (pc.style === 'swarm') this.fx.sound('wings', { volume: 0.7 });
        }
        if (pc.style === 'swarm') this.fx.burst(x, y, C.bat, 26, 560, 8, 0.5, false);
        if (pc.style === 'smash') {
            // ground cracks, debris, then an aftershock ring a beat later
            this.fx.crack(x, y, pc.radius * 1.1, color, 1.4);
            this.fx.burst(x, y, 0x6b5a48, 26, 620, 9, 0.6, false);
            this.fx.shake(0.3);
            this.later(pc.shockDelay ?? 0.22, () => {
                const r = pc.shockRadius ?? 380;
                this.areaHit(x, y, r, pc.shockDmg ?? 15, 20, 220);
                this.fx.ring(x, y, pc.radius, r, color, 10, 0.4);
                this.fx.burst(x, y, 0x6b5a48, 14, 700, 7, 0.45, false);
                this.fx.shake(0.35);
                this.fx.sound('rumble', { volume: 0.7 });
            });
        }
    }

    /** Hit every targetable hunter within `radius` of (x, y); returns how many were hit. `own`: the active monster's hit, so buffs apply. */
    private areaHit(x: number, y: number, radius: number, dmg: number, poise: number, knock: number, own = true): number {
        let hits = 0;
        const d0 = own ? dmg * this.outMult() : dmg;
        for (const h of this.hunters) {
            if (!h.targetable) continue;
            const d = Math.hypot(h.x - x, h.y - y);
            if (d - h.r > radius) continue;
            hits++;
            h.takeHit(d0, poise, { angle: Math.atan2(h.y - y, h.x - x), knock });
        }
        return hits;
    }

    /** Swap-in turn: a quick 360 spin around the arriving monster. */
    entryStrike(kind: MonsterKind): void {
        const p = this.player;
        const hits = this.areaHit(p.x, p.y, T.tag.entryRange, T.tag.entryDmg, T.tag.entryPoise, 220);
        if (hits > 0) {
            this.bigMoveTimer = T.tag.rainWindow;
            this.fx.sound('hit', { volume: 0.7 });
        }
        this.fx.ring(p.x, p.y, p.r, T.tag.entryRange * 1.15, this.entryColor(kind), 8, 0.25);
        this.fx.freeze(hits > 0 ? 0.04 : 0);
        this.fx.shake(0.18);
    }

    /** A benched monster (the Vampire's bats) pokes the nearest hunter from off-field. */
    offFieldStrike(kind: MonsterKind, dmg: number): void {
        const p = this.player;
        let target: Hunter | null = null;
        let bestD = Infinity;
        for (const h of this.hunters) {
            if (!h.targetable) continue;
            const d = Math.hypot(h.x - p.x, h.y - p.y);
            if (d < bestD) {
                bestD = d;
                target = h;
            }
        }
        if (!target) return;
        const color = kind === 'vampire' ? C.counter : kind === 'stitched' ? C.rod : C.spark;
        target.takeHit(dmg, 4, { angle: Math.atan2(target.y - p.y, target.x - p.x), knock: 40 });
        this.fx.burst(target.x, target.y, color, kind === 'vampire' ? 10 : 8, 260, 5, 0.32);
        this.fx.spray(target.x, target.y, Math.atan2(target.y - p.y, target.x - p.x), 0.8, color, 6);
        this.unitEnergy(8);
    }

    /** Credits the Vampire's own energy bar a small amount per off-field hit. */
    private unitEnergy(n: number): void {
        const m = this.player.team.find((u) => u !== this.player.unit());
        if (m && m.alive) m.energy = Math.min(T.energy.max, m.energy + n);
    }

    /** Signature color per monster for rings and bats. */
    private entryColor(kind: MonsterKind): number {
        return kind === 'vampire' ? C.counter : kind === 'stitched' ? C.rod : C.wolf;
    }

    /** The Vampire's Crimson Rain: a backline strike after a teammate's big move. */
    private crimsonRain(): void {
        const center = { x: this.player.x, y: this.player.y };
        const t = T.tag;
        this.areaHit(center.x, center.y, t.rainRadius, t.rainDmg, t.rainPoise, 200, false);
        this.player.addEnergy(t.rainDmg); // the strike motivates the arriving ally a little
        this.fx.sound('wings');
        this.fx.sound('hit', { volume: 1.1 });
        this.fx.sound('hitHeavy');
        this.fx.ring(center.x, center.y, 20, t.rainRadius * 1.2, C.counter, 16, 0.55);
        this.fx.burst(center.x, center.y, C.counter, 30, 560, 9, 0.6);
        this.fx.freeze(0.1);
        this.fx.shake(0.5);
        this.fx.flash(C.counter, 0.3);
        this.fx.text(center.x, center.y - 80, 'CRIMSON RAIN', C.counter, 40, 1.1);
    }

    /** Swap key pressed: if the target is the Vampire while a big-move window is open, Crimson Rain; else swap.
     *  Swapping out of a living Stitched leaves a Lightning Rod buff on the field. */
    requestSwap(target: number): void {
        const p = this.player;
        if (target === p.active) return;
        if (target === 1 && this.bigMoveTimer > 0 && this.rainCd <= 0 && p.team[1].alive) {
            this.bigMoveTimer = 0;
            this.rainCd = T.tag.rainCooldown;
            this.crimsonRain();
            return;
        }
        if (!p.team[target].alive) return;
        if (p.team[p.active].kind === 'stitched' && p.team[p.active].alive) {
            this.rod = T.tag.rodDuration;
            this.fx.ring(p.x, p.y, p.r + 10, p.r * 2.6, C.rod, 10, 0.5);
            this.fx.text(p.x, p.y - 80, 'LIGHTNING ROD', C.rod, 32, 1.0);
            this.fx.sound('zap');
        }
        p.beginSwap(target, true);
    }

    /** Which monster came in; the view uses it for the entry flash. */
    onSwap(): void {
        this.fx.sound('swap');
        this.fx.flash(0xffffff, 0.12);
        this.syncHud();
    }

    onMonsterDown(kind: MonsterKind): void {
        this.fx.sound('monsterDown');
        this.fx.text(this.player.x, this.player.y - 90, 'DOWN!', C.blood, 34, 1.0);
        void kind;
    }

    onHunterKilled(): void {
        this.kills++;
        // three kills in two seconds: the announcer calls it
        this.killTimes = this.killTimes.filter((t) => this.clock - t < 2);
        this.killTimes.push(this.clock);
        if (this.killTimes.length >= 3 && this.multiKillCd <= 0) {
            this.fx.sound('vo_multikill', { delay: 0.15 });
            this.multiKillCd = 8;
            this.killTimes = [];
        }
    }

    // ---- frame -------------------------------------------------------------

    update(realDt: number): void {
        if (this.over) return;
        let dt = realDt;
        if (this.fx.hitstop > 0) {
            this.fx.hitstop -= realDt;
            dt = 0;
        }
        this.witching = Math.max(0, this.witching - realDt);
        this.clock += realDt;
        this.multiKillCd = Math.max(0, this.multiKillCd - realDt);
        const enemyDt = dt * (this.witching > 0 ? T.witching.enemyTimeScale : 1);

        this.player.update(dt);
        for (const h of this.hunters) h.update(enemyDt);
        this.updateBolts(enemyDt, dt);
        this.updateAura(dt);
        this.updatePending(dt);
        this.separate();
        this.clampToArena();
        this.hunters = this.hunters.filter((h) => !h.removable);
        this.bigMoveTimer = Math.max(0, this.bigMoveTimer - realDt);
        this.rainCd = Math.max(0, this.rainCd - realDt);
        this.rod = Math.max(0, this.rod - realDt);
        this.updateWaves(realDt);
        this.syncHud();
    }

    private updatePending(dt: number): void {
        if (dt <= 0 || this.pending.length === 0) return;
        const due: (() => void)[] = [];
        for (const e of this.pending) {
            e.t -= dt;
            if (e.t <= 0) due.push(e.fn);
        }
        this.pending = this.pending.filter((e) => e.t > 0);
        for (const fn of due) fn();
    }

    /** Sim time for this frame, for views that animate with the action (0 during hitstop). */
    simScale(): number {
        return this.fx.hitstop > 0 || this.over ? 0 : 1;
    }

    private separate(): void {
        const p = this.player;
        const list = this.hunters.filter((h) => h.alive);
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            for (let j = i + 1; j < list.length; j++) {
                const b = list[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const d = Math.hypot(dx, dy) || 0.01;
                const min = a.r + b.r + 4;
                if (d < min) {
                    const push = (min - d) / 2;
                    a.x -= (dx / d) * push;
                    a.y -= (dy / d) * push;
                    b.x += (dx / d) * push;
                    b.y += (dy / d) * push;
                }
            }
            if (!p.phasing && p.alive) {
                const dx = a.x - p.x;
                const dy = a.y - p.y;
                const d = Math.hypot(dx, dy) || 0.01;
                const min = a.r + p.r;
                if (d < min) {
                    const push = min - d;
                    a.x += (dx / d) * push * 0.75;
                    a.y += (dy / d) * push * 0.75;
                    p.x -= (dx / d) * push * 0.25;
                    p.y -= (dy / d) * push * 0.25;
                }
            }
        }
    }

    /** Walkable box for a body of radius r: inside the fence, never in it. */
    bounds(r: number): { x0: number; x1: number; y0: number; y1: number } {
        const a = T.arena;
        const hw = a.w / 2;
        const hh = a.h / 2;
        return { x0: -hw + a.wall + r, x1: hw - a.wall - r, y0: -hh + a.wall + r, y1: hh - a.nearWall - r };
    }

    private clampToArena(): void {
        const clamp = (o: { x: number; y: number; r: number }) => {
            const b = this.bounds(o.r);
            o.x = Math.max(b.x0, Math.min(b.x1, o.x));
            o.y = Math.max(b.y0, Math.min(b.y1, o.y));
        };
        clamp(this.player);
        for (const h of this.hunters) clamp(h);
    }

    /** Multipliers for hunters spawned in the current wave. */
    private waveMods(): WaveMods {
        const n = Math.max(0, this.wave - 1);
        const f = (s: { step: number; cap: number }) => (s.step >= 0 ? Math.min(s.cap, 1 + s.step * n) : Math.max(s.cap, 1 + s.step * n));
        const d = T.difficulty;
        return { hp: f(d.hp), dmg: f(d.dmg), speed: f(d.speed), windup: f(d.windup), cooldown: f(d.cooldown) };
    }

    /** Who spawns this wave; boss waves cut the small roster so the duel stays readable. */
    private roster(): HunterKind[] {
        const w = this.wave;
        const d = T.difficulty;
        let count = Math.min(T.waves.max, T.waves.base + (w - 1) * T.waves.perWave);
        if (isBossWave(w) && count > 3) count = 3;
        const mages = w >= d.mageFrom ? Math.min(2, 1 + Math.floor((w - d.mageFrom) / 2)) : 0;
        const rogues = w >= d.rogueFrom ? Math.min(2, 1 + Math.floor((w - d.rogueFrom) / 2)) : 0;
        const kinds: HunterKind[] = [];
        for (let i = 0; i < mages; i++) kinds.push('mage');
        for (let i = 0; i < rogues; i++) kinds.push('rogue');
        while (kinds.length < count) kinds.push(w >= d.barbarianFrom && Math.random() < 0.4 ? 'barbarian' : 'knight');
        return kinds;
    }

    private bannerSubtitle(): string {
        const d = T.difficulty;
        if (isBossWave(this.wave)) return 'THE GRAVELORD RISES';
        if (this.wave === d.barbarianFrom) return 'Barbarians join the hunt';
        if (this.wave === d.rogueFrom) return 'Crossbow rogues: dodge the red line';
        if (this.wave === d.mageFrom) return 'Mages: get out of the purple circle';
        return this.wave > 1 ? 'The hunters grow stronger' : '';
    }

    private updateWaves(dt: number): void {
        if (this.bannerTimer > 0) {
            this.bannerTimer -= dt;
            if (this.bannerTimer <= 0) store.patch({ banner: '', bannerSub: '' });
        }
        if (this.hunters.length > 0) return;
        if (!this.waveCleared) {
            // wave cleared: a flawless one gets its own call
            this.waveCleared = true;
            if (!this.waveHurt && this.wave > 0) this.fx.sound('vo_flawless', { delay: 0.3 });
            if (this.wave > 0 && !isBossWave(this.wave)) {
                const p = this.player;
                this.fx.text(p.x, p.y - 110, this.waveHurt ? 'WAVE CLEAR' : 'FLAWLESS', this.waveHurt ? 0xfde68a : C.counter, 40, 1.2);
                this.fx.ring(p.x, p.y, p.r, 220, 0xfde68a, 8, 0.45);
            }
            this.waveTimer = this.waveHurt ? T.waves.delay : T.waves.delay + 1;
        }
        this.waveTimer -= dt;
        if (this.waveTimer > 0) return;
        this.wave++;
        this.waveTimer = T.waves.delay;
        const mods = this.waveMods();
        const bossWave = isBossWave(this.wave);
        if (bossWave) this.spawnBoss(mods);
        for (const kind of this.roster()) this.spawnHunter(kind, mods);
        store.patch({ banner: bossWave ? `WAVE ${this.wave} - GRAVELORD` : `WAVE ${this.wave}`, bannerSub: this.bannerSubtitle() });
        this.waveHurt = false;
        this.waveCleared = false;
        // the announcer calls rounds 1 to 5 ("Round one... Fight!"), then the graveyard bell tolls
        if (bossWave) {
            this.fx.sound('bell');
            this.fx.sound('rumble', { delay: 0.4 });
        } else if (this.wave <= ROUND_VOICE.length) this.fx.sound(ROUND_VOICE[this.wave - 1]);
        else this.fx.sound('bell');
        if (this.wave === 1) this.fx.sound('vo_fight', { delay: 1.25 });
        this.bannerTimer = T.waves.bannerTime + 0.6;
    }

    /** The boss slams in from the edge: rise, then a shockwave ring, plus a roar. */
    private spawnBoss(mods: WaveMods): void {
        const hw = T.arena.w / 2 - 120;
        const hh = T.arena.h / 2 - 120;
        const p = this.player;
        const ang = Math.random() * Math.PI * 2;
        const x = Math.cos(ang) * hw;
        const y = Math.sin(ang) * hh;
        this.hunters.push(new Hunter(this, x, y, 'boss', mods));
        this.fx.sound('vo_round5', { delay: 0.8 });
        this.fx.ring(x, y, 10, 240, C.heavy, 14, 0.8);
        this.fx.burst(x, y, 0x3b3630, 26, 420, 9, 0.7, false);
        this.fx.shake(0.5);
        this.fx.sound('rumble');
    }

    private spawnHunter(kind: HunterKind, mods: WaveMods): void {
        const hw = T.arena.w / 2 - 80;
        const hh = T.arena.h / 2 - 80;
        const p = this.player;
        let x = 0;
        let y = 0;
        for (let tries = 0; tries < 20; tries++) {
            x = (Math.random() * 2 - 1) * hw;
            y = (Math.random() * 2 - 1) * hh;
            if (Math.hypot(x - p.x, y - p.y) >= T.waves.minSpawnDistance) break;
        }
        this.hunters.push(new Hunter(this, x, y, kind, mods));
        this.fx.ring(x, y, 10, 70, kind === 'rogue' ? C.bolt : kind === 'mage' ? C.heavy : C.jab, 6, 0.5);
    }

    private gameOver(): void {
        this.over = true;
        this.fx.sound('gameOver');
        this.fx.sound('vo_gameover', { delay: 0.9 });
        this.witching = 0;
        store.patch({ gameOver: true, finalWave: this.wave, finalKills: this.kills, banner: '', bannerSub: '' });
        // Daily Hunt: remember the run and (when it beat the old best) score it
        // on the RUN daily board. Never blocks or throws into the sim.
        void import('../sdk/dailyHunt.ts')
            .then((h) => Promise.all([h.submitRun(this.wave, this.clock, this.kills), h.telemetry('run_end', { wave: this.wave, kills: this.kills, seconds: Math.round(this.clock) }), h.fetchDailyBoard()]))
            .catch(() => undefined);
    }

    private syncHud(): void {
        const p = this.player;
        const u = p.unit();
        const teamKey = `${p.active}|${p.team.map((m) => `${Math.ceil(m.hp)}|${m.alive}`).join('|')}`;
        const boss = this.hunters.find((h) => h.def.boss);
        const bossKey = boss && boss.alive ? `${Math.ceil(boss.hp)}|${boss.hpMax}|${boss.phase}` : '';
        const next = {
            hp: Math.ceil(u.hp),
            energy: Math.floor(u.energy),
            special: u.energy >= T.energy.max,
            perfect: p.perfectCd <= 0,
            witching: this.witching > 0,
            wave: this.wave,
            kills: this.kills,
            active: p.active,
            teamHp: teamKey,
            boss: bossKey,
            rain: this.bigMoveTimer > 0 && this.rainCd <= 0,
            guardHits: p.guardHits,
            // during cooldown patch in 0.1 s steps so the button ring animates
            guardCd: p.guardBreakCd <= 0 ? 0 : Math.ceil(p.guardBreakCd * 10) / 10,
            trans: p.transT > 0,
            transLeft: Math.ceil(p.transT),
        };
        const h = this.hud;
        if (
            next.hp !== h.hp ||
            next.energy !== h.energy ||
            next.special !== h.special ||
            next.perfect !== h.perfect ||
            next.witching !== h.witching ||
            next.wave !== h.wave ||
            next.kills !== h.kills ||
            next.active !== h.active ||
            next.teamHp !== h.teamHp ||
            next.rain !== h.rain ||
            next.guardHits !== h.guardHits ||
            next.guardCd !== h.guardCd ||
            next.trans !== h.trans ||
            next.transLeft !== h.transLeft ||
            next.boss !== h.boss
        ) {
            this.hud = next;
            store.patch({
                hp: next.hp,
                energy: next.energy,
                specialReady: next.special,
                perfectReady: next.perfect,
                witching: next.witching,
                wave: next.wave,
                kills: next.kills,
                activeMonster: next.active,
                swapReady: p.swapCd <= 0,
                rainReady: next.rain,
                guardHits: next.guardHits,
                guardCd: next.guardCd,
                trans: next.trans,
                transLeft: next.transLeft,
                transLabel: next.trans ? T.trans[u.kind].label : '',
                team: p.team.map((m) => ({ kind: m.kind, hp: Math.ceil(m.hp), hpMax: T.monsters[m.kind].hp, alive: m.alive })),
                bossHp: next.boss
                    ? { frac: Math.max(0, Math.ceil(Number(next.boss.split('|')[0])) / Number(next.boss.split('|')[1])), name: boss!.phase === 2 ? 'GRAVELORD · ENRAGED' : 'GRAVELORD', mark: T.boss.enrageAt }
                    : null,
            });
        }
    }
}

/**
 * Monster hunter (simulation only; the 3D view reads its state).
 *
 * Melee kinds (knight, barbarian) walk up and wind up one of two attacks,
 * each with a ground telegraph:
 *   - jab (red): dodge or guard it.
 *   - heavy (purple): guard it at the right moment to counter.
 * Ranged kinds keep their distance:
 *   - rogue: aims along a red line, then fires a crossbow bolt (dodge it,
 *     block it, or parry it in the window to send it back);
 *   - mage: marks a purple circle under the player, then blasts it (leave
 *     it, or parry in the window to warp in and counter).
 * Heavy windups have armor: normal hits do not interrupt them. Every stat is
 * scaled at spawn by the wave's difficulty (`WaveMods`).
 *
 * The boss (Gravelord) never flinches; only a poise break stuns it. At half
 * hp it roars into phase 2: faster attacks, wider quakes and the Grave Leap.
 */
import { T, DEG, type EnemyAttackDef, type HunterKind, type HunterKindDef, type MonsterKind, type BossType } from './tuning.ts';
import { C } from './fxTypes.ts';
import type { World } from './world.ts';

export type { HunterKind } from './tuning.ts';
export type HState = 'spawn' | 'chase' | 'windup' | 'active' | 'recover' | 'flinch' | 'broken' | 'roar' | 'guard' | 'dead';

export interface HitOptions {
    /** Direction the hit pushes the target, radians. */
    angle: number;
    knock: number;
    /** Finishers, specials, counters, shocks: break a raised guard instead of being blocked. */
    breaker?: boolean;
    /** Damage over time (bleed): ignores guards, no flinch, no poise damage. */
    dot?: boolean;
}

/** Wave multipliers applied at spawn (see T.difficulty). */
export interface WaveMods {
    hp: number;
    dmg: number;
    speed: number;
    windup: number;
    cooldown: number;
}

export const NO_MODS: WaveMods = { hp: 1, dmg: 1, speed: 1, windup: 1, cooldown: 1 };

/** A PVP rival: which monster from the other team, its look, and its hp scale from team power. */
export interface RivalSpec {
    monster: MonsterKind;
    skin?: string;
    hpMult: number;
    /** Carry-over hp when it tags back in (else full). */
    hp?: number;
}

export function wrapAngle(a: number): number {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function scaleAttack(a: EnemyAttackDef, m: WaveMods): EnemyAttackDef {
    return { ...a, dmg: Math.round(a.dmg * m.dmg), windup: a.windup * m.windup, recover: a.recover * m.windup };
}

let nextId = 1;

export class Hunter {
    readonly id = nextId++;
    /** The kind's stat block (boss both reads its own numbers and exposes T.boss lookups). */
    readonly def: HunterKindDef;
    readonly r: number;
    x: number;
    y: number;
    facing = 0;
    hp: number;
    readonly hpMax: number;
    poise: number;
    state: HState = 'spawn';
    /** Seconds spent in the current state (enemy time). */
    st = 0;
    atk: EnemyAttackDef | null = null;
    /** Seconds of white hit flash left. */
    flashT = 0;
    /** True once the dead fade-out has finished and the world may drop this hunter. */
    removable = false;
    /** Ranged kinds: walking backwards to keep their distance (the view plays a backpedal). */
    retreating = false;
    /** Mage: center of the marked circle (tracks the player, then locks). */
    aimX = 0;
    aimY = 0;

    private readonly poiseMax: number;
    private readonly speed: number;
    private jab: EnemyAttackDef;
    private heavy: EnemyAttackDef;
    private readonly shot: EnemyAttackDef | null;
    private cooldownMult: number;
    private cooldown = 0.6 + Math.random() * 0.8;
    private struck = false;
    /** The swing whoosh for the current windup has been started. */
    private whooshed = false;
    /** Seconds until this hunter may grunt again. */
    private voiceCd = 0;
    private kvx = 0;
    private kvy = 0;
    private sinceHit = 99;
    /** Direction of the last hit (attacker to this hunter), for the death spray. */
    private lastHitAngle = 0;
    private orbitSign = Math.random() < 0.5 ? -1 : 1;
    /** Boss: how many attacks since the last quake (the quake re-fires after quakeEvery). */
    private bossMoves = 0;
    /** Boss: 1, then 2 after the roar at half hp. */
    phase = 1;
    /** Guard: seconds until it may raise its guard again, hits blocked this guard, last player swing seen. */
    private guardCd = 1.5;
    guardBlocks = 0;
    private seenSwing = 0;
    /** Bumped on every blocked hit (the view replays the block reaction). */
    blockSerial = 0;
    /** PVP rival: its monster, look, and whether it already tagged out once. */
    readonly rival: RivalSpec | null;
    taggedOut = false;
    /** Tutorial knight: what it may do ('idle' never attacks; 'jab' or 'heavy' only that). Null = normal AI. */
    script: 'idle' | 'jab' | 'heavy' | null = null;
    /** Tutorial knight: hits leave it at 1 HP until the last step. */
    immortal = false;
    /** Bleed (Serrated Claws boon): seconds left, damage per second, damage waiting to tick. */
    private bleedT = 0;
    private bleedDps = 0;
    private bleedAcc = 0;

    /** Serrated Claws: (re)start bleeding at `dps` for `time` seconds. */
    applyBleed(dps: number, time: number): void {
        this.bleedT = time;
        this.bleedDps = Math.max(this.bleedDps * (this.bleedT > 0 ? 1 : 0), dps);
    }
    /** The rival's special for its monster. */
    private special: EnemyAttackDef | null = null;
    /** Captain and Colossus: their special (charge, Bone Rain), the Captain's phase-2 whirlwind, and casts left in a Bone Rain. */
    private bossSpecial: EnemyAttackDef | null = null;
    private whirl: EnemyAttackDef | null = null;
    private repeatLeft = 0;
    /** Charge: seconds until the next gap-closing charge. */
    private chargeCd = 0;
    /** Boss: seconds until the next Grave Leap is allowed. */
    private leapCd = 0;
    /** Grave Leap: where the jump started, and 0..1 height of the arc right now (the view lifts the body). */
    private leapFromX = 0;
    private leapFromY = 0;
    private leapStarted = false;
    air = 0;

    constructor(
        private readonly w: World,
        x: number,
        y: number,
        readonly kind: HunterKind,
        mods: WaveMods = NO_MODS,
        rival: RivalSpec | null = null,
        readonly bossType: BossType = 'gravelord',
    ) {
        this.x = x;
        this.y = y;
        this.def = T.hunterKinds[kind];
        this.rival = rival;
        const per = rival ? T.rival.monsters[rival.monster] : null;
        this.r = rival?.monster === 'stitched' ? 44 : this.def.radius ?? T.hunter.radius;
        this.hpMax = this.def.hp * mods.hp * (per ? per.hp * rival!.hpMult : 1);
        this.hp = rival?.hp ?? this.hpMax;
        // poise grows at half the hp rate so late waves still break
        this.poiseMax = this.def.poise * (1 + (mods.hp - 1) * 0.5);
        this.poise = this.poiseMax;
        this.speed = this.def.speed * mods.speed * (per ? per.speed : 1);
        this.jab = scaleAttack(this.def.boss ? T.boss.sweep : rival ? T.rival.jab : T.hunter.jab, mods);
        this.heavy = scaleAttack(this.def.boss ? T.boss.smash : rival ? T.rival.heavy : T.hunter.heavy, mods);
        if (rival) this.special = scaleAttack(T.rival.specials[rival.monster], mods);
        this.shot = this.def.ranged ? scaleAttack(this.def.ranged.attack, mods) : null;
        // Boss: quake and leap always exist; their scale comes with the wave like every other attack.
        this.quake = scaleAttack(T.boss.quake, mods);
        this.leap = scaleAttack(T.boss.leap, mods);
        this.cooldownMult = mods.cooldown;
        if (this.def.boss && bossType !== 'gravelord') {
            const B = T.bosses[bossType];
            this.r = B.radius;
            this.hpMax *= B.hp;
            this.hp = this.hpMax;
            this.speed *= B.speed;
            this.jab = scaleAttack(B.sweep, mods);
            this.heavy = scaleAttack(B.smash, mods);
            this.bossSpecial = scaleAttack(B.special, mods);
            if (bossType === 'captain') this.whirl = scaleAttack(T.bosses.captain.whirl, mods);
        }
    }

    /** Boss phase 2: every attack winds up and recovers faster, quakes grow. */
    private enrage(): void {
        const m = T.boss.p2Windup;
        const fast = (a: EnemyAttackDef): EnemyAttackDef => ({ ...a, windup: a.windup * m, recover: a.recover * m });
        this.jab = fast(this.jab);
        this.heavy = fast(this.heavy);
        this.quake = { ...fast(this.quake), radius: T.boss.p2QuakeRadius };
        this.cooldownMult *= T.boss.p2Cooldown;
        this.phase = 2;
        // the Gravelord starts its count over; the Captain and the Colossus open phase 2 with their special
        this.bossMoves = this.bossType === 'gravelord' ? 0 : 99;
        this.leapCd = 1.5;
        this.atk = null;
        this.poise = this.poiseMax;
        this.kvx = this.kvy = 0;
        this.enter('roar');
        this.w.onBossEnrage(this);
    }

    get alive(): boolean {
        return this.state !== 'dead';
    }

    /** Can be hit by the player right now. */
    get targetable(): boolean {
        return this.state !== 'dead' && this.state !== 'spawn';
    }

    get ranged(): boolean {
        return this.shot !== null;
    }

    isAttacking(): boolean {
        return this.state === 'windup' || this.state === 'active';
    }

    private enter(state: HState): void {
        this.state = state;
        this.st = 0;
    }

    /**
     * Which attack to start, if any. Boss: alternates sweep/smash while the
     * player is close, then a quake from anywhere after quakeEvery attacks.
     */
    private pickMove(dist: number): EnemyAttackDef | null {
        if (this.script) return this.script === 'idle' ? null : this.script === 'jab' ? this.jab : this.heavy;
        if (this.shot) return this.shot;
        if (this.rival) {
            // every few moves its monster's special, from any distance; otherwise close in and strike
            if (this.special && this.bossMoves >= T.rival.specialEvery - 1) return this.special;
            const melee = Math.random() < T.rival.heavyChance ? this.heavy : this.jab;
            return dist <= melee.range ? melee : null;
        }
        if (!this.def.boss) return Math.random() < T.hunter.heavyChance ? this.heavy : this.jab;
        if (this.bossType === 'captain') {
            // charges to close a gap or every few attacks; phase 2 mixes in the whirlwind
            const sp = this.bossSpecial!;
            if (this.chargeCd <= 0 && (this.bossMoves >= T.bosses.captain.specialEvery || dist > 480)) return sp;
            const melee = this.phase === 2 && this.bossMoves % 3 === 2 && this.whirl ? this.whirl : this.bossMoves % 2 === 1 ? this.heavy : this.jab;
            return dist <= melee.range ? melee : null;
        }
        if (this.bossType === 'colossus') {
            if (this.bossMoves >= T.bosses.colossus.specialEvery) return this.bossSpecial;
            const melee = this.bossMoves % 2 === 1 ? this.heavy : this.jab;
            return dist <= melee.range ? melee : null;
        }
        if (this.bossMoves >= (this.phase === 2 ? T.boss.p2QuakeEvery : T.boss.quakeEvery)) return this.quake;
        // phase 2: a player who keeps their distance gets leapt on
        if (this.phase === 2 && this.leapCd <= 0 && dist >= T.boss.leapMinDist) return this.leap;
        const melee = this.bossMoves % 2 === 1 ? this.heavy : this.jab;
        return dist <= melee.range ? melee : null;
    }

    /** The boss's quake and Grave Leap, scaled for its wave. */
    private quake: EnemyAttackDef;
    private leap: EnemyAttackDef;

    update(dt: number): void {
        if (dt <= 0) return;
        this.st += dt;
        this.sinceHit += dt;
        this.flashT = Math.max(0, this.flashT - dt);
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.leapCd = Math.max(0, this.leapCd - dt);
        this.chargeCd = Math.max(0, this.chargeCd - dt);
        this.guardCd = Math.max(0, this.guardCd - dt);
        this.voiceCd = Math.max(0, this.voiceCd - dt);
        if (this.state !== 'windup' || this.atk?.style !== 'leap') this.air = 0;
        if (this.sinceHit > T.hunter.poiseRegenDelay && this.state !== 'broken') this.poise = this.poiseMax;
        if (this.bleedT > 0 && this.alive) {
            this.bleedT -= dt;
            this.bleedAcc += this.bleedDps * dt;
            if (this.bleedAcc >= 4 || (this.bleedT <= 0 && this.bleedAcc > 0)) {
                const d = this.bleedAcc;
                this.bleedAcc = 0;
                this.takeHit(d, 0, { angle: this.facing + Math.PI, knock: 0, dot: true });
                if (!this.alive) return;
            }
        }
        if (this.state !== 'chase') this.retreating = false;

        const p = this.w.player;
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const toPlayer = Math.atan2(dy, dx);

        switch (this.state) {
            case 'spawn':
                this.facing = toPlayer;
                if (this.st >= T.hunter.spawnTime) this.enter('chase');
                break;
            case 'chase': {
                this.facing = toPlayer;
                if (!p.alive) break;
                if (this.shot) this.keepDistance(dt, dx, dy, dist);
                else this.closeIn(dt, dx, dy, dist);
                if (this.maybeGuard(dist)) break;
                const atk = this.pickMove(dist);
                const reach = atk ? atk.range : T.hunter.attackRange;
                if (atk && dist <= reach && this.cooldown <= 0 && this.w.attackersActive() < this.w.maxAttackers()) {
                    this.atk = atk;
                    // a drawn blade warns of a purple (counterable) strike; the mage's spell starts
                    if (this.atk.style === 'blast') {
                        this.w.fx.sound('mageCast', { x: this.x });
                        if (this.def.boss) this.w.fx.sound('rumble', { x: this.x, volume: 0.7 });
                    } else if (this.atk.style === 'leap') {
                        this.leapCd = this.rival ? 0 : T.boss.leapCooldown;
                        this.leapStarted = false;
                        this.w.fx.sound('growl', { x: this.x });
                    } else if (this.atk.heavy) this.w.fx.sound('heavyTell', { x: this.x });
                    this.whooshed = false;
                    // quake fires every few moves, then the sweep/smash alternation starts over
                    if (atk === this.quake || atk === this.bossSpecial || (this.rival && atk === this.special)) this.bossMoves = 0;
                    else if (atk !== this.leap) this.bossMoves++;
                    if (atk.style === 'charge') this.chargeCd = 4;
                    // Bone Rain: more drops once enraged
                    this.repeatLeft = atk.repeat ? (this.phase === 2 && this.bossType === 'colossus' ? T.bosses.colossus.p2Repeat : atk.repeat) : 0;
                    this.aimX = p.x;
                    this.aimY = p.y;
                    this.enter('windup');
                }
                break;
            }
            case 'windup': {
                const atk = this.atk!;
                if (this.st < atk.windup * T.hunter.trackFraction) {
                    // turn toward the player, then commit so the attack can be read and dodged
                    const diff = wrapAngle(toPlayer - this.facing);
                    this.facing += diff * Math.min(1, dt * 12);
                }
                const trackFor = atk.style === 'leap' ? T.boss.leapTrack : 0.6;
                if ((atk.style === 'blast' || atk.style === 'leap') && this.st < atk.windup * trackFor) {
                    // the circle follows the player for a while, then stays put
                    const k = Math.min(1, dt * 5);
                    this.aimX += (p.x - this.aimX) * k;
                    this.aimY += (p.y - this.aimY) * k;
                }
                if (atk.style === 'leap') this.updateLeap(atk);
                // the swing whoosh starts just before the strike so its peak lands on it
                const left = atk.windup - this.st;
                if (!this.whooshed && (atk.style ?? 'melee') === 'melee' && left <= 0.09) {
                    this.whooshed = true;
                    const realLeft = left / (this.w.witching > 0 ? T.witching.enemyTimeScale : 1);
                    this.w.fx.sound('enemySwing', { x: this.x, align: Math.max(0, realLeft), volume: atk.heavy ? 1.2 : 1 });
                }
                if (this.st >= atk.windup) {
                    this.struck = false;
                    this.enter('active');
                }
                break;
            }
            case 'active': {
                const atk = this.atk!;
                if (atk.style === 'charge') {
                    // dash along the locked line; the first touch on the player is the hit
                    const s = (atk.speed ?? 1400) * dt;
                    this.x += Math.cos(this.facing) * s;
                    this.y += Math.sin(this.facing) * s;
                    if (!this.struck && Math.hypot(p.x - this.x, p.y - this.y) <= this.r + p.r + 14) {
                        this.struck = true;
                        this.w.chargeHit(this, atk);
                    }
                    if (this.state === 'active' && this.st >= atk.active) this.enter('recover');
                    break;
                }
                if (atk.lunge > 0) {
                    const s = (atk.lunge / atk.active) * dt;
                    this.x += Math.cos(this.facing) * s;
                    this.y += Math.sin(this.facing) * s;
                }
                if (!this.struck) {
                    this.struck = true;
                    if (atk.style === 'bolt') this.w.fireBolt(this, atk);
                    else if (atk.style === 'blast') this.w.blast(this, atk, this.aimX, this.aimY);
                    else if (atk.style === 'leap') this.w.bossLand(this, atk);
                    else this.w.hunterStrike(this, atk);
                }
                // the strike may have broken this hunter with a counter
                if (this.state === 'active' && this.st >= atk.active) {
                    if (this.repeatLeft > 0) {
                        // Bone Rain: the next circle drops on wherever the player is now
                        this.repeatLeft--;
                        this.aimX = p.x;
                        this.aimY = p.y;
                        this.enter('windup');
                        this.st = atk.windup - (atk.repeatWindup ?? 0.6);
                    } else this.enter('recover');
                }
                break;
            }
            case 'recover':
                if (this.st >= (this.atk?.recover ?? 0.5)) {
                    const lo = this.def.boss ? T.boss.cooldownMin : this.rival ? T.rival.cooldownMin : T.hunter.cooldownMin;
                    const hi = this.def.boss ? T.boss.cooldownMax : this.rival ? T.rival.cooldownMax : T.hunter.cooldownMax;
                    const base = lo + Math.random() * (hi - lo);
                    this.cooldown = base * this.cooldownMult + (this.shot ? 0.5 : 0);
                    this.atk = null;
                    this.enter('chase');
                }
                break;
            case 'flinch':
                if (this.st >= T.hunter.flinch) {
                    this.cooldown = Math.max(this.cooldown, 0.4);
                    this.enter('chase');
                }
                break;
            case 'guard':
                this.facing += wrapAngle(toPlayer - this.facing) * Math.min(1, dt * 10);
                if (this.st >= T.hunter.guard.time) {
                    this.guardCd = T.hunter.guard.cooldown;
                    this.cooldown = Math.min(this.cooldown, 0.25);
                    this.enter('chase');
                }
                break;
            case 'roar':
                this.facing = toPlayer;
                if (this.st >= T.boss.roar.time) {
                    this.cooldown = 0.4;
                    this.enter('chase');
                }
                break;
            case 'broken':
                if (this.st >= T.hunter.breakStun) {
                    this.poise = this.poiseMax;
                    this.cooldown = 0.6;
                    this.enter('chase');
                }
                break;
            case 'dead':
                if (this.st >= T.hunter.deathTime) this.removable = true;
                break;
        }

        // knockback
        this.x += this.kvx * dt;
        this.y += this.kvy * dt;
        const k = Math.exp(-10 * dt);
        this.kvx *= k;
        this.kvy *= k;
    }

    /** Can this hunter ever guard? Melee kinds, and the boss once enraged. */
    get canGuard(): boolean {
        if (this.shot) return false;
        return this.def.boss ? this.phase === 2 : true;
    }

    /** In answer to a fresh player swing nearby, sometimes raise the guard. */
    private maybeGuard(dist: number): boolean {
        const p = this.w.player;
        const g = T.hunter.guard;
        if (p.swingId === this.seenSwing) return false;
        this.seenSwing = p.swingId;
        if (this.script) return false;
        if (!this.canGuard || this.guardCd > 0 || dist > g.range) return false;
        if (!this.rival && this.w.waveNumber() < g.fromWave) return false;
        // rivals guard like a mid-run hunter
        const chance = this.rival ? 0.3 : Math.min(g.chanceMax, g.chance + g.chancePerWave * this.w.waveNumber());
        if (Math.random() >= chance) return false;
        this.guardBlocks = 0;
        this.atk = null;
        this.enter('guard');
        this.w.fx.sound('block', { x: this.x, volume: 0.6 });
        return true;
    }

    /** Is a hit pushing along `angle` coming at the raised guard's front? */
    private hitsGuard(angle: number): boolean {
        if (this.state !== 'guard') return false;
        // the hit pushes along `angle`, so it comes from angle + PI
        const from = angle + Math.PI;
        return Math.abs(wrapAngle(from - this.facing)) <= (T.hunter.guard.arcDeg / 2) * DEG;
    }

    private guardBreak(): void {
        this.atk = null;
        this.enter('broken');
        this.w.fx.text(this.x, this.y - 50, 'GUARD BREAK', C.counter, 40, 0.9);
        this.w.fx.sound('guardBreak', { x: this.x });
        this.w.fx.ring(this.x, this.y, this.r, this.r * 3.2, 0x60a5fa, 10, 0.4);
        this.w.fx.burst(this.x, this.y, 0x93c5fd, 16, 420, 6, 0.4);
    }

    /**
     * Grave Leap: crouch while the circle tracks, then fly in an arc onto the
     * locked circle, touching down exactly as the windup ends.
     */
    private updateLeap(atk: EnemyAttackDef): void {
        const t0 = atk.windup * T.boss.leapTrack;
        if (this.st < t0) return;
        if (!this.leapStarted) {
            this.leapStarted = true;
            this.leapFromX = this.x;
            this.leapFromY = this.y;
            this.w.fx.burst(this.x, this.y, 0x6b5a48, 14, 380, 7, 0.45, false);
        }
        const f = Math.min(1, (this.st - t0) / (atk.windup - t0));
        // ease out so it hangs at the top, then drops
        const e = 1 - (1 - f) * (1 - f);
        this.x = this.leapFromX + (this.aimX - this.leapFromX) * e;
        this.y = this.leapFromY + (this.aimY - this.leapFromY) * e;
        this.facing = Math.atan2(this.aimY - this.leapFromY, this.aimX - this.leapFromX);
        this.air = Math.sin(f * Math.PI);
    }

    /** Melee: walk in, then circle the player a little instead of standing still. */
    private closeIn(dt: number, dx: number, dy: number, dist: number): void {
        // stop at arm's length, or at body contact for big bodies (no walking into the player)
        if (dist > Math.max(T.hunter.stopRange, this.w.contactDist(this) + 6)) {
            const s = this.speed * dt;
            this.x += (dx / dist) * s;
            this.y += (dy / dist) * s;
        } else {
            const s = this.speed * 0.35 * dt * this.orbitSign;
            this.x += (-dy / dist) * s;
            this.y += (dx / dist) * s;
        }
    }

    /** Ranged: stay inside the [keepMin, keepMax] band, backing off slower than the monsters run. */
    private keepDistance(dt: number, dx: number, dy: number, dist: number): void {
        const band = this.def.ranged!;
        const s = this.speed * dt;
        this.retreating = false;
        if (dist > band.keepMax) {
            this.x += (dx / dist) * s;
            this.y += (dy / dist) * s;
        } else if (dist < band.keepMin) {
            this.x -= (dx / dist) * s * 0.75;
            this.y -= (dy / dist) * s * 0.75;
            this.retreating = true;
        } else {
            this.x += (-dy / dist) * s * 0.4 * this.orbitSign;
            this.y += (dx / dist) * s * 0.4 * this.orbitSign;
        }
        // pinned on a wall: switch strafe direction now and then
        if (Math.random() < dt * 0.4) this.orbitSign *= -1;
    }

    /** Would `atk`, struck from this hunter's current pose, hit a circle at (px, py)? */
    zoneHits(atk: EnemyAttackDef, px: number, py: number, pr: number): boolean {
        const dx = px - this.x;
        const dy = py - this.y;
        const d = Math.hypot(dx, dy);
        if (d - pr > atk.range) return false;
        if (d < pr + this.r) return true;
        const diff = Math.abs(wrapAngle(Math.atan2(dy, dx) - this.facing));
        return diff <= (atk.arcDeg / 2) * DEG + Math.asin(Math.min(1, pr / Math.max(d, 1)));
    }

    /** Returns true if this hit broke the hunter's poise. */
    takeHit(dmg: number, poiseDmg: number, opts: HitOptions): boolean {
        if (!this.alive) return false;
        if (this.state === 'roar') {
            // the roar shrugs everything off
            this.flashT = 0.05;
            return false;
        }
        if (!opts.dot && this.hitsGuard(opts.angle)) {
            if (opts.breaker || this.guardBlocks + 1 >= T.hunter.guard.maxBlocks) {
                this.guardBreak();
            } else {
                // blocked: no damage, a little push, sparks off the shield
                this.guardBlocks++;
                this.blockSerial++;
                this.flashT = 0.06;
                const ks = (this.def.boss ? T.boss.knockScale : 1) * 0.35;
                this.kvx += Math.cos(opts.angle) * opts.knock * ks;
                this.kvy += Math.sin(opts.angle) * opts.knock * ks;
                this.w.fx.text(this.x, this.y - 40, 'BLOCK', 0x93c5fd, 28, 0.5);
                this.w.fx.spray(this.x - Math.cos(opts.angle) * this.r, this.y - Math.sin(opts.angle) * this.r, opts.angle + Math.PI, 1.4, 0xbfdbfe, 10, 380, 5, 0.25);
                this.w.fx.sound('block', { x: this.x });
                return false;
            }
        }
        if (this.state === 'broken') dmg *= T.hunter.breakDamageMult;
        // the player's Strength points
        dmg *= this.w.boost.dmg;
        if (this.immortal) dmg = Math.min(dmg, Math.max(0, this.hp - 1));
        this.hp -= dmg;
        this.sinceHit = 0;
        this.flashT = 0.09;
        const ks = this.def.boss ? T.boss.knockScale : 1;
        this.kvx += Math.cos(opts.angle) * opts.knock * ks;
        this.kvy += Math.sin(opts.angle) * opts.knock * ks;
        if (dmg > 0) {
            this.w.fx.text(this.x, this.y, String(Math.round(dmg)), opts.dot ? 0xf87171 : this.state === 'broken' ? C.counter : 0xffffff, opts.dot ? 22 : 28, 0.6);
            // a spurt of blood out the far side, bigger for heavier hits
            if (dmg >= T.gore.minDamage || opts.dot) this.w.fx.blood(this.x, this.y, opts.angle, opts.dot ? 0.4 : Math.min(T.gore.maxAmount, dmg / T.gore.damagePerUnit));
            if (!opts.dot) this.lastHitAngle = opts.angle;
        }

        if (this.hp <= 0) {
            this.die();
            return false;
        }
        if (this.def.boss && this.phase === 1 && this.hp <= this.hpMax * T.boss.enrageAt) {
            this.enrage();
            return false;
        }
        // a hurt rival may tag out to a waiting teammate (once)
        if (this.rival && !this.taggedOut && this.hp <= this.hpMax * T.rival.tagOutAt) {
            // one chance per monster
            this.taggedOut = true;
            if (Math.random() < T.rival.tagOutChance && this.w.rivalTagOut(this)) return false;
        }
        if (opts.dot) return false;
        // a grunt on some hits, never a chorus
        if (dmg > 0 && this.voiceCd <= 0 && Math.random() < 0.45) {
            this.voiceCd = 0.8;
            this.w.fx.sound('enemyHurt', { x: this.x });
        }
        let broke = false;
        if (this.state !== 'broken') {
            this.poise -= poiseDmg;
            if (this.poise <= 0) {
                broke = true;
                this.atk = null;
                this.enter('broken');
                this.w.fx.text(this.x, this.y - 40, 'BREAK!', C.counter, 40, 0.9);
                this.w.fx.sound('poiseBreak', { x: this.x });
                this.w.fx.ring(this.x, this.y, this.r, this.r * 3, C.counter, 8, 0.35);
            } else if (this.def.boss || (this.rival && Math.random() < 0.6)) {
                // the Gravelord has hyper armor, and a rival shrugs off most hits: only a poise break stops them
            } else if (this.state === 'windup' && this.atk && !this.atk.heavy) {
                // light windups are interrupted, heavy ones have armor
                this.atk = null;
                this.enter('flinch');
            } else if (this.state === 'chase' || this.state === 'recover') {
                this.enter('flinch');
            }
        }
        return broke;
    }

    /** Leave the field without a KO (the tutorial knight after a skip). */
    crumbleQuietly(): void {
        this.atk = null;
        this.enter('dead');
        this.removable = true;
        this.w.fx.burst(this.x, this.y, 0x6b5a48, 14, 300, 7, 0.5, false);
    }

    /** The boss fell: this hunter crumbles to dust (still counts as a KO). */
    crumble(): void {
        if (!this.alive) return;
        this.atk = null;
        this.enter('dead');
        this.w.fx.burst(this.x, this.y, 0x6b5a48, 14, 300, 7, 0.5, false);
        this.w.onHunterKilled();
    }

    private die(): void {
        this.atk = null;
        this.enter('dead');
        this.w.fx.sound('enemyDeath', { x: this.x });
        this.w.fx.blood(this.x, this.y, this.lastHitAngle, 1.5, true);
        this.w.fx.burst(this.x, this.y, C.hunter, 18, 420, 7, 0.5, false);
        this.w.fx.burst(this.x, this.y, C.spark, 12, 360, 5, 0.35);
        this.w.onHunterKilled();
        if (this.def.boss) this.w.onBossKilled(this);
    }
}

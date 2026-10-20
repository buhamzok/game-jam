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
 */
import { T, DEG, type EnemyAttackDef, type HunterKind, type HunterKindDef } from './tuning.ts';
import { C } from './fxTypes.ts';
import type { World } from './world.ts';

export type { HunterKind } from './tuning.ts';
export type HState = 'spawn' | 'chase' | 'windup' | 'active' | 'recover' | 'flinch' | 'broken' | 'dead';

export interface HitOptions {
    /** Direction the hit pushes the target, radians. */
    angle: number;
    knock: number;
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
    private readonly jab: EnemyAttackDef;
    private readonly heavy: EnemyAttackDef;
    private readonly shot: EnemyAttackDef | null;
    private readonly cooldownMult: number;
    private cooldown = 0.6 + Math.random() * 0.8;
    private struck = false;
    /** The swing whoosh for the current windup has been started. */
    private whooshed = false;
    /** Seconds until this hunter may grunt again. */
    private voiceCd = 0;
    private kvx = 0;
    private kvy = 0;
    private sinceHit = 99;
    private orbitSign = Math.random() < 0.5 ? -1 : 1;
    /** Boss: how many attacks since the last quake (the quake re-fires after quakeEvery). */
    private bossMoves = 0;

    constructor(
        private readonly w: World,
        x: number,
        y: number,
        readonly kind: HunterKind,
        mods: WaveMods = NO_MODS,
    ) {
        this.x = x;
        this.y = y;
        this.def = T.hunterKinds[kind];
        this.r = this.def.radius ?? T.hunter.radius;
        this.hpMax = this.def.hp * mods.hp;
        this.hp = this.hpMax;
        // poise grows at half the hp rate so late waves still break
        this.poiseMax = this.def.poise * (1 + (mods.hp - 1) * 0.5);
        this.poise = this.poiseMax;
        this.speed = this.def.speed * mods.speed;
        this.jab = scaleAttack(this.def.boss ? T.boss.sweep : T.hunter.jab, mods);
        this.heavy = scaleAttack(this.def.boss ? T.boss.smash : T.hunter.heavy, mods);
        this.shot = this.def.ranged ? scaleAttack(this.def.ranged.attack, mods) : null;
        // Boss: quake always exists; its scale comes with the wave like every other attack.
        this.quake = scaleAttack(T.boss.quake, mods);
        this.cooldownMult = mods.cooldown;
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
        if (this.shot) return this.shot;
        if (!this.def.boss) return Math.random() < T.hunter.heavyChance ? this.heavy : this.jab;
        if (this.bossMoves >= T.boss.quakeEvery) return this.quake;
        const melee = this.bossMoves % 2 === 1 ? this.heavy : this.jab;
        return dist <= melee.range ? melee : null;
    }

    /** The boss's quake, scaled for its wave. */
    private quake: EnemyAttackDef;

    update(dt: number): void {
        if (dt <= 0) return;
        this.st += dt;
        this.sinceHit += dt;
        this.flashT = Math.max(0, this.flashT - dt);
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.voiceCd = Math.max(0, this.voiceCd - dt);
        if (this.sinceHit > T.hunter.poiseRegenDelay && this.state !== 'broken') this.poise = this.poiseMax;
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
                const atk = this.pickMove(dist);
                const reach = atk ? atk.range : T.hunter.attackRange;
                if (atk && dist <= reach && this.cooldown <= 0 && this.w.attackersActive() < this.w.maxAttackers()) {
                    this.atk = atk;
                    // a drawn blade warns of a purple (counterable) strike; the mage's spell starts
                    if (this.atk.style === 'blast') {
                        this.w.fx.sound('mageCast', { x: this.x });
                        if (this.def.boss) this.w.fx.sound('rumble', { x: this.x, volume: 0.7 });
                    } else if (this.atk.heavy) this.w.fx.sound('heavyTell', { x: this.x });
                    this.whooshed = false;
                    // quake fires on the third move, then the sweep/smash alternation starts over
                    this.bossMoves = atk === this.quake ? 0 : this.bossMoves + 1;
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
                if (atk.style === 'blast' && this.st < atk.windup * 0.6) {
                    // the circle follows the player for a while, then stays put
                    const k = Math.min(1, dt * 5);
                    this.aimX += (p.x - this.aimX) * k;
                    this.aimY += (p.y - this.aimY) * k;
                }
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
                if (atk.lunge > 0) {
                    const s = (atk.lunge / atk.active) * dt;
                    this.x += Math.cos(this.facing) * s;
                    this.y += Math.sin(this.facing) * s;
                }
                if (!this.struck) {
                    this.struck = true;
                    if (atk.style === 'bolt') this.w.fireBolt(this, atk);
                    else if (atk.style === 'blast') this.w.blast(this, atk, this.aimX, this.aimY);
                    else this.w.hunterStrike(this, atk);
                }
                // the strike may have broken this hunter with a counter
                if (this.state === 'active' && this.st >= atk.active) this.enter('recover');
                break;
            }
            case 'recover':
                if (this.st >= (this.atk?.recover ?? 0.5)) {
                    const lo = this.def.boss ? T.boss.cooldownMin : T.hunter.cooldownMin;
                    const hi = this.def.boss ? T.boss.cooldownMax : T.hunter.cooldownMax;
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

    /** Melee: walk in, then circle the player a little instead of standing still. */
    private closeIn(dt: number, dx: number, dy: number, dist: number): void {
        if (dist > T.hunter.stopRange) {
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
        if (this.state === 'broken') dmg *= T.hunter.breakDamageMult;
        this.hp -= dmg;
        this.sinceHit = 0;
        this.flashT = 0.09;
        const ks = this.def.boss ? T.boss.knockScale : 1;
        this.kvx += Math.cos(opts.angle) * opts.knock * ks;
        this.kvy += Math.sin(opts.angle) * opts.knock * ks;
        if (dmg > 0) this.w.fx.text(this.x, this.y, String(Math.round(dmg)), this.state === 'broken' ? C.counter : 0xffffff, 28, 0.6);

        if (this.hp <= 0) {
            this.die();
            return false;
        }
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

    private die(): void {
        this.atk = null;
        this.enter('dead');
        this.w.fx.sound('enemyDeath', { x: this.x });
        this.w.fx.burst(this.x, this.y, C.hunter, 18, 420, 7, 0.5, false);
        this.w.fx.burst(this.x, this.y, C.spark, 12, 360, 5, 0.35);
        this.w.onHunterKilled();
    }
}

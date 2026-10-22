/**
 * The player's tag team (simulation only; the 3D view reads its state).
 * The shared body (position, facing, state machine) is driven by the active
 * monster; the benched monsters keep their own hp/energy and may strike from
 * off-field (the Vampire's bats).
 *
 * Active-monster states: idle/move, attack (3-hit combo), dodge, guard,
 * counter, special (pounce, swarm or smash), transform (the pose before a
 * transformation), entry (swap-in attack), hurt, down. If the
 * active monster falls, the next living one swaps in; when all are down the
 * team is dead. Hit resolution against enemies lives in World.
 */
import { T, type MonsterDef, type PounceDef, type SwingDef, type MonsterKind } from './tuning.ts';
import { C } from './fxTypes.ts';
import { input, type Action } from './input.ts';
import type { World } from './world.ts';
import type { Hunter } from './hunter.ts';
import type { SfxName } from './audio.ts';

const SWING_SOUND: Record<MonsterKind, SfxName> = { werewolf: 'swingClaw', vampire: 'swingBlade', stitched: 'swingHeavy' };

export type PState = 'idle' | 'move' | 'attack' | 'dodge' | 'guard' | 'counter' | 'special' | 'transform' | 'entry' | 'hurt' | 'dead';

/** One monster's own battle state while benched or active. */
export interface BattleMonster {
    kind: MonsterKind;
    hp: number;
    energy: number;
    alive: boolean;
    /** Off-field only: seconds until the next automatic off-field strike. */
    benchCd: number;
    /** Seconds until this monster's special is ready again (ticks on the bench too). */
    specialCd: number;
}

const defOf = (kind: MonsterKind) => T.monsters[kind];

export class Player {
    team: BattleMonster[] = (Object.keys(T.monsters) as MonsterKind[]).map((kind) => ({
        kind,
        hp: defOf(kind).hp,
        energy: 0,
        alive: true,
        benchCd: 0,
        specialCd: 0,
    }));

    /** Index in `team` of the monster driving the body. */
    active = 0;
    x = 0;
    y = 300;
    facing = -Math.PI / 2;
    state: PState = 'idle';
    /** Seconds spent in the current state. */
    st = 0;
    /** Index of the current swing in the combo (0..2). */
    combo = 0;
    /** True when the current dodge has no input direction (a backward hop). */
    dodgeBackward = false;
    /** Seconds of white hit flash left. */
    flashT = 0;
    /** Seconds of post-hit blinking left. */
    hurtFlicker = 0;

    /** Where the current dodge started; perfect dodges also count hits aimed there. */
    dodgeOX = 0;
    dodgeOY = 0;
    perfectCd = 0;
    invuln = 0;

    private comboTimer = 0;
    private swingDone = false;
    /** Seconds until the next dodge (also: a dodge happened recently while > 0). */
    dodgeCd = 0;
    private dodgeDx = 0;
    private dodgeDy = 0;
    private trailT = 0;
    private kvx = 0;
    private kvy = 0;

    /** Hits absorbed by the current hold-block (0 until broken). */
    guardHits = 0;
    /** Seconds until the guard can be raised again after a break. */
    guardBreakCd = 0;

    /** Seconds of transformation left on the active monster (0 when not transformed). */
    transT = 0;

    private counterTarget: Hunter | null = null;
    private counterHit = false;
    private fromX = 0;
    private fromY = 0;
    private toX = 0;
    private toY = 0;
    private specialLanded = false;
    /** Hunters already bitten by the current Swarm Slam. */
    private readonly bitten = new Set<number>();

    constructor(private readonly w: World) {
        // stat points (Vitality) raise every monster's max HP
        for (const m of this.team) m.hp = this.maxHp(m.kind);
    }

    /** Max HP of a team member, with the player's Vitality. */
    maxHp(kind: MonsterKind): number {
        return Math.round(T.monsters[kind].hp * this.w.boost.hp);
    }

    // ---- team helpers ------------------------------------------------------

    kind(): MonsterKind {
        return this.team[this.active].kind;
    }

    d(): MonsterDef {
        return defOf(this.kind());
    }

    unit(): BattleMonster {
        return this.team[this.active];
    }

    get r(): number {
        return this.d().radius;
    }

    get alive(): boolean {
        return this.team.some((m) => m.alive);
    }

    /** The energy bar is full: Q transforms. Only transforming spends the bar. */
    get transReady(): boolean {
        return this.unit().energy >= T.energy.max;
    }

    /** The active monster's special is off cooldown (E / SPECIAL). */
    get specialReady(): boolean {
        return this.unit().specialCd <= 0;
    }

    swapCd = 0;

    /** Dashing moves pass through enemies instead of being pushed by them. */
    get phasing(): boolean {
        return this.state === 'dodge' || this.state === 'counter' || this.state === 'special';
    }

    /** Guard state and still inside the parry window. */
    get parryOpen(): boolean {
        return this.state === 'guard' && this.st <= T.guard.parryWindow;
    }

    addEnergy(n: number): void {
        const u = this.unit();
        u.energy = Math.min(T.energy.max, u.energy + n * this.w.boost.energy);
    }

    heal(n: number): void {
        const u = this.unit();
        u.hp = Math.min(this.maxHp(u.kind), u.hp + n);
    }

    private enter(state: PState): void {
        this.state = state;
        this.st = 0;
    }

    update(dt: number): void {
        if (dt <= 0) return;
        this.st += dt;
        this.dodgeCd = Math.max(0, this.dodgeCd - dt);
        this.swapCd = Math.max(0, this.swapCd - dt);
        this.perfectCd = Math.max(0, this.perfectCd - dt);
        this.guardBreakCd = Math.max(0, this.guardBreakCd - dt);
        if (this.transT > 0) {
            this.transT = Math.max(0, this.transT - dt);
            if (this.transT === 0) this.w.onTransEnd(this.kind());
        }
        // Blood Frenzy: the attack-state clock runs faster
        if (this.state === 'attack' && this.transT > 0 && this.kind() === 'vampire') this.st += dt * (T.trans.vampire.attackSpeed - 1);
        this.invuln = Math.max(0, this.invuln - dt);
        this.comboTimer = Math.max(0, this.comboTimer - dt);
        this.flashT = Math.max(0, this.flashT - dt);
        this.hurtFlicker = Math.max(0, this.hurtFlicker - dt);

        for (const m of this.team) m.specialCd = Math.max(0, m.specialCd - dt);
        // benched monsters refill energy and tick their off-field strikes
        for (const m of this.team) {
            if (m === this.unit() || !m.alive) continue;
            m.energy = Math.min(T.energy.max, m.energy + T.tag.benchEnergy * dt);
            m.benchCd -= dt;
            if (m.benchCd <= 0 && defOf(m.kind).offFieldDmg > 0) {
                m.benchCd = defOf(m.kind).offFieldInterval;
                this.w.offFieldStrike(m.kind, defOf(m.kind).offFieldDmg);
            } else if (m.benchCd <= 0) {
                m.benchCd = 1;
            }
        }

        const mv = input.getMove();
        const moving = Math.hypot(mv.x, mv.y) > 0.15;

        switch (this.state) {
            case 'idle':
            case 'move':
                if (this.trySwap() || this.tryTrans() || this.tryGuard() || this.tryDodge(mv) || this.trySpecial() || this.tryAttack(mv)) break;
                if (moving) {
                    const speed = this.d().speed * this.w.boost.speed * (this.w.witching > 0 ? T.witching.moveBuff : 1) * (this.transT > 0 && this.kind() === 'werewolf' ? T.trans.werewolf.speedMult : 1);
                    this.x += mv.x * speed * dt;
                    this.y += mv.y * speed * dt;
                    this.facing = Math.atan2(mv.y, mv.x);
                    this.state = 'move';
                } else {
                    this.state = 'idle';
                }
                break;
            case 'attack':
                this.updateAttack(dt, mv);
                break;
            case 'dodge':
                if (this.trySwap()) break;
                this.updateDodge(dt);
                break;
            case 'guard':
                if (this.trySwap()) break;
                if (this.guardBreakCd > 0) {
                    this.enter('idle');
                    break;
                }
                // hold-to-block: the guard stays up while the button is held
                if (!input.held('guard') && this.st >= T.guard.parryWindow + T.guard.recovery) this.enter('idle');
                break;
            case 'counter':
                this.updateCounter();
                break;
            case 'special':
                this.updateSpecial(dt);
                break;
            case 'transform':
                if (this.st >= T.trans.startup) {
                    this.transT = T.trans.duration;
                    this.w.onTransStart(this.kind());
                    this.enter('idle');
                }
                break;
            case 'entry':
                this.updateEntry(dt);
                break;
            case 'hurt':
                if (this.st >= T.hurt.stun) this.enter('idle');
                break;
            case 'dead':
                break;
        }

        this.x += this.kvx * dt;
        this.y += this.kvy * dt;
        const k = Math.exp(-10 * dt);
        this.kvx *= k;
        this.kvy *= k;
    }

    // ---- actions -----------------------------------------------------------

    /** Pressing the active monster's key does nothing; another key swaps in. */
    private trySwap(): boolean {
        for (let i = 0; i < this.team.length; i++) {
            const action = `swap${i}` as Action;
            if (!input.has(action, T.inputBuffer.swap)) continue;
            input.consume(action);
            if (this.active === i || this.swapCd > 0) return true;
            this.w.requestSwap(i);
            return true;
        }
        return false;
    }

    private tryGuard(): boolean {
        if (this.guardBreakCd > 0) return false;
        if (!input.has('guard', T.inputBuffer.guard)) return false;
        input.consume('guard');
        this.guardHits = 0;
        this.enter('guard');
        this.w.fx.ring(this.x, this.y, this.r + 4, this.r + 30, C.heavy, 6, 0.22);
        return true;
    }

    /** Q while the energy bar is full: the active monster strikes its transform pose, then transforms. */
    private tryTrans(): boolean {
        if (this.transT > 0) return false;
        if (!this.transReady) return false;
        if (!this.unit().alive) return false;
        if (!input.has('trans', T.inputBuffer.trans)) return false;
        input.consume('trans');
        this.unit().energy = 0;
        this.invuln = Math.max(this.invuln, T.trans.startup + 0.1);
        this.enter('transform');
        this.w.onTransBegin(this.kind());
        return true;
    }

    /**
     * A held guard absorbed a hit that was neither inside the parry window nor
     * countered. Costs one pip; the 5th absorbed hit breaks the guard. Returns
     * true when the guard broke.
     */
    blockHit(): boolean {
        this.guardHits = Math.min(T.guard.maxHits, this.guardHits + 1);
        if (this.guardHits < T.guard.maxHits) return false;
        this.guardBreakCd = T.guard.breakCooldown;
        return true;
    }

    private tryDodge(mv: { x: number; y: number }): boolean {
        if (this.dodgeCd > 0 || !input.has('dodge', T.inputBuffer.dodge)) return false;
        input.consume('dodge');
        const len = Math.hypot(mv.x, mv.y);
        if (len > 0.15) {
            this.dodgeDx = mv.x / len;
            this.dodgeDy = mv.y / len;
            this.facing = Math.atan2(this.dodgeDy, this.dodgeDx);
            this.dodgeBackward = false;
        } else {
            // no direction held: hop backwards, keep facing forward
            this.dodgeDx = -Math.cos(this.facing);
            this.dodgeDy = -Math.sin(this.facing);
            this.dodgeBackward = true;
        }
        this.dodgeOX = this.x;
        this.dodgeOY = this.y;
        this.dodgeCd = T.dodge.duration + T.dodge.cooldown;
        this.w.fx.sound('dodge');
        this.invuln = Math.max(this.invuln, T.dodge.duration);
        this.trailT = 0;
        this.enter('dodge');
        return true;
    }

    /** Claw: always a combo swing. It never spends the energy bar (only Q does). */
    private tryAttack(mv: { x: number; y: number }): boolean {
        if (!input.has('attack', T.inputBuffer.attack)) return false;
        input.consume('attack');
        const d = this.d();
        this.startSwing(this.comboTimer > 0 ? (this.combo + 1) % d.combo.length : 0, mv);
        return true;
    }

    /** E / SPECIAL: the monster's special when it is off cooldown. */
    private trySpecial(): boolean {
        if (!input.has('special', T.inputBuffer.special)) return false;
        if (!this.specialReady) {
            // pressed too early: drop it so it does not fire by surprise later
            input.consume('special');
            return false;
        }
        input.consume('special');
        this.startSpecial();
        return true;
    }

    /** Bumped on every swing (hunters may answer one with a guard). */
    swingId = 0;

    private startSwing(index: number, mv: { x: number; y: number }): void {
        this.combo = index;
        this.swingId++;
        this.swingDone = false;
        const target = this.w.nearestHunter(this.x, this.y, T.aimAssistRange);
        if (target) this.facing = Math.atan2(target.y - this.y, target.x - this.x);
        else if (Math.hypot(mv.x, mv.y) > 0.15) this.facing = Math.atan2(mv.y, mv.x);
        // the whoosh starts now and peaks on the hit frame (the end of the windup)
        const swarm = this.kind() === 'vampire' && this.transT > 0;
        this.w.fx.sound(swarm ? 'wings' : SWING_SOUND[this.kind()], { align: this.d().combo[index].windup, volume: index === 2 ? 1.25 : 1 });
        this.enter('attack');
    }

    private updateAttack(dt: number, mv: { x: number; y: number }): void {
        const s: SwingDef = this.d().combo[this.combo];
        const strikeEnd = s.windup + s.active;
        if (this.st < strikeEnd) {
            const v = s.lunge / strikeEnd;
            this.x += Math.cos(this.facing) * v * dt;
            this.y += Math.sin(this.facing) * v * dt;
        }
        if (!this.swingDone && this.st >= s.windup) {
            this.swingDone = true;
            this.w.playerSwing(s, this.kind());
        }
        if (this.st >= strikeEnd) {
            // recovery can be cancelled into defense or a swap at any time
            if (this.trySwap() || this.tryTrans() || this.tryGuard() || this.tryDodge(mv) || this.trySpecial()) return;
            if (this.st >= strikeEnd + s.recover * T.comboCancelAt && input.has('attack', T.inputBuffer.attack)) {
                this.comboTimer = T.comboResetTime;
                this.tryAttack(mv);
                return;
            }
        }
        if (this.st >= strikeEnd + s.recover) {
            this.comboTimer = T.comboResetTime;
            this.enter('idle');
        }
    }

    private updateDodge(dt: number): void {
        const d = T.dodge;
        // ease-out dash: velocity falls linearly to zero and integrates to d.distance
        const v = (d.distance / d.duration) * 2 * Math.max(0, 1 - this.st / d.duration);
        this.x += this.dodgeDx * v * dt;
        this.y += this.dodgeDy * v * dt;
        this.trailT -= dt;
        if (this.trailT <= 0) {
            this.trailT = 0.03;
            this.w.fx.trail(this.x, this.y, C.wolf, this.r, 0.22);
        }
        if (this.st >= d.duration) this.enter('idle');
    }

    /** Swap requests are resolved by World (which may redirect to Crimson Rain). */
    beginSwap(target: number, briefInvuln: boolean): void {
        const old = this.team[this.active];
        this.active = target;
        this.swapCd = T.tag.cooldown;
        if (briefInvuln) this.invuln = Math.max(this.invuln, T.tag.invuln);
        this.comboTimer = 0;
        this.kvx = 0;
        this.kvy = 0;
        // a transformation belongs to its monster: swapping out drops it quietly
        this.transT = 0;
        if (old === this.unit()) return;
        this.specialLanded = false;
        const faceTarget = this.w.nearestHunter(this.x, this.y, T.aimAssistRange * 1.5);
        if (faceTarget) this.facing = Math.atan2(faceTarget.y - this.y, faceTarget.x - this.x);
        this.fromX = this.x;
        this.fromY = this.y;
        this.enter('entry');
        this.w.onSwap();
    }

    private updateEntry(dt: number): void {
        // short ease-out lunge integrating to entryLunge; World resolves the spin hit
        const t = this.st / T.tag.entryDuration;
        const v = ((2 * T.tag.entryLunge) / T.tag.entryDuration) * Math.max(0, 1 - t);
        this.x += Math.cos(this.facing) * v * dt;
        this.y += Math.sin(this.facing) * v * dt;
        if (this.st >= T.tag.entryDuration * 0.45 && !this.specialLanded) {
            this.specialLanded = true;
            this.w.entryStrike(this.kind());
        }
        if (this.st >= T.tag.entryDuration) this.enter('idle');
    }

    /** Called by World when a guarded purple attack lands inside the parry window. */
    startCounter(target: Hunter): void {
        this.counterTarget = target;
        this.counterHit = false;
        const ang = Math.atan2(target.y - this.y, target.x - this.x);
        this.facing = ang;
        this.fromX = this.x;
        this.fromY = this.y;
        const gap = target.r + this.r + 6;
        this.toX = target.x - Math.cos(ang) * gap;
        this.toY = target.y - Math.sin(ang) * gap;
        this.invuln = Math.max(this.invuln, T.counter.duration);
        this.enter('counter');
    }

    private updateCounter(): void {
        const c = T.counter;
        const t = Math.min(1, this.st / c.zip);
        this.x = this.fromX + (this.toX - this.fromX) * t;
        this.y = this.fromY + (this.toY - this.fromY) * t;
        if (!this.counterHit && this.st >= c.zip) {
            this.counterHit = true;
            if (this.counterTarget) this.w.counterStrike(this.counterTarget);
        }
        if (this.st >= c.duration) {
            this.counterTarget = null;
            this.enter('idle');
        }
    }

    private startSpecial(): void {
        this.w.tutorialEvent('special');
        const p: PounceDef = this.d().special;
        const u = this.unit();
        u.specialCd = this.d().specialCooldown * this.w.boost.cooldown;
        this.specialLanded = false;
        this.bitten.clear();
        this.fromX = this.x;
        this.fromY = this.y;
        const target = this.w.nearestHunter(this.x, this.y, p.maxRange);
        if (target) this.facing = Math.atan2(target.y - this.y, target.x - this.x);
        if (p.style === 'smash') {
            // the Stitched plants its feet and smashes the ground in front
            this.toX = this.x;
            this.toY = this.y;
        } else if (target) {
            this.toX = target.x;
            this.toY = target.y;
        } else {
            this.toX = this.x + Math.cos(this.facing) * p.maxRange * 0.5;
            this.toY = this.y + Math.sin(this.facing) * p.maxRange * 0.5;
        }
        this.invuln = Math.max(this.invuln, p.duration + p.recover);
        const color = this.kind() === 'vampire' ? C.counter : this.kind() === 'stitched' ? C.rod : C.wolf;
        this.w.fx.text(this.x, this.y - 60, this.d().specialText, color, 40, 0.9);
        if (p.style === 'swarm') this.w.fx.burst(this.x, this.y, C.bat, 22, 420, 7, 0.4, false);
        this.w.fx.sound(p.style === 'pounce' ? 'growl' : p.style === 'swarm' ? 'wings' : 'zap', { volume: 1.2 });
        this.enter('special');
    }

    private updateSpecial(dt: number): void {
        const p = this.d().special;
        const t = Math.min(1, this.st / p.duration);
        if (p.style !== 'smash') {
            const e = 1 - (1 - t) * (1 - t);
            this.x = this.fromX + (this.toX - this.fromX) * e;
            this.y = this.fromY + (this.toY - this.fromY) * e;
        }
        if (p.style === 'swarm' && !this.specialLanded) {
            this.w.swarmBite(this.x, this.y, this.bitten);
            this.trailT -= dt;
            if (this.trailT <= 0) {
                this.trailT = 0.04;
                this.w.fx.trail(this.x, this.y, C.bat, this.r * 1.4, 0.3);
            }
        }
        if (!this.specialLanded && t >= 1) {
            this.specialLanded = true;
            const off = p.offset ?? 0;
            this.w.specialLand(this.kind(), this.x + Math.cos(this.facing) * off, this.y + Math.sin(this.facing) * off);
        }
        if (this.st >= p.duration + p.recover) this.enter('idle');
    }

    /** Shove the body without hurting it (the Gravelord's roar). */
    push(angle: number, amount: number): void {
        this.kvx += Math.cos(angle) * amount;
        this.kvy += Math.sin(angle) * amount;
    }

    /** Called by World for a hit that got through. */
    takeHit(dmg: number, fromAngle: number): void {
        const u = this.unit();
        // Full Moon: the wolf cannot drop below 1 hp while transformed
        const floor = this.transT > 0 && this.kind() === 'werewolf' ? T.trans.werewolf.floorHp : 0;
        u.hp = Math.max(floor, u.hp - dmg);
        this.kvx += Math.cos(fromAngle) * T.hurt.knock;
        this.kvy += Math.sin(fromAngle) * T.hurt.knock;
        this.flashT = 0.1;
        if (u.hp > 0) {
            this.invuln = T.hurt.invuln;
            this.hurtFlicker = T.hurt.invuln;
            this.enter('hurt');
            return;
        }
        u.alive = false;
        const next = this.team.findIndex((m) => m.alive);
        if (next < 0) {
            this.enter('dead');
            return;
        }
        // the fallen monster tags in the next ally; recovery is instant
        this.beginSwap(next, false);
        this.w.onMonsterDown(u.kind);
    }
}

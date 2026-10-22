/**
 * First-run tutorial: before wave 1 of a player's first hunt, one training
 * knight and eight short steps that each wait for the real action (move,
 * claw, dodge a red jab, guard a purple heavy into a counter, swap, special,
 * transform, finish it). The knight is scripted (idle, jab or heavy only, no
 * guard) and cannot fall before the last step; the team cannot fall either.
 * SKIP ends it at any time. Replay from How to Play.
 */
import type { Hunter } from './hunter.ts';
import type { World } from './world.ts';
import { store } from '../state/store.ts';
import { T } from './tuning.ts';

export type TutorialEvent = 'hit' | 'dodge' | 'fail' | 'counter' | 'swap' | 'special' | 'transform' | 'kill';

interface Step {
    /** Prompt for touch and for keyboard. */
    touch: string;
    keys: string;
    /** What the knight does during this step. */
    knight: 'idle' | 'jab' | 'heavy';
    /** Event(s) that complete the step, and how many. */
    done: TutorialEvent | 'move';
    count?: number;
}

const STEPS: Step[] = [
    { touch: 'Drag the left side of the screen to move', keys: 'Move with W A S D', knight: 'idle', done: 'move' },
    { touch: 'Tap CLAW to hit the knight (3 hits)', keys: 'Press J or click to claw the knight (3 hits)', knight: 'idle', done: 'hit', count: 3 },
    { touch: 'RED flash = jab. Tap DODGE as it swings', keys: 'RED flash = jab. Press SPACE to dodge as it swings', knight: 'jab', done: 'dodge' },
    { touch: 'PURPLE = heavy. Tap GUARD as it lands to COUNTER', keys: 'PURPLE = heavy. Press L as it lands to COUNTER', knight: 'heavy', done: 'counter' },
    { touch: 'Tag in a teammate: tap a portrait at the top', keys: 'Tag in a teammate: press 2 or 3', knight: 'idle', done: 'swap' },
    { touch: 'Tap SPECIAL for a big move (it recharges)', keys: 'Press E for a special move (it recharges)', knight: 'idle', done: 'special' },
    { touch: 'Your bar is full: tap TRNS to TRANSFORM', keys: 'Your bar is full: press Q to TRANSFORM', knight: 'idle', done: 'transform' },
    { touch: 'Finish the knight!', keys: 'Finish the knight!', knight: 'idle', done: 'kill' },
];

export const TUTORIAL_STEPS = STEPS.length;

export class Tutorial {
    step = 0;
    private progress = 0;
    private knight: Hunter | null = null;
    private outro = -1;
    done = false;

    constructor(private readonly w: World) {
        this.enter(0);
    }

    /** Spawn the training knight in front of the player. */
    setKnight(h: Hunter): void {
        this.knight = h;
        h.immortal = true;
        this.applyScript();
    }

    private get s(): Step {
        return STEPS[Math.min(this.step, STEPS.length - 1)];
    }

    private applyScript(): void {
        const k = this.knight;
        if (!k) return;
        k.script = this.s.knight;
        // the last step: it can fall now, and quickly
        if (this.s.done === 'kill') {
            k.immortal = false;
            k.hp = Math.min(k.hp, k.hpMax * 0.15);
        }
    }

    private publish(note = ''): void {
        const mode = store.get().inputMode;
        store.patch({
            tutorial: {
                step: this.step + 1,
                total: STEPS.length,
                text: mode === 'keyboard' ? this.s.keys : this.s.touch,
                note,
            },
        });
    }

    private enter(i: number): void {
        this.step = i;
        this.progress = 0;
        const p = this.w.player;
        // set the stage each step needs
        if (this.s.done === 'special') for (const m of p.team) m.specialCd = 0;
        if (this.s.done === 'transform') p.unit().energy = T.energy.max;
        this.applyScript();
        this.publish();
    }

    private advance(): void {
        const p = this.w.player;
        this.w.fx.text(p.x, p.y - 120, 'NICE!', 0x86efac, 40, 0.9);
        this.w.fx.sound('parry', { volume: 0.6 });
        if (this.step + 1 >= STEPS.length) {
            this.outro = 2.4;
            store.patch({ tutorial: { step: STEPS.length, total: STEPS.length, text: "You're ready. The hunt begins!", note: '' } });
            return;
        }
        this.enter(this.step + 1);
    }

    event(e: TutorialEvent, n = 1): void {
        if (this.outro >= 0 || this.done) return;
        if (e === 'fail' && (this.s.done === 'dodge' || this.s.done === 'counter')) {
            this.publish(this.s.done === 'dodge' ? 'Too late: dodge the moment it flashes and swings' : 'Guard right as the purple swing lands');
            return;
        }
        if (e !== this.s.done) return;
        this.progress += n;
        if (this.progress >= (this.s.count ?? 1)) this.advance();
        else this.publish(`${this.progress} / ${this.s.count}`);
    }

    update(dt: number): void {
        if (this.done) return;
        const p = this.w.player;
        // nobody falls during the lesson
        for (const m of p.team) m.hp = Math.max(m.hp, p.maxHp(m.kind) * 0.5);
        if (this.outro >= 0) {
            this.outro -= dt;
            if (this.outro < 0) this.finish();
            return;
        }
        if (this.s.done === 'move' && p.state === 'move') {
            this.progress += dt;
            if (this.progress >= 1.0) this.advance();
        }
        // the knight fell early (it should not): move on
        if (this.knight && !this.knight.alive && this.s.done !== 'kill') this.finish();
    }

    /** Done or skipped: clear the knight and the prompt; the waves start. */
    finish(): void {
        if (this.done) return;
        this.done = true;
        if (this.knight && this.knight.alive) {
            this.knight.crumbleQuietly();
        }
        store.patch({ tutorial: null });
        void import('../sdk/progress.ts').then((m) => m.markTutorialDone()).catch(() => undefined);
    }
}

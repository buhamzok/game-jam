/**
 * Input shared by the touch controls (React), the keyboard and the mouse.
 * Game code reads it every frame; nothing here re-renders React except the
 * input-mode switch (touch vs keyboard), which flips the on-screen controls.
 *
 * Buttons are buffered: a press is remembered with its timestamp and the game
 * consumes it once the player is free to act, so a tap that lands a few frames
 * early is not lost.
 *
 * PC layout: WASD (or arrows) move; J or left click = claw; Space, K or Shift
 * = dodge; L or right click = guard/counter.
 */
import { store } from '../state/store.ts';

export type Action = 'attack' | 'dodge' | 'guard' | 'trans' | 'swap0' | 'swap1' | 'swap2';
export type InputMode = 'touch' | 'keyboard';

const KEY_ACTIONS: Record<string, Action> = {
    KeyJ: 'attack',
    Space: 'dodge',
    KeyK: 'dodge',
    ShiftLeft: 'dodge',
    ShiftRight: 'dodge',
    KeyL: 'guard',
    KeyQ: 'trans',
    Digit1: 'swap0',
    Digit2: 'swap1',
    Digit3: 'swap2',
};

/** Key labels for on-screen hints, per action. */
export const KEY_HINTS: Record<Action, string> = {
    attack: 'J / Click',
    dodge: 'Space',
    guard: 'L / R-Click',
    trans: 'Q',
    swap0: '1',
    swap1: '2',
    swap2: '3',
};

const KEY_DIRS: Record<string, [number, number]> = {
    KeyW: [0, -1],
    ArrowUp: [0, -1],
    KeyS: [0, 1],
    ArrowDown: [0, 1],
    KeyA: [-1, 0],
    ArrowLeft: [-1, 0],
    KeyD: [1, 0],
    ArrowRight: [1, 0],
};

function setMode(mode: InputMode): void {
    if (store.get().inputMode !== mode) store.patch({ inputMode: mode });
}

class Input {
    private joyX = 0;
    private joyY = 0;
    private keys = new Set<string>();
    private pressedAt: Record<Action, number> = { attack: -1, dodge: -1, guard: -1, trans: -1, swap0: -1, swap1: -1, swap2: -1 };
    private holds: Set<Action> = new Set();

    press(action: Action): void {
        this.pressedAt[action] = performance.now();
        this.holds.add(action);
    }

    release(action: Action): void {
        this.holds.delete(action);
    }

    /** True while the button is physically held down (hold-to-block). */
    held(action: Action): boolean {
        return this.holds.has(action);
    }

    /** True if `action` was pressed within the last `bufferSec` seconds and not yet consumed. */
    has(action: Action, bufferSec: number): boolean {
        const t = this.pressedAt[action];
        return t >= 0 && performance.now() - t <= bufferSec * 1000;
    }

    consume(action: Action): void {
        this.pressedAt[action] = -1;
    }

    /** Joystick vector in -1..1 per axis; the touch control clamps it to the unit circle. */
    setJoystick(x: number, y: number): void {
        this.joyX = x;
        this.joyY = y;
    }

    /** Combined movement vector, length at most 1. */
    getMove(): { x: number; y: number } {
        let x = this.joyX;
        let y = this.joyY;
        for (const code of this.keys) {
            const d = KEY_DIRS[code];
            if (d) {
                x += d[0];
                y += d[1];
            }
        }
        const len = Math.hypot(x, y);
        if (len > 1) {
            x /= len;
            y /= len;
        }
        return { x, y };
    }

    reset(): void {
        this.joyX = 0;
        this.joyY = 0;
        this.keys.clear();
        this.holds.clear();
        this.pressedAt = { attack: -1, dodge: -1, guard: -1, trans: -1, swap0: -1, swap1: -1, swap2: -1 };
    }

    /**
     * Keyboard anywhere on the page, mouse buttons on `playArea` (the game
     * canvas; UI buttons sit above it and keep their own clicks). Any touch
     * switches the on-screen controls back to touch mode. Returns a detach
     * function.
     */
    attachDesktop(playArea: HTMLElement): () => void {
        const down = (e: KeyboardEvent) => {
            if (KEY_DIRS[e.code] || KEY_ACTIONS[e.code]) e.preventDefault();
            if (e.repeat) return;
            this.keys.add(e.code);
            const action = KEY_ACTIONS[e.code];
            if (action) this.press(action);
            if (KEY_DIRS[e.code] || action) setMode('keyboard');
        };
        const up = (e: KeyboardEvent) => {
            this.keys.delete(e.code);
            const action = KEY_ACTIONS[e.code];
            if (action) this.release(action);
        };
        const blur = () => {
            this.keys.clear();
            this.holds.clear();
        };
        const MOUSE_TO_ACTION: Record<number, Action> = { 0: 'attack', 2: 'guard' };
        const mouse = (e: PointerEvent) => {
            if (e.pointerType === 'touch') {
                setMode('touch');
                return;
            }
            if (e.pointerType !== 'mouse') return;
            const action = MOUSE_TO_ACTION[e.button];
            if (!action) return;
            this.press(action);
            e.preventDefault();
            setMode('keyboard');
        };
        const mouseUp = (e: PointerEvent) => {
            const action = MOUSE_TO_ACTION[e.button];
            if (action) this.release(action);
        };
        const touch = () => setMode('touch');
        const noMenu = (e: Event) => e.preventDefault();
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        window.addEventListener('blur', blur);
        window.addEventListener('touchstart', touch, { passive: true });
        playArea.addEventListener('pointerdown', mouse);
        window.addEventListener('pointerup', mouseUp);
        playArea.addEventListener('contextmenu', noMenu);
        return () => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('keyup', up);
            window.removeEventListener('blur', blur);
            window.removeEventListener('touchstart', touch);
            playArea.removeEventListener('pointerdown', mouse);
            window.removeEventListener('pointerup', mouseUp);
            playArea.removeEventListener('contextmenu', noMenu);
        };
    }
}

export const input = new Input();

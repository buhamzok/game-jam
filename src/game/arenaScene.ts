/**
 * The arena game: wires the 3D view (which owns the simulation) to the page
 * and keyboard input. Returned handle: { destroy(), setPaused() }.
 */
import { GameView } from './view/gameView.ts';
import { input } from './input.ts';
import { audio } from './audio.ts';

export interface Game {
    destroy(): void;
    setPaused(paused: boolean): void;
}

export function createArenaGame(host: HTMLElement): Game {
    input.reset();
    const detachKeys = input.attachDesktop(host);
    const view = new GameView(host);

    // Dev-only handle for poking at the live game from the browser console.
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('__ttt')) (window as unknown as { __ttt?: unknown }).__ttt = { view, world: view.world, input, audio };

    return {
        setPaused: (paused) => view.setPaused(paused),
        destroy() {
            detachKeys();
            input.reset();
            view.destroy();
        },
    };
}

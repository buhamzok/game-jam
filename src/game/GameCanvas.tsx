/**
 * React ↔ three.js boundary. React owns WHEN the game exists (mount/unmount
 * with the 'playing' phase); the GameView owns everything inside its canvas.
 * No React state flows in per-frame: game → UI communication goes through the
 * store.
 */
import { useEffect, useRef } from 'react';
import { createArenaGame, type Game } from './arenaScene.ts';
import { useStore } from '../state/store.ts';

export default function GameCanvas() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    const gameRef = useRef<Game | null>(null);
    const paused = useStore((s) => s.paused);

    useEffect(() => {
        // hostRef is always attached by the time the effect runs
        const game = createArenaGame(hostRef.current!);
        gameRef.current = game;
        return () => {
            game.destroy();
            gameRef.current = null;
        };
    }, []);

    // Host lifecycle pause/resume freezes the game loop.
    useEffect(() => {
        gameRef.current?.setPaused(paused);
    }, [paused]);

    return <div ref={hostRef} className="absolute inset-0" />;
}

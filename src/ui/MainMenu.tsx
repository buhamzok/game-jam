/**
 * Title screen. Teaches the one rule that matters before the first fight:
 * dodge red, counter purple.
 */
import { useEffect } from 'react';
import { store, useStore } from '../state/store.ts';
import { audio } from '../game/audio.ts';
import { fetchDailyBoard } from '../sdk/dailyHunt.ts';

function fight() {
    audio.play('click');
    store.patch({ phase: 'playing', gameOver: false });
}

export default function MainMenu() {
    const board = useStore((s) => s.board);
    const bestWave = useStore((s) => s.bestWave);
    const streak = useStore((s) => s.streak);
    useEffect(() => {
        void fetchDailyBoard();
    }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Enter' || e.code === 'Space') e.preventDefault();
            if (e.code === 'Enter' || e.code === 'Space') fight();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-6 text-center">
            <div>
                <p className="text-sm font-black tracking-[0.4em] text-violet-300/80">MONSTER MASH</p>
                <h1 className="text-4xl font-black leading-none tracking-wide text-primary drop-shadow-[0_4px_0_rgba(0,0,0,0.8)]">
                    TAG TEAM
                    <br />
                    TERROR
                </h1>
            </div>

            <button
                type="button"
                className="rounded-2xl bg-primary px-14 py-3.5 text-2xl font-black text-black shadow-lg transition-transform active:scale-95"
                onClick={fight}
            >
                FIGHT
            </button>

            <div className="w-full max-w-xs rounded-2xl bg-black/40 p-3 text-sm font-bold">
                <div className="flex items-center justify-between">
                    <p className="text-[11px] font-black tracking-[0.25em] text-amber-300">DAILY HUNT</p>
                    <p className="text-xs text-white/70 tabular-nums">
                        best wave {bestWave || '—'}
                        {streak > 0 ? ` · ${streak}d streak` : ''}
                    </p>
                </div>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-white/70 tabular-nums">
                    {board.length === 0 ? (
                        <p className="text-white/40">Reach a wave to be the first on today's board.</p>
                    ) : (
                        board.map((e) => (
                            <div key={e.rank ?? e.username} className="flex justify-between">
                                <span className="truncate pr-2">
                                    {e.rank === 1 ? '\u{1F947} ' : e.rank === 2 ? '\u{1F948} ' : e.rank === 3 ? '\u{1F949} ' : ''}
                                    {e.username || 'hunter'}
                                </span>
                                <span className="text-amber-300">wave {e.score}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            <div className="flex w-full max-w-xs flex-col gap-1 rounded-2xl bg-black/40 p-3 text-left text-xs font-bold">
                <p>
                    <span className="text-red-400">Red:</span> DODGE it. Last moment = <span className="text-violet-300">Witching Hour</span>.
                </p>
                <p>
                    <span className="text-violet-400">Purple:</span> GUARD right as it lands = <span className="text-violet-300">COUNTER</span>.
                </p>
                <p>
                    <span className="text-amber-400">Full bar:</span> next CLAW = special, or TRANSFORM for 10 s.
                </p>
            </div>

            <p className="text-[10px] leading-tight text-white/40">WASD move · J claw · Space dodge · L guard · Q transform · 1 2 3 swap · M sound · Enter fight</p>
        </div>
    );
}

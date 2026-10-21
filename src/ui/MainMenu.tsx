/**
 * Title screen: the three monsters idle in the graveyard behind the menu
 * (MenuScene, wearing their equipped skins). FIGHT, PVP, the level card
 * (opens UPGRADES), SKINS and HOW TO PLAY up front, a friend's challenge when
 * there is one, and the Daily Hunt.
 */
import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../state/store.ts';
import { audio } from '../game/audio.ts';
import { fetchDailyBoard } from '../sdk/dailyHunt.ts';
import { freePoints } from '../sdk/progress.ts';
import { LevelBar } from './Upgrades.tsx';

function fight() {
    audio.play('click');
    store.patch({ phase: 'playing', mode: 'hunt', gameOver: false });
}

/** The 3D lineup behind the menu; it falls back to the plain night color if WebGL fails. */
function Backdrop() {
    const host = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        let scene: { destroy(): void } | null = null;
        let gone = false;
        void import('../game/view/menuScene.ts')
            .then(({ MenuScene }) => {
                if (gone || !host.current) return;
                scene = new MenuScene(host.current);
                if (import.meta.env.DEV) (window as unknown as { __menu?: unknown }).__menu = scene;
            })
            .catch((err) => console.warn('[menu] backdrop failed', err));
        return () => {
            gone = true;
            scene?.destroy();
        };
    }, []);
    return <div ref={host} className="absolute inset-0" />;
}

function HowToPlay({ onClose }: { onClose: () => void }) {
    const rows: [string, string, string][] = [
        ['Claw combo', 'J / click', 'CLAW'],
        ['Special (recharges)', 'E', 'SPECIAL'],
        ['Dodge', 'Space', 'DODGE'],
        ['Guard / counter', 'L / right-click', 'GUARD'],
        ['Transform (full bar)', 'Q', 'TRNS'],
        ['Swap monster', '1 2 3', 'portraits'],
    ];
    return (
        <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center bg-black/70 px-6" onClick={onClose}>
            <div className="w-full max-w-sm rounded-2xl bg-surface/95 p-4 ring-1 ring-white/15" onClick={(e) => e.stopPropagation()}>
                <p className="text-center text-lg font-black tracking-[0.3em] text-primary">HOW TO PLAY</p>
                <div className="mt-3 flex flex-col gap-1.5 text-sm font-bold">
                    <p>
                        <span className="text-red-400">Red</span> attacks: <span className="text-white">DODGE</span>. At the last moment: <span className="text-violet-300">Witching Hour</span>.
                    </p>
                    <p>
                        <span className="text-violet-400">Purple</span> attacks: <span className="text-white">GUARD</span> as it lands to <span className="text-violet-300">COUNTER</span>.
                    </p>
                    <p>
                        <span className="text-sky-300">Blue shields</span>: break them with a combo finisher or a special, or hit from behind.
                    </p>
                    <p>
                        <span className="text-amber-400">Full bar</span>: TRANSFORM for 10 s. Only transforming spends the bar.
                    </p>
                    <p>
                        Every 5 waves the <span className="text-rose-300">Gravelord</span> rises. Beat it to open a portal to the next of ten realms; half the portals leave a health potion.
                    </p>
                </div>
                <table className="mt-3 w-full text-left text-xs font-bold text-white/80">
                    <thead className="text-[10px] tracking-widest text-white/50">
                        <tr>
                            <th className="py-1">ACTION</th>
                            <th>KEYBOARD</th>
                            <th>PHONE</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([a, k, p]) => (
                            <tr key={a} className="border-t border-white/10">
                                <td className="py-1">{a}</td>
                                <td className="text-amber-200">{k}</td>
                                <td className="text-white/60">{p}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <button type="button" className="mt-4 w-full rounded-xl bg-primary py-2.5 text-base font-black text-black active:scale-95" onClick={onClose}>
                    GOT IT
                </button>
            </div>
        </div>
    );
}

export default function MainMenu() {
    const board = useStore((s) => s.board);
    const bestWave = useStore((s) => s.bestWave);
    const streak = useStore((s) => s.streak);
    const challenge = useStore((s) => s.challenge);
    const souls = useStore((s) => s.souls);
    const inputMode = useStore((s) => s.inputMode);
    const points = useStore((s) => freePoints(s));
    const [help, setHelp] = useState(false);
    useEffect(() => {
        void fetchDailyBoard();
    }, []);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (help) {
                if (e.code === 'Escape' || e.code === 'Enter') setHelp(false);
                return;
            }
            if (e.code === 'Enter' || e.code === 'Space') {
                e.preventDefault();
                fight();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [help]);
    const top = board[0];
    return (
        <div className="absolute inset-0 overflow-hidden">
            <Backdrop />
            {/* darken top and bottom so the text reads over the scene */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(13,10,22,0.85)_0%,rgba(13,10,22,0)_26%,rgba(13,10,22,0)_48%,rgba(13,10,22,0.92)_74%)] landscape:bg-[linear-gradient(to_right,rgba(13,10,22,0)_35%,rgba(13,10,22,0.9)_70%)]" />

            <div className="absolute inset-0 flex flex-col items-center px-6 pb-6 pt-8 text-center landscape:items-end landscape:justify-center landscape:px-[6vw] landscape:pt-6">
                <div className="landscape:w-80">
                    <p className="text-xs font-black tracking-[0.5em] text-violet-300/90">MONSTER MASH</p>
                    <h1 className="title-glow mt-1 text-5xl font-black italic leading-[0.9] tracking-wide text-primary">
                        TAG TEAM
                        <br />
                        TERROR
                    </h1>
                </div>

                <div className="flex-1 landscape:hidden" />

                <div className="flex w-full max-w-xs flex-col items-stretch gap-2.5 landscape:mt-6 landscape:w-80">
                    {challenge && (
                        <div className="rounded-2xl bg-amber-400/15 p-3 ring-2 ring-amber-400/70 backdrop-blur-sm">
                            <p className="text-[11px] font-black tracking-[0.25em] text-amber-300">{'⚔'} CHALLENGE</p>
                            <p className="mt-1 text-base font-black text-white">
                                {challenge.from} reached wave {challenge.wave}
                                {challenge.kills > 0 ? ` with ${challenge.kills} KOs` : ''}.
                            </p>
                            <p className="text-sm font-bold text-white/70">Get past wave {challenge.wave} to beat them.</p>
                        </div>
                    )}

                    <button
                        type="button"
                        className="fight-pulse rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 py-4 text-3xl font-black tracking-wider text-black shadow-[0_6px_0_#92400e] transition-transform active:translate-y-1 active:shadow-[0_2px_0_#92400e]"
                        onClick={fight}
                    >
                        {challenge ? 'ACCEPT' : 'FIGHT'}
                    </button>

                    <button
                        type="button"
                        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-rose-500 to-rose-700 py-2.5 font-black text-white shadow-[0_4px_0_#881337] transition-transform active:translate-y-0.5"
                        onClick={() => {
                            audio.play('click');
                            store.patch({ phase: 'pvp', rival: null });
                        }}
                    >
                        <span className="text-lg tracking-wider">{'\u2694'} PVP ARENA</span>
                        <span className="text-[11px] text-rose-100/80">fight a rival team</span>
                    </button>

                    <button
                        type="button"
                        className={`relative rounded-xl bg-black/55 px-3 py-2 ring-1 backdrop-blur-sm transition-transform active:scale-[0.98] ${points > 0 ? 'ring-2 ring-amber-400/80' : 'ring-white/10'}`}
                        onClick={() => {
                            audio.play('click');
                            store.patch({ phase: 'upgrades' });
                        }}
                    >
                        <LevelBar compact />
                        <span className={`absolute right-2 top-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-black tracking-wider ${points > 0 ? 'animate-pulse bg-amber-400 text-black' : 'bg-white/10 text-white/70'}`}>
                            {points > 0 ? `${points} POINTS: UPGRADE` : 'UPGRADES'}
                        </span>
                    </button>

                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            type="button"
                            className="flex flex-col items-center rounded-xl bg-violet-600/90 py-2 font-black text-white shadow-[0_4px_0_#4c1d95] transition-transform active:translate-y-0.5"
                            onClick={() => {
                                audio.play('click');
                                store.patch({ phase: 'skins' });
                            }}
                        >
                            <span className="text-base tracking-wider">SKINS</span>
                            <span className="text-[11px] text-violet-200 tabular-nums">
                                {'\u{1F47B}'} {souls} Souls
                            </span>
                        </button>
                        <button
                            type="button"
                            className="flex flex-col items-center rounded-xl bg-white/10 py-2 font-black text-white shadow-[0_4px_0_rgba(0,0,0,0.5)] ring-1 ring-white/15 backdrop-blur-sm transition-transform active:translate-y-0.5"
                            onClick={() => {
                                audio.play('click');
                                setHelp(true);
                            }}
                        >
                            <span className="text-base tracking-wider">HOW TO PLAY</span>
                            <span className="text-[11px] text-white/60">controls & tips</span>
                        </button>
                    </div>

                    <div className="rounded-xl bg-black/50 px-3 py-2 text-left ring-1 ring-white/10 backdrop-blur-sm">
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] font-black tracking-[0.25em] text-amber-300">DAILY HUNT</p>
                            <p className="text-[11px] font-bold text-white/70 tabular-nums">
                                best wave {bestWave || '—'}
                                {streak > 0 ? ` · ${streak}d streak` : ''}
                            </p>
                        </div>
                        <p className="mt-0.5 truncate text-xs font-bold text-white/60 tabular-nums">
                            {top ? (
                                <>
                                    {'\u{1F947}'} {top.username || 'hunter'} leads with <span className="text-amber-300">wave {top.score}</span>
                                </>
                            ) : (
                                "Reach a wave to be first on today's board."
                            )}
                        </p>
                    </div>

                    {inputMode === 'keyboard' && <p className="text-[10px] font-bold text-white/40">Enter to fight</p>}
                </div>
            </div>

            {help && <HowToPlay onClose={() => setHelp(false)} />}
        </div>
    );
}

/**
 * Level and stat points (from the menu or the end screen). Each level gives
 * points; each point boosts the whole tag team in one stat. Points can be
 * taken back for free (RESET), so trying builds costs nothing.
 */
import { useEffect } from 'react';
import { store, useStore } from '../state/store.ts';
import { audio } from '../game/audio.ts';
import { LEVEL, STATS, boostsFor, levelFor } from '../game/progression.ts';
import { freePoints, resetStats, spendPoint } from '../sdk/progress.ts';

function back() {
    audio.play('click');
    store.patch({ phase: 'menu' });
}

/** Level badge with the XP bar to the next level. */
export function LevelBar({ compact = false }: { compact?: boolean }) {
    const xp = useStore((s) => s.xp);
    const { level, into, need } = levelFor(xp);
    const pct = need ? (into / need) * 100 : 100;
    return (
        <div className="flex w-full items-center gap-2.5">
            <div className={`flex shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-b from-amber-300 to-amber-600 font-black text-black shadow-[0_3px_0_#92400e] ${compact ? 'h-10 w-10' : 'h-14 w-14'}`}>
                <span className="text-[9px] leading-none tracking-widest">LV</span>
                <span className={`${compact ? 'text-lg' : 'text-2xl'} leading-none tabular-nums`}>{level}</span>
            </div>
            <div className="min-w-0 flex-1">
                <div className="h-2.5 overflow-hidden rounded-full bg-black/60 ring-1 ring-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-left text-[11px] font-bold text-white/60 tabular-nums">{need ? `${into} / ${need} XP to level ${level + 1}` : `Max level (${LEVEL.max})`}</p>
            </div>
        </div>
    );
}

const pctText = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 1000) / 10}%`;

export default function Upgrades() {
    const stats = useStore((s) => s.stats);
    const level = useStore((s) => s.level);
    const free = useStore((s) => freePoints(s));
    const b = boostsFor(stats);
    const now: Record<string, number> = { vitality: b.hp - 1, strength: b.dmg - 1, agility: b.speed - 1, fury: b.energy - 1, focus: b.cooldown - 1 };

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Escape') back();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <div className="flex h-full flex-col gap-3 overflow-y-auto px-5 py-5">
            <div className="flex items-center justify-between">
                <button type="button" className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-black text-white active:scale-95" onClick={back}>
                    {'←'} Back
                </button>
                <p className="text-xl font-black tracking-widest text-primary">UPGRADES</p>
                <p className={`rounded-xl px-3 py-1.5 text-sm font-black tabular-nums ${free > 0 ? 'bg-amber-400 text-black' : 'bg-black/50 text-white/70'}`}>
                    {free} {free === 1 ? 'point' : 'points'}
                </p>
            </div>

            <div className="rounded-2xl bg-black/45 p-3">
                <LevelBar />
                <p className="mt-2 text-xs font-bold text-white/60">
                    Earn XP from KOs, cleared waves, Gravelords, finished realms and PVP. Every level gives {LEVEL.pointsPerLevel} points (up to level {LEVEL.max}). Each realm is more
                    dangerous than the last, and pays more XP.
                </p>
            </div>

            {STATS.map((s) => {
                const pts = stats[s.id];
                const full = pts >= s.max;
                return (
                    <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-black/45 p-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: `${s.color}33`, boxShadow: `inset 0 0 0 2px ${s.color}88` }}>
                            {s.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                                <p className="text-sm font-black text-white">{s.name}</p>
                                <p className="text-xs font-black tabular-nums" style={{ color: s.color }}>
                                    {pctText(now[s.id])}
                                </p>
                            </div>
                            <p className="text-[11px] font-bold text-white/55">{s.per} per point</p>
                            {/* one pip per point */}
                            <div className="mt-1.5 flex gap-0.5">
                                {Array.from({ length: s.max }, (_, i) => (
                                    <div key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < pts ? s.color : 'rgba(255,255,255,0.12)' }} />
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            aria-label={`Add a point to ${s.name}`}
                            disabled={free <= 0 || full}
                            className="h-11 w-11 shrink-0 rounded-xl bg-amber-400 text-2xl font-black text-black shadow-[0_3px_0_#92400e] active:translate-y-0.5 disabled:bg-white/10 disabled:text-white/30 disabled:shadow-none"
                            onClick={() => {
                                if (spendPoint(s.id)) audio.play('parry', { volume: 0.5 });
                            }}
                        >
                            {full ? '✓' : '+'}
                        </button>
                    </div>
                );
            })}

            <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold text-white/45">Boosts apply to all three monsters, in the hunt and in PVP.</p>
                <button
                    type="button"
                    disabled={free === (level - 1) * LEVEL.pointsPerLevel}
                    className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-black text-white/80 active:scale-95 disabled:opacity-30"
                    onClick={() => {
                        audio.play('click');
                        resetStats();
                    }}
                >
                    RESET (free)
                </button>
            </div>
        </div>
    );
}

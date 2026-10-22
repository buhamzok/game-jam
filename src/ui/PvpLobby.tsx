/**
 * PVP Arena lobby: finds a rival team (another player's saved tag team, or a
 * bot when none is found), shows the versus card, then starts the match in
 * the Blood Pit.
 */
import { useCallback, useEffect, useState } from 'react';
import { store, useStore } from '../state/store.ts';
import { audio } from '../game/audio.ts';
import { T, type MonsterKind } from '../game/tuning.ts';
import { skinById } from '../game/skins.ts';
import { findRival, teamPower, type Rival } from '../sdk/pvp.ts';
import { Swatch } from './SkinShop.tsx';
import { RANK, TIERS, nextTier, tierFor } from '../game/ranks.ts';
import { fetchPvpBoard } from '../sdk/pvpRank.ts';

/** Rank badge, progress to the next tier, record, and this week's top 5. */
function RankCard() {
    const r = useStore((s) => s.pvpRank);
    const board = useStore((s) => s.pvpBoard);
    const t = tierFor(r.rp);
    const n = nextTier(r.rp);
    const pct = n ? ((r.rp - t.at) / (n.at - t.at)) * 100 : 100;
    return (
        <div className="mx-auto mt-4 max-w-md rounded-2xl bg-black/50 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl text-2xl" style={{ background: `${t.color}22`, boxShadow: `inset 0 0 0 2px ${t.color}aa` }}>
                    {t.icon}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between">
                        <p className="text-lg font-black" style={{ color: t.color }}>
                            {t.name.toUpperCase()}
                        </p>
                        <p className="text-xs font-black text-white/70 tabular-nums">{r.rp} RP</p>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: t.color }} />
                    </div>
                    <p className="mt-1 text-[10px] font-bold text-white/50 tabular-nums">
                        {n ? `${n.at - r.rp} RP to ${n.name}` : 'Top tier'} · {r.wins}W {r.losses}L{r.streak > 1 ? ` · ${r.streak} win streak` : ''}
                    </p>
                </div>
            </div>
            <p className="mt-2 text-[10px] font-bold text-white/45">
                Win +{RANK.win} RP (+{RANK.streakBonus} per win in a row), lose -{RANK.loss}. Tiers: {TIERS.map((x) => x.name).join(', ')}.
            </p>
            {board.length > 0 && (
                <div className="mt-2 border-t border-white/10 pt-2">
                    <p className="text-[10px] font-black tracking-[0.2em] text-rose-300">THIS WEEK</p>
                    {board.map((e, i) => (
                        <div key={i} className="flex justify-between text-xs font-bold text-white/80 tabular-nums">
                            <span className="truncate">
                                {e.rank ?? i + 1}. {e.username || 'hunter'}
                            </span>
                            <span style={{ color: tierFor(e.score).color }}>
                                {tierFor(e.score).name} · {e.score}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

const MONSTERS: MonsterKind[] = ['werewolf', 'vampire', 'stitched'];

/** Start the match against the rival in the store. */
export function startPvp(): void {
    audio.play('click');
    const s = store.get();
    store.patch({ mode: 'pvp', phase: 'playing', gameOver: false, runId: s.runId + 1 });
}

function Team({ title, sub, units, accent }: { title: string; sub: string; units: { monster: MonsterKind; skin?: string }[]; accent: string }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <p className="max-w-[9.5rem] text-center text-base font-black leading-tight tracking-wider" style={{ color: accent }}>
                {title}
            </p>
            <p className="-mt-2 text-[11px] font-bold text-white/60">{sub}</p>
            <div className="flex flex-col gap-1.5">
                {units.map((u) => (
                    <div key={u.monster} className="flex items-center gap-2">
                        <Swatch kind={u.monster} skin={skinById(u.skin)} selected={false} />
                        <div className="text-left">
                            <p className="text-xs font-black text-white">{T.monsters[u.monster].name}</p>
                            <p className="text-[10px] font-bold text-white/50">{skinById(u.skin)?.name ?? 'Classic'}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function PvpLobby() {
    const rival = useStore((s) => s.rival);
    const bestWave = useStore((s) => s.bestWave);
    const level = useStore((s) => s.level);
    const equipped = useStore((s) => s.equippedSkins);
    const owned = useStore((s) => s.ownedSkins);
    const [searching, setSearching] = useState(false);

    const search = useCallback(async () => {
        setSearching(true);
        const found: Rival = await findRival();
        store.patch({ rival: found });
        setSearching(false);
        audio.play('swap');
    }, []);

    useEffect(() => {
        void fetchPvpBoard();
        if (!store.get().rival) void search();
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Escape') store.patch({ phase: 'menu' });
            if (e.code === 'Enter' && store.get().rival) startPvp();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [search]);

    const mine = MONSTERS.map((m) => ({ monster: m, skin: equipped[m] && owned.includes(equipped[m]!) ? equipped[m] : undefined }));

    return (
        <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_center,#3b0a14_0%,#0d0a16_70%)] px-5 py-5">
            <div className="flex items-center justify-between">
                <button
                    type="button"
                    className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-black text-white active:scale-95"
                    onClick={() => {
                        audio.play('click');
                        store.patch({ phase: 'menu' });
                    }}
                >
                    {'←'} Back
                </button>
                <p className="text-xl font-black tracking-[0.25em] text-rose-400">PVP ARENA</p>
                <span className="w-16" />
            </div>
            <p className="mt-1 text-center text-xs font-bold text-white/60">
                Fight another player's tag team in the Blood Pit. The game's AI plays their monsters, in their skins.
            </p>

            <div className="mx-auto mt-5 flex max-w-md items-start justify-center gap-4">
                <Team title="YOU" sub={`power ${teamPower(bestWave, level)}`} units={mine} accent="#fbbf24" />
                <p className="mt-16 text-4xl font-black italic text-rose-500 drop-shadow-[0_3px_0_rgba(0,0,0,0.8)]">VS</p>
                {rival && !searching ? (
                    <Team title={rival.name.toUpperCase()} sub={`${rival.bot ? 'bot · ' : ''}power ${rival.power}`} units={rival.units} accent="#fb7185" />
                ) : (
                    <div className="flex w-36 flex-col items-center gap-2 pt-10">
                        <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-400/30 border-t-rose-400" />
                        <p className="text-xs font-bold text-white/60">Finding a rival...</p>
                    </div>
                )}
            </div>

            <RankCard />

            <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2.5">
                <button
                    type="button"
                    disabled={!rival || searching}
                    className="rounded-2xl bg-gradient-to-b from-rose-400 to-rose-600 py-4 text-2xl font-black tracking-wider text-white shadow-[0_6px_0_#881337] transition-transform active:translate-y-1 disabled:opacity-50"
                    onClick={startPvp}
                >
                    FIGHT
                </button>
                <button
                    type="button"
                    disabled={searching}
                    className="rounded-xl bg-white/10 py-2.5 text-sm font-black text-white ring-1 ring-white/15 active:scale-95 disabled:opacity-50"
                    onClick={() => {
                        audio.play('click');
                        void search();
                    }}
                >
                    FIND ANOTHER RIVAL
                </button>
                <p className="text-center text-[11px] font-bold text-white/50">
                    Win: +{T.rival.winSouls} Souls · Lose: +{T.rival.lossSouls}. Your team (and skins) is saved after every hunt for others to fight.
                </p>
            </div>
        </div>
    );
}

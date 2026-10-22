/**
 * PVP rank: rank points saved on this device (`ttt.rank`), a tier from them,
 * and a weekly RUN leaderboard (mode "pvp", period "weekly"; see
 * rundot/leaderboard.config.json). The board keeps each player's best RP of
 * the week. Every SDK call can reject; nothing here throws into the game.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { sdkReady } from './runSdk.ts';
import { store } from '../state/store.ts';
import { telemetry } from './dailyHunt.ts';
import { cacheGet, cacheSet, parseJson } from './skinShop.ts';
import { rpChange, tierFor } from '../game/ranks.ts';

const KEY = 'ttt.rank';

export async function loadRank(): Promise<void> {
    const raw = parseJson<Partial<{ rp: number; wins: number; losses: number; streak: number }>>(await cacheGet(KEY), {});
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    store.patch({ pvpRank: { rp: n(raw.rp), wins: n(raw.wins), losses: n(raw.losses), streak: n(raw.streak) } });
}

/** A PVP match ended: move the RP, save, and post the RP to the weekly board. Returns the change. */
export function recordMatch(win: boolean, seconds: number): number {
    const r = store.get().pvpRank;
    const delta = rpChange(win, r.streak);
    const next = {
        rp: Math.max(0, r.rp + delta),
        wins: r.wins + (win ? 1 : 0),
        losses: r.losses + (win ? 0 : 1),
        streak: win ? r.streak + 1 : 0,
    };
    const before = tierFor(r.rp).name;
    store.patch({ pvpRank: next, pvpRankDelta: { delta, tierUp: tierFor(next.rp).name !== before && delta > 0 ? tierFor(next.rp).name : '' } });
    cacheSet(KEY, JSON.stringify(next));
    telemetry('pvp_rank', { rp: next.rp, tier: tierFor(next.rp).name });
    if (sdkReady() && win) {
        RundotGameAPI.leaderboard
            .submitScore({ score: next.rp, duration: Math.max(15, Math.round(seconds)), mode: 'pvp', period: 'weekly' })
            .catch((err) => console.warn('[pvpRank] submit failed', err));
    }
    return delta;
}

/** This week's top 5 (empty outside the host). */
export async function fetchPvpBoard(): Promise<void> {
    if (!sdkReady()) return;
    try {
        const page = await RundotGameAPI.leaderboard.getPagedScores({ mode: 'pvp', period: 'weekly', limit: 5 });
        store.patch({ pvpBoard: page.entries.slice(0, 5).map((e) => ({ username: e.username, score: e.score, rank: e.rank })) });
    } catch (err) {
        console.warn('[pvpRank] board fetch failed', err);
    }
}

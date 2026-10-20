/**
 * Daily Hunt leaderboard: the wave you reach each day is a score on the RUN
 * leaderboard (mode "default", period "daily"), plus a local all-time best and
 * a daily streak in device storage.
 *
 * Posture: every SDK call rejects and nothing here throws into the game — the
 * board is a garnish, not the loop. Outside the RUN host the module still
 * tracks best/streak locally.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { sdkReady } from './runSdk.ts';
import { store } from '../state/store.ts';

const KEY_BEST = 'ttt.best';
const KEY_DAILY = 'ttt.daily';
const KEY_STREAK = 'ttt.streak';
const KEY_LAST_SUB = 'ttt.subAt';
/** Server anti-cheat rate limit (leaderboard config): one submission per minute. */
const MIN_SUB_GAP = 60;

export interface BoardEntry {
    username: string;
    score: number;
    rank: number | null;
}

function today(): string {
    // UTC-day key; the server daily instance rolls over in scenes' own timezone
    // anyway, this only has to agree with itself.
    return new Date().toISOString().slice(0, 10);
}

function yesterday(): string {
    return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

async function cacheGet(key: string): Promise<string | null> {
    if (!sdkReady()) return null;
    try {
        return await RundotGameAPI.deviceCache.getItem(key);
    } catch {
        return null;
    }
}

async function cacheSet(key: string, value: string): Promise<void> {
    if (!sdkReady()) return;
    try {
        await RundotGameAPI.deviceCache.setItem(key, value);
    } catch {
        /* storage full or unavailable — carry on */
    }
}

/**
 * Load the locally remembered best wave, today's best and the streak. Call
 * during boot (before the menu renders) and again whenever the menu opens.
 */
export async function loadDailyHunt(): Promise<void> {
    const [best, daily, streak] = await Promise.all([cacheGet(KEY_BEST), cacheGet(KEY_DAILY), cacheGet(KEY_STREAK)]);
    const day = today();
    const dailyBest = daily ? (JSON.parse(daily) as { date: string; wave: number }) : null;
    // A saved day that is already over shows as history, not as today's best.
    const mineToday = dailyBest && dailyBest.date === day ? dailyBest.wave : 0;
    const streakState = streak ? (JSON.parse(streak) as { date: string; count: number }) : null;
    const streakCount = streakState && (streakState.date === day || streakState.date === yesterday()) ? streakState.count : 0;
    const [shake, flash] = await Promise.all([cacheGet('ttt.shake'), cacheGet('ttt.flash')]);
    store.patch({
        bestWave: Math.max(0, Number(best) || 0),
        dailyBest: mineToday,
        streak: streakCount,
        shake: shake !== '0',
        flash: flash !== '0',
    });
}

/** Top daily scores + this player's rank, if the host answered. */
export async function fetchDailyBoard(): Promise<void> {
    if (!sdkReady()) return;
    try {
        const [page, mine] = await Promise.all([
            RundotGameAPI.leaderboard.getPagedScores({ mode: 'default', period: 'daily', limit: 3 }),
            RundotGameAPI.leaderboard.getMyRank({ mode: 'default', period: 'daily' }).catch(() => null),
        ]);
        const board: BoardEntry[] = page.entries.slice(0, 3).map((e) => ({ username: e.username, score: e.score, rank: e.rank }));
        store.patch({ board, dailyRank: mine?.rank ?? page.playerRank ?? null, dailyPlayers: page.totalEntries });
    } catch (err) {
        console.warn('[dailyHunt] board fetch failed', err);
    }
}

/**
 * A run ended: remember locally, keep the streak alive, and submit to the
 * RUN daily board when the wave beats what the player already scored there
 * (server keeps the best anyway; this trips the anti-cheat rate limit less).
 */
export async function submitRun(wave: number, durationSec: number, kills: number): Promise<void> {
    if (wave <= 0) return;
    const day = today();

    // Streak + daily best (local).
    const daily = await cacheGet(KEY_DAILY);
    const savedDaily = daily ? (JSON.parse(daily) as { date: string; wave: number }) : null;
    let streakCount = store.get().streak;
    let streakDate = day;
    if (savedDaily && savedDaily.date === day) {
        streakDate = savedDaily.date;
    } else {
        const wasYesterday = savedDaily && savedDaily.date === yesterday();
        streakCount = (store.get().streak > 0 && wasYesterday ? streakCount : 0) + 1;
        streakDate = day;
    }
    const localBest = Math.max(store.get().dailyBest, 0);
    const dailyWave = Math.max(wave, localBest);

    const best = await cacheGet(KEY_BEST);
    const allTime = Math.max(Math.max(0, Number(best) || 0), wave);

    store.patch({ bestWave: allTime, dailyBest: dailyWave, streak: streakCount });
    await Promise.all([
        cacheSet(KEY_BEST, String(allTime)),
        cacheSet(KEY_DAILY, JSON.stringify({ date: day, wave: dailyWave })),
        cacheSet(KEY_STREAK, JSON.stringify({ date: streakDate, count: streakCount })),
    ]);

    if (!sdkReady() || wave <= localBest) return;

    // Rate-limit guard: the server rejects submissions faster than 60 s apart.
    const lastSub = Number((await cacheGet(KEY_LAST_SUB)) || 0);
    const now = Date.now();
    if (now - lastSub < MIN_SUB_GAP * 1000) return;

    try {
        await RundotGameAPI.leaderboard.submitScore({ score: wave, duration: Math.max(MIN_SUB_GAP, Math.round(durationSec)), mode: 'default', period: 'daily', telemetry: { kills } });
        await cacheSet(KEY_LAST_SUB, String(now));
    } catch (err) {
        console.warn('[dailyHunt] submit failed', err);
    }
}

/** Cheap telemetry for tuning: where runs end and how often players restart. */
export function telemetry(name: string, data: Record<string, unknown>): void {
    if (!sdkReady()) return;
    try {
        RundotGameAPI.analytics.recordCustomEvent(name, data);
    } catch {
        /* fire-and-forget */
    }
}

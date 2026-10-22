/**
 * Player level and stat points, saved on this device (`ttt.xp`, `ttt.stats`).
 * XP lands in the store the moment it is earned (so a level-up shows mid-run)
 * and is saved shortly after, so quitting mid-run keeps it.
 * Rules (curve, stats, boosts) live in src/game/progression.ts.
 */
import { store } from '../state/store.ts';
import { telemetry } from './dailyHunt.ts';
import { cacheGet, cacheSet, parseJson } from './skinShop.ts';
import { REALMS } from '../game/realms.ts';
import { LEVEL, NO_STATS, levelFor, pointsEarned, pointsSpent, sanitizeStats, statDef, type StatId, type StatPoints } from '../game/progression.ts';

const KEY_XP = 'ttt.xp';
const KEY_STATS = 'ttt.stats';
const KEY_REALM = 'ttt.realm';

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveSoon(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        cacheSet(KEY_XP, String(store.get().xp));
    }, 1500);
}

/** Boot: total XP and spent points. */
export async function loadProgress(): Promise<void> {
    const [xpRaw, statsRaw, realmRaw] = await Promise.all([cacheGet(KEY_XP), cacheGet(KEY_STATS), cacheGet(KEY_REALM)]);
    const xp = Math.max(0, Math.floor(Number(xpRaw) || 0));
    const { level } = levelFor(xp);
    const realmsUnlocked = Math.max(0, Math.min(REALMS.length - 1, Math.floor(Number(realmRaw) || 0)));
    store.patch({ xp, level, stats: sanitizeStats(parseJson<unknown>(statsRaw, {}), level), realmsUnlocked, startRealm: 0 });
}

/** Points earned but not yet spent. */
export function freePoints(s = store.get()): number {
    return Math.max(0, pointsEarned(s.level) - pointsSpent(s.stats));
}

/** Add XP. Returns the levels gained (0 most of the time). */
export function addXp(n: number): number {
    if (n <= 0) return 0;
    const s = store.get();
    const before = s.level;
    const xp = s.xp + Math.round(n);
    const { level } = levelFor(xp);
    store.patch({ xp, level, xpEarned: s.xpEarned + Math.round(n) });
    saveSoon();
    if (level > before) {
        cacheSet(KEY_XP, String(xp));
        telemetry('level_up', { level });
    }
    return level - before;
}

export function spendPoint(id: StatId): boolean {
    const s = store.get();
    if (freePoints(s) <= 0 || s.stats[id] >= statDef(id).max) return false;
    const stats: StatPoints = { ...s.stats, [id]: s.stats[id] + 1 };
    store.patch({ stats });
    cacheSet(KEY_STATS, JSON.stringify(stats));
    return true;
}

/** Free respec: every point back. */
export function resetStats(): void {
    store.patch({ stats: { ...NO_STATS } });
    cacheSet(KEY_STATS, JSON.stringify(NO_STATS));
}

/** A realm was reached: it can be picked as a starting realm from now on. */
export function unlockRealm(index: number): void {
    const i = Math.max(0, Math.min(REALMS.length - 1, index));
    if (i <= store.get().realmsUnlocked) return;
    store.patch({ realmsUnlocked: i });
    cacheSet(KEY_REALM, String(i));
    telemetry('realm_unlock', { realm: i });
}

export const MAX_LEVEL = LEVEL.max;

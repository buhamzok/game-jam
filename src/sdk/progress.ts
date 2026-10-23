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
const KEY_TUTORIAL = 'ttt.tutorial';

let saveTimer: ReturnType<typeof setTimeout> | null = null;

let pendingXp = -1;
let pendingEarned = 0;

function saveSoon(): void {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const xpToSave = pendingXp >= 0 ? pendingXp : store.get().xp;
        cacheSet(KEY_XP, String(xpToSave));
    }, 1500);
}

/** Flush any deferred mid-run XP to the store (called on wave clear / game over / menu). */
export function flushXp(): void {
    if (pendingXp < 0 && pendingEarned === 0) return;
    const s = store.get();
    const xp = pendingXp >= 0 ? pendingXp : s.xp;
    const { level } = levelFor(xp);
    const xpEarned = s.xpEarned + pendingEarned;
    pendingXp = -1;
    pendingEarned = 0;
    store.patch({ xp, level, xpEarned });
}

/** Boot: total XP and spent points. */
export async function loadProgress(): Promise<void> {
    const [xpRaw, statsRaw, realmRaw, tutRaw] = await Promise.all([cacheGet(KEY_XP), cacheGet(KEY_STATS), cacheGet(KEY_REALM), cacheGet(KEY_TUTORIAL)]);
    const xp = Math.max(0, Math.floor(Number(xpRaw) || 0));
    const { level } = levelFor(xp);
    const realmsUnlocked = Math.max(0, Math.min(REALMS.length - 1, Math.floor(Number(realmRaw) || 0)));
    // a player with XP already knows the game: no tutorial for them
    store.patch({ xp, level, stats: sanitizeStats(parseJson<unknown>(statsRaw, {}), level), realmsUnlocked, startRealm: 0, tutorialDone: tutRaw === '1' || xp > 0 });
}

/** Points earned but not yet spent. */
export function freePoints(s = store.get()): number {
    return Math.max(0, pointsEarned(s.level) - pointsSpent(s.stats));
}

/** Add XP. Returns the levels gained (0 most of the time). */
export function addXp(n: number): number {
    if (n <= 0) return 0;
    const s = store.get();
    const baseXp = pendingXp >= 0 ? pendingXp : s.xp;
    const { level: before } = levelFor(baseXp);
    const delta = Math.round(n);
    const xp = baseXp + delta;
    const { level } = levelFor(xp);
    pendingXp = xp;
    pendingEarned += delta;
    saveSoon();
    if (level > before || s.phase !== 'playing' || s.gameOver) {
        flushXp();
        if (level > before) {
            cacheSet(KEY_XP, String(xp));
            telemetry('level_up', { level });
        }
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

export function markTutorialDone(): void {
    store.patch({ tutorialDone: true, tutorialRequested: false });
    cacheSet(KEY_TUTORIAL, '1');
    telemetry('tutorial_done', {});
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

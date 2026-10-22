/**
 * Daily quests and the daily chest: pure rules. Each day picks 3 quests from
 * the pool (the same 3 for everyone, seeded by the date), each on a different
 * event. Progress, claiming and saving live in src/sdk/quests.ts.
 */

export type QuestEvent = 'kill' | 'boss' | 'combo' | 'perfect' | 'counter' | 'wave' | 'transform' | 'boon' | 'pvpwin' | 'run';

export interface QuestDef {
    id: string;
    text: string;
    event: QuestEvent;
    /** count: progress adds up; max: progress is the best single value (combo length, wave reached). */
    mode: 'count' | 'max';
    target: number;
    souls: number;
    xp: number;
}

export const QUESTS: QuestDef[] = [
    { id: 'kill40', text: 'Defeat 40 hunters', event: 'kill', mode: 'count', target: 40, souls: 30, xp: 60 },
    { id: 'kill100', text: 'Defeat 100 hunters', event: 'kill', mode: 'count', target: 100, souls: 60, xp: 120 },
    { id: 'combo20', text: 'Land a 20-hit combo (A)', event: 'combo', mode: 'max', target: 20, souls: 40, xp: 80 },
    { id: 'combo35', text: 'Land a 35-hit combo (S)', event: 'combo', mode: 'max', target: 35, souls: 60, xp: 120 },
    { id: 'perfect5', text: 'Perfect-dodge 5 times', event: 'perfect', mode: 'count', target: 5, souls: 35, xp: 70 },
    { id: 'counter3', text: 'Counter 3 heavy attacks', event: 'counter', mode: 'count', target: 3, souls: 35, xp: 70 },
    { id: 'wave8', text: 'Reach wave 8 in a full run', event: 'wave', mode: 'max', target: 8, souls: 40, xp: 80 },
    { id: 'boss1', text: 'Defeat a boss', event: 'boss', mode: 'count', target: 1, souls: 45, xp: 90 },
    { id: 'trans4', text: 'Transform 4 times', event: 'transform', mode: 'count', target: 4, souls: 30, xp: 60 },
    { id: 'boon2', text: 'Pick 2 portal boons', event: 'boon', mode: 'count', target: 2, souls: 40, xp: 80 },
    { id: 'pvp1', text: 'Win a PVP match', event: 'pvpwin', mode: 'count', target: 1, souls: 50, xp: 100 },
    { id: 'runs3', text: 'Play 3 runs', event: 'run', mode: 'count', target: 3, souls: 25, xp: 50 },
];

export const QUESTS_PER_DAY = 3;

/** Daily chest: Souls and XP grow with the streak of days in a row it was opened, up to day 7. */
export function chestReward(streak: number): { souls: number; xp: number } {
    const d = Math.max(1, Math.min(7, streak));
    return { souls: 15 + 10 * (d - 1), xp: 20 * d };
}

/** The player's local calendar day, YYYY-MM-DD. */
export function today(now = new Date()): string {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${m}-${d}`;
}

/** The day before `day` (YYYY-MM-DD). */
export function dayBefore(day: string): string {
    const [y, m, d] = day.split('-').map(Number);
    return today(new Date(y, m - 1, d - 1));
}

/** Today's quests: a seeded shuffle of the pool, at most one quest per event. */
export function questsFor(day: string): QuestDef[] {
    let seed = 0;
    for (const c of day) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const pool = [...QUESTS];
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const out: QuestDef[] = [];
    for (const q of pool) {
        if (out.some((o) => o.event === q.event)) continue;
        out.push(q);
        if (out.length === QUESTS_PER_DAY) break;
    }
    return out;
}

export function questDef(id: string): QuestDef | undefined {
    return QUESTS.find((q) => q.id === id);
}

/**
 * Player level (1 to 30) and stat points. XP comes from KOs, cleared waves,
 * Gravelords, finished realms and PVP matches; every level gives stat points
 * that boost the whole tag team. Harder realms pay more XP and hit harder
 * (see T.realmTier), so the points matter more the further a run goes.
 *
 * Pure rules only: saving and the store live in src/sdk/progress.ts.
 */

export const LEVEL = {
    max: 30,
    pointsPerLevel: 2,
    /**
     * XP from level L to L+1 climbs faster the higher you go: base + scale * L^power,
     * rounded to 5. Level 2 takes 60, level 10 about 650, level 20 about 2,000,
     * level 30 about 3,700 (about 43,000 in all): early levels come in the first
     * runs, the last ones take real play.
     */
    base: 50,
    scale: 12,
    power: 1.7,
};

export const XP = {
    kill: 4,
    boss: 60,
    /** A cleared wave: wave + perWave * wave number. */
    wave: 10,
    perWave: 2,
    /** Stepping through a portal: realm * the realm number just finished. */
    realm: 50,
    pvpWin: 60,
    pvpLoss: 20,
    /** Each realm tier adds this share to kill and wave XP (realm 2 pays 1.25x, realm 3 1.5x...). */
    tierBonus: 0.25,
};

export type StatId = 'vitality' | 'strength' | 'agility' | 'fury' | 'focus';

export interface StatDef {
    id: StatId;
    name: string;
    /** What one point does, for the upgrade screen. */
    per: string;
    /** Bonus per point (a fraction: 0.04 = +4%). Focus cuts cooldowns, the rest add. */
    step: number;
    /** Most points this stat takes. */
    max: number;
    color: string;
    icon: string;
}

/** 5 stats x 12 points = 60, more than the 58 points a level-30 player has: max out four, not all five. */
export const STATS: StatDef[] = [
    { id: 'vitality', name: 'Vitality', per: '+4% max HP', step: 0.04, max: 12, color: '#22c55e', icon: '❤' },
    { id: 'strength', name: 'Strength', per: '+3% damage', step: 0.03, max: 12, color: '#f97316', icon: '\u{1F43E}' },
    { id: 'agility', name: 'Agility', per: '+1.5% move speed', step: 0.015, max: 12, color: '#38bdf8', icon: '\u{1F4A8}' },
    { id: 'fury', name: 'Fury', per: '+5% transform bar gain', step: 0.05, max: 12, color: '#f59e0b', icon: '\u{1F315}' },
    { id: 'focus', name: 'Focus', per: '-3% special cooldown', step: 0.03, max: 12, color: '#a78bfa', icon: '✨' },
];

export type StatPoints = Record<StatId, number>;

export const NO_STATS: StatPoints = { vitality: 0, strength: 0, agility: 0, fury: 0, focus: 0 };

/** Multipliers the simulation applies to the player's team. */
export interface Boosts {
    hp: number;
    dmg: number;
    speed: number;
    energy: number;
    cooldown: number;
}

export const NO_BOOSTS: Boosts = { hp: 1, dmg: 1, speed: 1, energy: 1, cooldown: 1 };

export function statDef(id: StatId): StatDef {
    return STATS.find((s) => s.id === id)!;
}

export function boostsFor(p: StatPoints): Boosts {
    const v = (id: StatId) => Math.max(0, Math.min(statDef(id).max, p[id] || 0)) * statDef(id).step;
    return { hp: 1 + v('vitality'), dmg: 1 + v('strength'), speed: 1 + v('agility'), energy: 1 + v('fury'), cooldown: 1 - v('focus') };
}

export function xpToNext(level: number): number {
    return Math.round((LEVEL.base + LEVEL.scale * level ** LEVEL.power) / 5) * 5;
}

/** Level and progress from total XP. At max level `need` is 0. */
export function levelFor(totalXp: number): { level: number; into: number; need: number } {
    let level = 1;
    let left = Math.max(0, Math.floor(totalXp));
    while (level < LEVEL.max && left >= xpToNext(level)) {
        left -= xpToNext(level);
        level++;
    }
    return level >= LEVEL.max ? { level: LEVEL.max, into: 0, need: 0 } : { level, into: left, need: xpToNext(level) };
}

export function pointsEarned(level: number): number {
    return (Math.min(LEVEL.max, level) - 1) * LEVEL.pointsPerLevel;
}

export function pointsSpent(p: StatPoints): number {
    return STATS.reduce((n, s) => n + (p[s.id] || 0), 0);
}

/** Clean a saved stat record: known stats only, whole numbers, within each max and the points earned. */
export function sanitizeStats(raw: unknown, level: number): StatPoints {
    const out: StatPoints = { ...NO_STATS };
    if (raw && typeof raw === 'object') {
        for (const s of STATS) {
            const n = Math.floor(Number((raw as Record<string, unknown>)[s.id]) || 0);
            out[s.id] = Math.max(0, Math.min(s.max, n));
        }
    }
    // more spent than earned (an edited save): start over
    return pointsSpent(out) > pointsEarned(level) ? { ...NO_STATS } : out;
}

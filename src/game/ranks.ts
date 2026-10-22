/**
 * PVP rank ladder: rank points (RP) from PVP matches place a player in a tier.
 * Pure rules; saving and the RUN board live in src/sdk/pvpRank.ts.
 */

export interface Tier {
    name: string;
    /** RP needed to reach it. */
    at: number;
    color: string;
    icon: string;
}

export const TIERS: Tier[] = [
    { name: 'Bronze', at: 0, color: '#d97706', icon: '\u{1F949}' },
    { name: 'Silver', at: 100, color: '#cbd5e1', icon: '\u{1F948}' },
    { name: 'Gold', at: 250, color: '#facc15', icon: '\u{1F947}' },
    { name: 'Platinum', at: 450, color: '#67e8f9', icon: '\u{1F48E}' },
    { name: 'Diamond', at: 700, color: '#a78bfa', icon: '\u{1F536}' },
    { name: 'Gravelord', at: 1000, color: '#f43f5e', icon: '\u{1F480}' },
];

export const RANK = {
    win: 25,
    /** Extra RP per win in a row (after the first), up to `streakMax`. */
    streakBonus: 5,
    streakMax: 4,
    loss: 15,
};

export function tierFor(rp: number): Tier {
    let t = TIERS[0];
    for (const x of TIERS) if (rp >= x.at) t = x;
    return t;
}

export function nextTier(rp: number): Tier | null {
    return TIERS.find((x) => x.at > rp) ?? null;
}

/** RP change for a result, given the current win streak (before this match). */
export function rpChange(win: boolean, streak: number): number {
    if (!win) return -RANK.loss;
    return RANK.win + RANK.streakBonus * Math.min(RANK.streakMax, Math.max(0, streak));
}

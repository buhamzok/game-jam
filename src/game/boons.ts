/**
 * Portal boons: when a realm's portal opens, the player picks 1 of 3 run-only
 * powers. They stack (up to `max`) and last until the run ends. Stat boons
 * multiply `world.boost` at once; the rest are read where they act
 * (`world.boon(id)` gives the stack count).
 */
import type { World } from './world.ts';

export type BoonId =
    | 'heavy'
    | 'fleet'
    | 'skin'
    | 'iron'
    | 'thirst'
    | 'bleed'
    | 'wind'
    | 'study'
    | 'moon'
    | 'tagheal'
    | 'echo'
    | 'harvest';

export interface BoonDef {
    id: BoonId;
    name: string;
    icon: string;
    /** One stack, in a few words. */
    desc: string;
    max: number;
    color: string;
}

export const BOONS: BoonDef[] = [
    { id: 'heavy', name: 'Heavy Hand', icon: '\u{1F4AA}', desc: '+15% damage', max: 3, color: '#f97316' },
    { id: 'fleet', name: 'Fleet Foot', icon: '\u{1F4A8}', desc: '+12% move speed', max: 2, color: '#38bdf8' },
    { id: 'skin', name: 'Thick Skin', icon: '\u{1F6E1}', desc: '+20% max HP for the team', max: 2, color: '#22c55e' },
    { id: 'iron', name: 'Iron Hide', icon: '\u{1FAA8}', desc: 'Take 15% less damage', max: 2, color: '#94a3b8' },
    { id: 'thirst', name: 'Bloodthirst', icon: '\u{1FA78}', desc: 'Each KO heals 4% HP', max: 3, color: '#dc2626' },
    { id: 'bleed', name: 'Serrated Claws', icon: '\u{1FA93}', desc: 'Hits make hunters bleed', max: 3, color: '#b91c1c' },
    { id: 'wind', name: 'Second Wind', icon: '\u{1F343}', desc: 'Dodge recharges 35% faster', max: 2, color: '#2dd4bf' },
    { id: 'study', name: 'Quick Study', icon: '✨', desc: 'Specials recharge 25% faster', max: 2, color: '#a78bfa' },
    { id: 'moon', name: 'Moonlit Fury', icon: '\u{1F315}', desc: 'Transform bar fills 30% faster', max: 2, color: '#f59e0b' },
    { id: 'tagheal', name: 'Tag Heal', icon: '\u{1F91D}', desc: 'Swapping in heals 8% HP', max: 2, color: '#4ade80' },
    { id: 'echo', name: 'Witching Echo', icon: '\u{1F570}', desc: 'Witching Hour lasts 1.5 s longer', max: 2, color: '#c084fc' },
    { id: 'harvest', name: 'Soul Harvest', icon: '\u{1F47B}', desc: '+50% Souls this run', max: 2, color: '#e9d5ff' },
];

export const BOON_TUNING = {
    choices: 3,
    heavy: 0.15,
    fleet: 0.12,
    skin: 0.2,
    iron: 0.15,
    thirst: 0.04,
    /** Bleed: damage per second per stack, for this long after the last hit. */
    bleedDps: 5,
    bleedTime: 3,
    wind: 0.35,
    study: 0.25,
    moon: 0.3,
    tagheal: 0.08,
    echo: 1.5,
    harvest: 0.5,
};

export function boonDef(id: BoonId): BoonDef {
    return BOONS.find((b) => b.id === id)!;
}

/** Three different boons the player can still take, at random. */
export function rollBoons(owned: Partial<Record<BoonId, number>>): BoonId[] {
    const open = BOONS.filter((b) => (owned[b.id] ?? 0) < b.max).map((b) => b.id);
    for (let i = open.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [open[i], open[j]] = [open[j], open[i]];
    }
    return open.slice(0, BOON_TUNING.choices);
}

/** Apply one stack's immediate effect (stat boons); the rest act through `world.boon(id)`. */
export function applyBoon(w: World, id: BoonId): void {
    const B = BOON_TUNING;
    const b = w.boost;
    if (id === 'heavy') b.dmg *= 1 + B.heavy;
    if (id === 'fleet') b.speed *= 1 + B.fleet;
    if (id === 'moon') b.energy *= 1 + B.moon;
    if (id === 'study') b.cooldown *= 1 - B.study;
    if (id === 'skin') {
        // more max HP, and the team gains that much at once
        const p = w.player;
        const before = p.team.map((m) => p.maxHp(m.kind));
        b.hp *= 1 + B.skin;
        p.team.forEach((m, i) => {
            if (m.alive) m.hp += p.maxHp(m.kind) - before[i];
        });
    }
}

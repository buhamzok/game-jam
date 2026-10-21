/**
 * PVP Arena (asynchronous, RUN's PVP system): after each run the player's
 * tag team (monsters, equipped skins, power from the best wave) is saved to
 * their own room on the RUN server. Entering the arena finds another
 * player's saved team; the game's AI plays it. With no match (a new game, no
 * host), a bot team stands in, and the screen says it is a bot.
 *
 * Server config: rundot/simulation/pvp-system.json (uploaded by `rundot deploy`).
 * Posture: every SDK call can reject; nothing here throws into the game.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { sdkReady } from './runSdk.ts';
import { store } from '../state/store.ts';
import { telemetry } from './dailyHunt.ts';
import { SKINS } from '../game/skins.ts';
import type { MonsterKind } from '../game/tuning.ts';

export interface RivalUnit {
    monster: MonsterKind;
    /** Equipped skin id, if any. */
    skin?: string;
}

export interface Rival {
    name: string;
    bot: boolean;
    power: number;
    units: RivalUnit[];
}

const MONSTERS: MonsterKind[] = ['werewolf', 'vampire', 'stitched'];
const BOT_NAMES = ['Moonfang', 'Count Grimsby', 'Old Bolt', 'Lady Nocturne', 'Graverattle', 'Hollow Jack', 'Mistress Mire', 'Baron Bones'];

/** Team power from the best wave and the player level: what matchmaking and the battle report compare. */
export function teamPower(bestWave: number, level = 1): number {
    return 100 + Math.max(0, bestWave) * 12 + Math.max(0, level - 1) * 10;
}

function myName(): string {
    if (!sdkReady()) return 'You';
    try {
        const p = RundotGameAPI.getProfile();
        return (p.username || p.name || 'Hunter').slice(0, 20);
    } catch {
        return 'Hunter';
    }
}

/** Save this player's team for others to fight. Called after every run (best effort). */
export async function snapshotTeam(): Promise<void> {
    if (!sdkReady()) return;
    const s = store.get();
    const power = teamPower(s.bestWave, s.level);
    const owner = myName();
    const units = MONSTERS.map((monster, position) => {
        const skin = s.equippedSkins[monster];
        return { unitId: monster, position, power: Math.round(power / 3), owner, skin: skin && s.ownedSkins.includes(skin) ? skin : '' };
    });
    try {
        const r = await RundotGameAPI.simulation.executeRecipeAsync('pvp_snapshot_board', { units, totalPower: power });
        if (!r.success) console.warn('[pvp] snapshot refused', r.message);
    } catch (err) {
        console.warn('[pvp] snapshot failed', err);
    }
}

function botRival(power: number): Rival {
    const rand = Math.random;
    const name = BOT_NAMES[Math.floor(rand() * BOT_NAMES.length)];
    // a shuffled team, each wearing a random look
    const order = [...MONSTERS].sort(() => rand() - 0.5);
    const units = order.map((monster) => {
        const looks = SKINS.filter((k) => k.monster === monster);
        const pick = rand() < 0.65 ? looks[Math.floor(rand() * looks.length)]?.id : undefined;
        return { monster, skin: pick };
    });
    // within 15% of the player's own power
    return { name, bot: true, power: Math.round(power * (0.85 + rand() * 0.3)), units };
}

function parseUnits(raw: unknown): { units: RivalUnit[]; name: string; power: number } | null {
    if (!Array.isArray(raw)) return null;
    const units: RivalUnit[] = [];
    let name = '';
    let power = 0;
    for (const actor of raw) {
        const d = (actor && typeof actor === 'object' && 'data' in actor ? (actor as { data: unknown }).data : actor) as Record<string, unknown> | null;
        if (!d) continue;
        const monster = String(d.unitId ?? '') as MonsterKind;
        if (!MONSTERS.includes(monster)) continue;
        const skin = typeof d.skin === 'string' && SKINS.some((k) => k.id === d.skin && k.monster === monster) ? d.skin : undefined;
        units.push({ monster, skin });
        if (typeof d.owner === 'string' && d.owner) name = d.owner.replace(/\s+/g, ' ').trim().slice(0, 20);
        power += Number(d.power) || 0;
    }
    units.sort((a, b) => MONSTERS.indexOf(a.monster) - MONSTERS.indexOf(b.monster));
    return units.length ? { units, name: name || 'A hunter', power } : null;
}

/** Find a human rival's saved team, or fall back to a bot. Never rejects. */
export async function findRival(): Promise<Rival> {
    const mine = teamPower(store.get().bestWave, store.get().level);
    if (sdkReady()) {
        try {
            const found = await RundotGameAPI.simulation.executeRecipeAsync('pvp_find_opponent');
            const rooms = (found.success ? ((found.data?.state as Record<string, unknown> | undefined)?.opponent_rooms ?? []) : []) as { id: string }[];
            // try a few of the matches in random order until one has a team
            for (const room of [...rooms].sort(() => Math.random() - 0.5).slice(0, 3)) {
                const board = await RundotGameAPI.simulation.executeRecipeAsync('pvp_get_opponent_board', { roomId: room.id });
                const parsed = board.success ? parseUnits((board.data?.state as Record<string, unknown> | undefined)?.opponent_units) : null;
                if (parsed && parsed.units.length === 3) {
                    telemetry('pvp_match', { source: 'human' });
                    return { name: parsed.name, bot: false, power: parsed.power || mine, units: parsed.units };
                }
            }
        } catch (err) {
            console.warn('[pvp] matchmaking failed, using a bot', err);
        }
    }
    telemetry('pvp_match', { source: 'bot' });
    return botRival(mine);
}

/** Report the result for the server's plausibility check (best effort). Returns whether it was accepted. */
export async function reportBattle(win: boolean, rival: Rival): Promise<boolean> {
    telemetry('pvp_result', { win: win ? 1 : 0, bot: rival.bot ? 1 : 0 });
    if (!sdkReady()) return true;
    try {
        const r = await RundotGameAPI.simulation.executeRecipeAsync('pvp_report_battle', {
            result: win ? 1 : 0,
            myPower: teamPower(store.get().bestWave, store.get().level),
            opponentPower: rival.power,
        });
        return r.success;
    } catch (err) {
        console.warn('[pvp] report failed', err);
        return false;
    }
}

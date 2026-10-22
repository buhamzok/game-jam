/**
 * Tiny external store bridging game code (Pixi ticker, SDK callbacks, plain
 * modules) and React — no state-library dependency. Game code calls
 * store.patch(); React components subscribe with useStore(selector).
 *
 * Keep this store for UI-FACING state only (phase, HUD numbers, popups).
 * Per-frame simulation state stays inside the Pixi scene — patching the
 * store every frame re-renders React every frame.
 */
import { useSyncExternalStore } from 'react';
import type { MonsterKind } from '../game/tuning.ts';

/** One team member shown in the HUD (magic arc points would come later). */
export interface TeamMember {
    kind: MonsterKind;
    hp: number;
    hpMax: number;
    alive: boolean;
}

/** The UI-facing app state. */
export interface AppState {
    /** 'loading' → 'menu' → 'playing' (or 'skins', the shop, 'pvp', the arena lobby, and 'upgrades', stat points, from the menu) */
    phase: 'loading' | 'menu' | 'playing' | 'skins' | 'pvp' | 'upgrades';
    /** 0..1 progress of the critical-asset warm during 'loading' */
    loadProgress: number;
    /** Set by the host's onPause/onResume lifecycle hooks */
    paused: boolean;
    /** Bumped to restart a run; the game canvas remounts on change. */
    runId: number;

    hp: number;
    hpMax: number;
    energy: number;
    energyMax: number;
    /** Energy bar is full: Q transforms (nothing else spends the bar). */
    transReady: boolean;
    /** Seconds until the active monster's special is ready (0 = ready), and its full cooldown. */
    specialCd: number;
    specialCdMax: number;
    /** Perfect dodge (Witching Hour) is off cooldown. */
    perfectReady: boolean;
    witching: boolean;
    /** Swap is off cooldown. */
    swapReady: boolean;
    /** Crimson Rain window is open (press the benched monster's key). */
    rainReady: boolean;
    /** Hits absorbed by the active hold-block so far (0..maxHits). */
    guardHits: number;
    /** Seconds until a broken guard can be raised again (0 when ready). */
    guardCd: number;
    /** A transformation is active on the current monster. */
    trans: boolean;
    /** Transformation name for the HUD badge (empty when none). */
    transLabel: string;
    /** Whole seconds of transformation left (0 when none). */
    transLeft: number;
    /** Cut-in card during a transformation (1 s flash). */
    cutIn: { kind: MonsterKind; title: string } | null;
    /** Which team member drives the body right now. */
    activeMonster: number;
    /** HP of every team member for the portrait bars. */
    team: TeamMember[];
    /** Boss health bar (null when no boss is on the field). */
    /** `mark`: hp fraction where phase 2 starts (a notch on the bar). */
    bossHp: { frac: number; name: string; mark?: number } | null;
    wave: number;
    kills: number;
    /** Big centered text such as "WAVE 2"; empty when hidden. */
    banner: string;
    /** Smaller line under the banner (what is new this wave). */
    bannerSub: string;
    gameOver: boolean;
    finalWave: number;
    finalKills: number;
    /** Sound is off (the HUD speaker button or M; remembered on this device). */
    muted: boolean;
    /** All-time best wave (device cache + submitted to RUN, all-time board). */
    bestWave: number;
    /** Best wave reached today (Daily Hunt local best). */
    dailyBest: number;
    /** Consecutive days with a Daily Hunt run. */
    streak: number;
    /** Top three daily scores from the RUN board (empty until fetched). */
    board: { username: string; score: number; rank: number | null }[];
    /** This player's rank on today's board (null when unknown). */
    dailyRank: number | null;
    /** Number of players scored today. */
    dailyPlayers: number;
    /** Camera shake on (HUD toggle; remembered on this device). */
    shake: boolean;
    /** Damage/hit flashes on (HUD toggle; remembered on this device). */
    flash: boolean;
    /** Which controls to show: touch buttons, or keyboard hints (switches on last input used). */
    inputMode: 'touch' | 'keyboard';
    /** Opened from a friend's challenge link: the wave to beat (see sdk/challenge.ts). */
    challenge: { wave: number; kills: number; from: string } | null;
    /** This run got past the challenge wave. */
    challengeBeaten: boolean;
    /** Souls banked on this device (skin currency earned in runs). */
    souls: number;
    /** Souls the last run earned (end screen). */
    soulsEarned: number;
    /** Skin ids this player owns (Souls unlocks + RUN shop purchases). */
    ownedSkins: string[];
    /** Equipped skin id per monster (missing = classic look). */
    equippedSkins: Partial<Record<MonsterKind, string>>;
    /** RUN shop prices by item id ("50 Bits", "$0.99"); empty until the catalog loads. */
    shopPrices: Record<string, string>;
    /** What the next run is: the wave hunt, or a PVP match against `rival`. */
    mode: 'hunt' | 'pvp';
    rival: import('../sdk/pvp.ts').Rival | null;
    /** PVP outcome once the match ends (null while fighting or in the hunt). */
    pvpResult: 'win' | 'loss' | null;
    /** Total XP, the level it gives (1..30) and the stat points spent (see game/progression.ts). */
    xp: number;
    level: number;
    stats: import('../game/progression.ts').StatPoints;
    /** XP and levels gained this run (end screen); reset when a run starts. */
    xpEarned: number;
    levelsGained: number;
    /** Furthest realm index reached on this device (0..9); realms up to it can be picked on the menu. */
    realmsUnlocked: number;
    /** Realm the next hunt starts in (0 = the Graveyard). Runs started past it are practice for boards and challenges. */
    startRealm: number;
    /** Today's quests and the daily chest (see sdk/quests.ts); null until loaded. */
    quests: {
        day: string;
        list: { id: string; text: string; progress: number; target: number; souls: number; xp: number; claimed: boolean }[];
        chestReady: boolean;
        chestStreak: number;
    } | null;
    /** A quest just completed (in-game toast). */
    questToast: { text: string; at: number } | null;
    /** PVP rank points and record (sdk/pvpRank.ts), the last match's change, and this week's top 5. */
    pvpRank: { rp: number; wins: number; losses: number; streak: number };
    pvpRankDelta: { delta: number; tierUp: string } | null;
    pvpBoard: { username: string; score: number; rank: number | null }[];
    /** Combo meter: hits in a row right now (0 = none) and its grade. */
    combo: number;
    comboGrade: string;
    /** End-of-run summary (null while playing). */
    runStats: { maxCombo: number; grade: string; hits: number; perfects: number; counters: number; bosses: number; damageTaken: number; seconds: number; boons: number } | null;
    /** Portal boons: the 3 on offer (null when no choice is open), the pick from the UI, and this run's stacks. */
    boonChoice: import('../game/boons.ts').BoonId[] | null;
    boonPick: import('../game/boons.ts').BoonId | null;
    boons: Partial<Record<import('../game/boons.ts').BoonId, number>>;
    /** First-run tutorial prompt (null when not running). */
    tutorial: { step: number; total: number; text: string; note: string } | null;
    /** The tutorial was finished or skipped on this device. */
    tutorialDone: boolean;
    /** Replay the tutorial on the next hunt (How to Play). */
    tutorialRequested: boolean;
    /** SKIP pressed: the world ends the tutorial on its next frame. */
    tutorialSkip: boolean;
    /** Current realm danger tier (0 for the first realm). */
    realmTier: number;
    /** Current realm (map) name, and whether its exit portal is open. */
    realmName: string;
    portalOpen: boolean;
}

function startingInputMode(): 'touch' | 'keyboard' {
    try {
        return window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
    } catch {
        return 'touch';
    }
}

const listeners = new Set<() => void>();

let state: AppState = {
    phase: 'loading',
    loadProgress: 0,
    paused: false,
    runId: 0,
    hp: 100,
    hpMax: 100,
    energy: 0,
    energyMax: 100,
    transReady: false,
    specialCd: 0,
    specialCdMax: 10,
    perfectReady: true,
    witching: false,
    swapReady: true,
    rainReady: false,
    guardHits: 0,
    guardCd: 0,
    trans: false,
    transLabel: '',
    transLeft: 0,
    cutIn: null,
    activeMonster: 0,
    team: [],
    bossHp: null,
    wave: 0,
    kills: 0,
    banner: '',
    bannerSub: '',
    gameOver: false,
    finalWave: 0,
    finalKills: 0,
    muted: false,
    bestWave: 0,
    dailyBest: 0,
    streak: 0,
    board: [],
    dailyRank: null,
    dailyPlayers: 0,
    shake: true,
    flash: true,
    inputMode: startingInputMode(),
    challenge: null,
    challengeBeaten: false,
    souls: 0,
    soulsEarned: 0,
    ownedSkins: [],
    equippedSkins: {},
    shopPrices: {},
    realmName: '',
    portalOpen: false,
    xp: 0,
    level: 1,
    stats: { vitality: 0, strength: 0, agility: 0, fury: 0, focus: 0 },
    xpEarned: 0,
    levelsGained: 0,
    realmTier: 0,
    realmsUnlocked: 0,
    tutorial: null,
    quests: null,
    pvpRank: { rp: 0, wins: 0, losses: 0, streak: 0 },
    pvpRankDelta: null,
    pvpBoard: [],
    questToast: null,
    combo: 0,
    comboGrade: '',
    runStats: null,
    boonChoice: null,
    boonPick: null,
    boons: {},
    tutorialDone: false,
    tutorialRequested: false,
    tutorialSkip: false,
    startRealm: 0,
    mode: 'hunt',
    rival: null,
    pvpResult: null,
};

export const store = {
    /** Read the current state (from game code; in React use useStore). */
    get: (): AppState => state,
    /** Shallow-merge a partial update and notify React subscribers. */
    patch(partial: Partial<AppState>): void {
        state = { ...state, ...partial };
        for (const l of listeners) l();
    },
    subscribe(l: () => void): () => void {
        listeners.add(l);
        return () => listeners.delete(l);
    },
};

/**
 * React hook. IMPORTANT: the selector must return a primitive or a stable
 * reference (e.g. s => s.phase). Returning a fresh object/array each call
 * makes React re-render forever.
 */
export function useStore<T = AppState>(
    selector: (s: AppState) => T = (s) => s as unknown as T
): T {
    return useSyncExternalStore(store.subscribe, () => selector(state));
}

// Dev-only handle for tests and the console (e.g. granting Souls).
if (import.meta.env.DEV) (window as unknown as { __store?: typeof store }).__store = store;

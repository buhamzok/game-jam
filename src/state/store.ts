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
    /** 'loading' → 'menu' → 'playing' (or 'skins', the shop, from the menu) */
    phase: 'loading' | 'menu' | 'playing' | 'skins';
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

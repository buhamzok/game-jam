/**
 * Daily quests and the daily chest, saved on this device (`ttt.quests`).
 * The game reports events with questEvent(); progress shows on the menu card
 * and a toast fires in-game when a quest completes. Rewards (Souls and XP)
 * are claimed from the menu. Rules and the pool live in src/game/quests.ts.
 */
import { store } from '../state/store.ts';
import { telemetry } from './dailyHunt.ts';
import { cacheGet, cacheSet, parseJson, addSouls } from './skinShop.ts';
import { addXp } from './progress.ts';
import { chestReward, dayBefore, questDef, questsFor, today, type QuestEvent } from '../game/quests.ts';

const KEY = 'ttt.quests';

interface Saved {
    day: string;
    progress: Record<string, number>;
    claimed: string[];
    chestDay: string | null;
    chestStreak: number;
}

let state: Saved = { day: today(), progress: {}, claimed: [], chestDay: null, chestStreak: 0 };
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save(now = false): void {
    if (now) {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        cacheSet(KEY, JSON.stringify(state));
        return;
    }
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        cacheSet(KEY, JSON.stringify(state));
    }, 2000);
}

/** A new day: fresh quests (the chest streak carries over). */
function rollDay(): void {
    const d = today();
    if (state.day === d) return;
    state = { ...state, day: d, progress: {}, claimed: [] };
    save(true);
}

export function publish(): void {
    const d = today();
    const list = questsFor(d).map((q) => ({
        id: q.id,
        text: q.text,
        progress: Math.min(q.target, state.progress[q.id] ?? 0),
        target: q.target,
        souls: q.souls,
        xp: q.xp,
        claimed: state.claimed.includes(q.id),
    }));
    const chestReady = state.chestDay !== d;
    const nextStreak = state.chestDay === dayBefore(d) ? state.chestStreak + 1 : chestReady ? 1 : state.chestStreak;
    store.patch({ quests: { day: d, list, chestReady, chestStreak: nextStreak } });
}

export async function loadQuests(): Promise<void> {
    const raw = parseJson<Partial<Saved>>(await cacheGet(KEY), {});
    state = {
        day: typeof raw.day === 'string' ? raw.day : today(),
        progress: raw.progress && typeof raw.progress === 'object' ? raw.progress : {},
        claimed: Array.isArray(raw.claimed) ? raw.claimed.filter((x) => typeof x === 'string') : [],
        chestDay: typeof raw.chestDay === 'string' ? raw.chestDay : null,
        chestStreak: Math.max(0, Math.floor(Number(raw.chestStreak) || 0)),
    };
    rollDay();
    publish();
}

/** Game events: counts add up; `max` quests keep the best value. A quest that completes fires a toast. */
export function questEvent(event: QuestEvent, value = 1): void {
    rollDay();
    let changed = false;
    let completed = false;
    for (const q of questsFor(state.day)) {
        if (q.event !== event || state.claimed.includes(q.id)) continue;
        const before = state.progress[q.id] ?? 0;
        if (before >= q.target) continue;
        const next = q.mode === 'max' ? Math.max(before, value) : before + value;
        if (next === before) continue;
        state.progress[q.id] = next;
        changed = true;
        if (next >= q.target) {
            completed = true;
            store.patch({ questToast: { text: q.text, at: Date.now() } });
            telemetry('quest_done', { quest: q.id });
        }
    }
    if (changed) {
        save();
        // Avoid patching the React store on every kill/dodge mid-fight unless a quest completed or the run ended
        const s = store.get();
        if (completed || s.phase !== 'playing' || s.gameOver || event === 'run') {
            publish();
        }
    }
}

export function claimQuest(id: string): boolean {
    const q = questDef(id);
    if (!q || state.claimed.includes(id) || (state.progress[id] ?? 0) < q.target) return false;
    state.claimed.push(id);
    addSouls(q.souls);
    addXp(q.xp);
    save(true);
    publish();
    telemetry('quest_claim', { quest: id });
    return true;
}

/** Open the daily chest: once a day; the streak grows on consecutive days. Returns the reward, or null. */
export function claimChest(): { souls: number; xp: number } | null {
    const d = today();
    if (state.chestDay === d) return null;
    state.chestStreak = state.chestDay === dayBefore(d) ? state.chestStreak + 1 : 1;
    state.chestDay = d;
    const r = chestReward(state.chestStreak);
    addSouls(r.souls);
    addXp(r.xp);
    save(true);
    publish();
    telemetry('chest_open', { streak: state.chestStreak });
    return r;
}

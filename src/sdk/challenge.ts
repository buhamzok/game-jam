/**
 * Challenge a friend: the end screen shares a RUN link carrying the wave the
 * player reached. When a friend opens it, the game reads it back at boot
 * (`app.resolveLaunchIntent()`), shows "<name> challenges you: beat wave N"
 * on the menu and a target in the HUD, and calls it when they pass it.
 *
 * Posture: every SDK call can reject; nothing here throws into the game.
 * Outside the RUN host, `?beat=7&from=Jo` in the page URL fakes a challenge
 * (local testing), and sharing falls back to copying a text + link.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { sdkReady } from './runSdk.ts';
import { store } from '../state/store.ts';
import { telemetry } from './dailyHunt.ts';

export interface Challenge {
    /** The wave to beat (reach wave + 1). */
    wave: number;
    kills: number;
    /** Who sent it (their RUN username). */
    from: string;
}

/** Public game page, for the copy fallback outside the host. */
const GAME_URL = 'https://w.run/cobaltphoenix373/tag-team-terror';

function parse(params: Record<string, string> | URLSearchParams): Challenge | null {
    const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? '';
    const wave = Math.floor(Number(get('beat') || get('wave')));
    if (!Number.isFinite(wave) || wave < 1 || wave > 999) return null;
    const kills = Math.max(0, Math.floor(Number(get('kills')) || 0));
    // shown as React text (escaped); keep it short
    const from = get('from').replace(/\s+/g, ' ').trim().slice(0, 20) || 'A friend';
    return { wave, kills, from };
}

/** Boot: was the game opened from a challenge link? Patches `store.challenge` when it was. */
export async function resolveChallenge(): Promise<void> {
    let found: Challenge | null = null;
    if (sdkReady()) {
        try {
            const intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 1500 });
            if ((intent.kind === 'share' || intent.kind === 'deeplink') && intent.params?.c === '1') found = parse(intent.params);
        } catch (err) {
            console.warn('[challenge] launch intent failed', err);
        }
    }
    if (!found) {
        try {
            found = parse(new URLSearchParams(location.search));
        } catch {
            /* no URL params */
        }
    }
    if (!found) return;
    store.patch({ challenge: found, challengeBeaten: false });
    telemetry('challenge_opened', { wave: found.wave });
}

function myName(): string {
    if (!sdkReady()) return 'A friend';
    try {
        const p = RundotGameAPI.getProfile();
        return (p.username || p.name || 'A friend').slice(0, 20);
    } catch {
        return 'A friend';
    }
}

function shareParams(wave: number, kills: number): Record<string, string> {
    return { c: '1', beat: String(wave), kills: String(kills), from: myName() };
}

function metadata(wave: number) {
    return {
        title: `Can you beat wave ${wave} in Tag Team Terror?`,
        description: 'A monster tag-team brawler in the RUN October Jam. Beat my wave, then press Vote on the jam page.',
    };
}

/**
 * Keep the RUN app's own Share button in sync with the last run, so sharing
 * from the host toolbar sends the same challenge.
 */
export function setChallengeIntent(wave: number, kills: number): void {
    if (!sdkReady() || wave <= 0) return;
    RundotGameAPI.social
        .setShareIntentAsync({ shareParams: shareParams(wave, kills), metadata: metadata(wave), slug: `beat-wave-${wave}` })
        .catch(() => undefined);
}

/** End screen button: share a challenge link for the wave just reached. */
export async function sendChallenge(wave: number, kills: number): Promise<'shared' | 'copied' | 'failed'> {
    telemetry('challenge_sent', { wave, kills });
    if (sdkReady()) {
        try {
            const share = RundotGameAPI.social.shareLinkAsync({ shareParams: shareParams(wave, kills), metadata: metadata(wave), slug: `beat-wave-${wave}` });
            const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('share timed out')), 10000));
            await Promise.race([share, timeout]);
            return 'shared';
        } catch (err) {
            console.warn('[challenge] host share failed, copying the link instead', err);
        }
    }
    try {
        await navigator.clipboard.writeText(`I reached wave ${wave} in Tag Team Terror. Can you beat it? ${GAME_URL}`);
        return 'copied';
    } catch {
        return 'failed';
    }
}

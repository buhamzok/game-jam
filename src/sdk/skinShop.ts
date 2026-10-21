/**
 * Skin ownership, Souls and purchases.
 *
 * - Souls: earned per run, kept in the device cache (`ttt.souls`).
 * - Owned skins: unlocked with Souls (device cache `ttt.skins`) or bought in
 *   the RUN shop (server entitlements `skin_<id>`, or the bundle).
 * - Equipped skin per monster: device cache `ttt.equip`.
 *
 * Posture: every SDK call can reject; nothing here throws into the game.
 * Outside the RUN host everything lives in memory for the session.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { sdkReady } from './runSdk.ts';
import { store } from '../state/store.ts';
import { telemetry } from './dailyHunt.ts';
import { SKINS, skinById, shopItemFor, entitlementFor, BUNDLE_ITEM } from '../game/skins.ts';
import type { MonsterKind } from '../game/tuning.ts';

const KEY_SOULS = 'ttt.souls';
const KEY_SKINS = 'ttt.skins';
const KEY_EQUIP = 'ttt.equip';

export async function cacheGet(key: string): Promise<string | null> {
    if (!sdkReady()) return null;
    try {
        return await RundotGameAPI.deviceCache.getItem(key);
    } catch {
        return null;
    }
}

export function cacheSet(key: string, value: string): void {
    if (!sdkReady()) return;
    RundotGameAPI.deviceCache.setItem(key, value).catch(() => undefined);
}

export function parseJson<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

/** Skins unlocked with Souls on this device (server-bought ones come from entitlements). */
let soulUnlocked = new Set<string>();
/** Skins the RUN shop says this player owns. */
let bought = new Set<string>();

function publishOwned(): void {
    store.patch({ ownedSkins: SKINS.filter((s) => soulUnlocked.has(s.id) || bought.has(s.id)).map((s) => s.id) });
}

/** Boot: Souls, equipped skins and owned skins. Then the shop catalog and server ownership in the background. */
export async function loadSkins(): Promise<void> {
    const [souls, skins, equip] = await Promise.all([cacheGet(KEY_SOULS), cacheGet(KEY_SKINS), cacheGet(KEY_EQUIP)]);
    soulUnlocked = new Set(parseJson<string[]>(skins, []).filter((id) => skinById(id)));
    const equipped = parseJson<Partial<Record<MonsterKind, string>>>(equip, {});
    store.patch({ souls: Math.max(0, Math.floor(Number(souls) || 0)), equippedSkins: equipped });
    publishOwned();
    void refreshShop();
}

/** Server ownership and Bits prices. */
export async function refreshShop(): Promise<void> {
    if (!sdkReady()) return;
    try {
        const ents = await RundotGameAPI.entitlements.listEntitlements();
        const ids = new Set(ents.filter((e) => e.status === 'active' && e.quantity > 0).map((e) => e.entitlementId));
        bought = new Set(SKINS.filter((s) => ids.has(entitlementFor(s.id)) || ids.has(BUNDLE_ITEM)).map((s) => s.id));
        publishOwned();
    } catch (err) {
        console.warn('[skins] entitlements failed', err);
    }
    try {
        const catalog = await RundotGameAPI.shop.getCatalog();
        const prices: Record<string, string> = {};
        for (const item of catalog.items) {
            const final = item.resolvedPrice.finalPrice;
            // real-money items carry a localized price when the store has one
            const direct = (item as unknown as { directPurchase?: { displayPrice?: string; nominalUsd?: number | null } }).directPurchase;
            if (final.type === 'bucks') prices[item.itemId] = `${final.value} Bits`;
            else if (direct) prices[item.itemId] = direct.displayPrice ?? (direct.nominalUsd != null ? `$${direct.nominalUsd.toFixed(2)}` : 'Buy');
        }
        store.patch({ shopPrices: prices });
    } catch (err) {
        console.warn('[skins] catalog failed', err);
    }
}

/** A run ended: bank the Souls it earned. */
export function addSouls(n: number): void {
    if (n <= 0) return;
    const total = store.get().souls + n;
    store.patch({ souls: total });
    cacheSet(KEY_SOULS, String(total));
}

export function equip(monster: MonsterKind, skinId: string | null): void {
    const next = { ...store.get().equippedSkins };
    if (skinId) next[monster] = skinId;
    else delete next[monster];
    store.patch({ equippedSkins: next });
    cacheSet(KEY_EQUIP, JSON.stringify(next));
}

/** Unlock with Souls. Returns false when the player cannot afford it. */
export function unlockWithSouls(skinId: string): boolean {
    const skin = skinById(skinId);
    const s = store.get();
    if (!skin || s.ownedSkins.includes(skinId) || s.souls < skin.souls) return false;
    soulUnlocked.add(skinId);
    const souls = s.souls - skin.souls;
    store.patch({ souls });
    cacheSet(KEY_SOULS, String(souls));
    cacheSet(KEY_SKINS, JSON.stringify([...soulUnlocked]));
    publishOwned();
    equip(skin.monster, skinId);
    telemetry('skin_unlock_souls', { skin: skinId });
    return true;
}

/** One idempotency key per intended purchase, reused on retry (see the shop docs). */
const pendingKeys = new Map<string, string>();

/**
 * Buy a skin (or the bundle) in the RUN shop. Resolves to what happened;
 * the host handles the Bits top-up or the store checkout itself.
 */
export async function buyInShop(itemId: string): Promise<'bought' | 'cancelled' | 'pending' | 'failed'> {
    if (!sdkReady()) return 'failed';
    let key = pendingKeys.get(itemId);
    if (!key) {
        key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${itemId}-${Date.now()}-${Math.random()}`;
        pendingKeys.set(itemId, key);
    }
    telemetry('shop_item_click_purchase', { item_id: itemId });
    try {
        const result = await RundotGameAPI.shop.purchase(itemId, key);
        if (!result.success) {
            pendingKeys.delete(itemId);
            return 'cancelled';
        }
        pendingKeys.delete(itemId);
        await refreshShop();
        const skin = SKINS.find((s) => shopItemFor(s.id) === itemId);
        if (skin) equip(skin.monster, skin.id);
        return 'bought';
    } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (code === 'USER_CANCELLED') {
            pendingKeys.delete(itemId);
            return 'cancelled';
        }
        // keep the key: a retry must reuse it so a landed charge is not repeated
        if (code === 'direct-purchase-pending') return 'pending';
        console.warn('[skins] purchase failed', err);
        if (/stale/i.test(String((err as Error)?.message ?? ''))) void refreshShop();
        return 'failed';
    }
}

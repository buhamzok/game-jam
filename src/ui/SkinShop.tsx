/**
 * Skin shop (from the menu). One row per monster: the classic look plus two
 * skins. A skin unlocks with Souls (earned in runs) or with RUN Bits; the
 * "All skins" bundle sells for real money through the RUN shop. Prices from
 * the RUN catalog appear once it loads; without the host only Souls work.
 */
import { useEffect, useState } from 'react';
import { store, useStore } from '../state/store.ts';
import { audio } from '../game/audio.ts';
import { T, type MonsterKind } from '../game/tuning.ts';
import { SKINS, BUNDLE_ITEM, shopItemFor, type SkinDef } from '../game/skins.ts';
import { buyInShop, equip, refreshShop, unlockWithSouls } from '../sdk/skinShop.ts';
import { telemetry } from '../sdk/dailyHunt.ts';
import portraitWerewolf from '../assets/portrait-werewolf.png';
import portraitVampire from '../assets/portrait-vampire.png';
import portraitStitched from '../assets/portrait-stitched.png';

const PORTRAITS: Record<MonsterKind, string> = { werewolf: portraitWerewolf, vampire: portraitVampire, stitched: portraitStitched };
const MONSTERS: MonsterKind[] = ['werewolf', 'vampire', 'stitched'];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

type Status = { id: string; text: string } | null;

function back() {
    audio.play('click');
    store.patch({ phase: 'menu' });
}

/** The monster's portrait with the skin color laid over it. */
function Swatch({ kind, skin, selected }: { kind: MonsterKind; skin?: SkinDef; selected: boolean }) {
    return (
        <div className={`relative h-14 w-14 overflow-hidden rounded-xl ${selected ? 'ring-2 ring-amber-400' : 'ring-1 ring-white/20'}`}>
            <img src={PORTRAITS[kind]} alt="" className="h-full w-full object-cover" draggable={false} />
            {skin && (
                <>
                    <div className="absolute inset-0 mix-blend-color" style={{ background: hex(skin.tint), opacity: Math.min(1, skin.amount + 0.25) }} />
                    <div className="absolute inset-0" style={{ boxShadow: `inset 0 0 14px ${hex(skin.glow)}` }} />
                </>
            )}
        </div>
    );
}

export default function SkinShop() {
    const souls = useStore((s) => s.souls);
    const owned = useStore((s) => s.ownedSkins);
    const equipped = useStore((s) => s.equippedSkins);
    const prices = useStore((s) => s.shopPrices);
    const [status, setStatus] = useState<Status>(null);
    const [busy, setBusy] = useState('');

    useEffect(() => {
        void refreshShop();
        telemetry('shop_opened', {});
        const onKey = (e: KeyboardEvent) => {
            if (e.code === 'Escape') back();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const buy = async (itemId: string, statusId: string) => {
        audio.play('click');
        setBusy(itemId);
        const r = await buyInShop(itemId);
        setBusy('');
        setStatus({
            id: statusId,
            text: r === 'bought' ? 'Unlocked!' : r === 'cancelled' ? 'Cancelled' : r === 'pending' ? 'Still confirming, try again soon' : 'Shop unavailable right now',
        });
    };

    const bundlePrice = prices[BUNDLE_ITEM];
    const allOwned = SKINS.every((s) => owned.includes(s.id));

    return (
        <div className="flex h-full flex-col gap-3 overflow-y-auto px-5 py-5">
            <div className="flex items-center justify-between">
                <button type="button" className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-black text-white active:scale-95" onClick={back}>
                    {'←'} Back
                </button>
                <p className="text-xl font-black tracking-widest text-primary">SKINS</p>
                <p className="rounded-xl bg-black/50 px-3 py-1.5 text-sm font-black text-violet-200 tabular-nums">{'\u{1F47B}'} {souls} Souls</p>
            </div>
            <p className="text-center text-xs font-bold text-white/60">
                Earn Souls every run: 1 per KO, 5 per wave, 25 per Gravelord. Skins are cosmetic only.
            </p>

            {MONSTERS.map((kind) => {
                const skins = SKINS.filter((s) => s.monster === kind);
                const current = equipped[kind] && owned.includes(equipped[kind]!) ? equipped[kind] : undefined;
                return (
                    <div key={kind} className="rounded-2xl bg-black/45 p-3">
                        <p className="mb-2 text-[11px] font-black tracking-[0.25em] text-amber-300">{T.monsters[kind].name.toUpperCase()}</p>
                        <div className="grid grid-cols-3 gap-2">
                            {/* classic look */}
                            <div className="flex flex-col items-center gap-1 text-center">
                                <button
                                    type="button"
                                    onClick={() => {
                                        audio.play('click');
                                        equip(kind, null);
                                    }}
                                >
                                    <Swatch kind={kind} selected={!current} />
                                </button>
                                <p className="text-xs font-black text-white">Classic</p>
                                <p className="text-[10px] font-bold text-white/50">{!current ? 'Equipped' : 'Tap to equip'}</p>
                            </div>
                            {skins.map((skin) => {
                                const have = owned.includes(skin.id);
                                const on = current === skin.id;
                                const bits = prices[shopItemFor(skin.id)];
                                const msg = status?.id === skin.id ? status.text : '';
                                return (
                                    <div key={skin.id} className="flex flex-col items-center gap-1 text-center">
                                        <button
                                            type="button"
                                            disabled={!have}
                                            onClick={() => {
                                                audio.play('click');
                                                equip(kind, skin.id);
                                            }}
                                        >
                                            <Swatch kind={kind} skin={skin} selected={on} />
                                        </button>
                                        <p className="text-xs font-black text-white">{skin.name}</p>
                                        {have ? (
                                            <p className="text-[10px] font-bold text-white/50">{on ? 'Equipped' : 'Tap to equip'}</p>
                                        ) : (
                                            <div className="flex w-full flex-col gap-1">
                                                <button
                                                    type="button"
                                                    disabled={souls < skin.souls}
                                                    className="rounded-lg bg-violet-500 px-1 py-1 text-[11px] font-black text-white active:scale-95 disabled:opacity-40"
                                                    onClick={() => {
                                                        audio.play('click');
                                                        if (!unlockWithSouls(skin.id)) setStatus({ id: skin.id, text: `Need ${skin.souls - souls} more Souls` });
                                                    }}
                                                >
                                                    {skin.souls} Souls
                                                </button>
                                                {bits && (
                                                    <button
                                                        type="button"
                                                        disabled={busy !== ''}
                                                        className="rounded-lg bg-amber-400 px-1 py-1 text-[11px] font-black text-black active:scale-95 disabled:opacity-50"
                                                        onClick={() => buy(shopItemFor(skin.id), skin.id)}
                                                    >
                                                        {busy === shopItemFor(skin.id) ? '...' : bits}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {msg && <p className="text-[10px] font-bold text-amber-200">{msg}</p>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {bundlePrice && !allOwned && (
                <div className="rounded-2xl bg-gradient-to-r from-amber-500/25 to-fuchsia-500/25 p-3 ring-2 ring-amber-400/60">
                    <p className="text-sm font-black text-white">All 6 skins</p>
                    <p className="text-xs font-bold text-white/70">Every look for the whole tag team, now and forever.</p>
                    <button
                        type="button"
                        disabled={busy !== ''}
                        className="mt-2 w-full rounded-xl bg-amber-400 py-2 text-base font-black text-black active:scale-95 disabled:opacity-50"
                        onClick={() => buy(BUNDLE_ITEM, 'bundle')}
                    >
                        {busy === BUNDLE_ITEM ? '...' : `Unlock all: ${bundlePrice}`}
                    </button>
                    {status?.id === 'bundle' && <p className="mt-1 text-center text-xs font-bold text-amber-200">{status.text}</p>}
                </div>
            )}
        </div>
    );
}

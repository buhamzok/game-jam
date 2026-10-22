/**
 * Cosmetic skins: a recolor of each monster's model (no gameplay effect).
 * Each one unlocks with Souls earned in runs, or with RUN Bits in the shop
 * (`rundot/shop.config.json`: the shop item `itemId` grants entitlement
 * `skin_<id>`). The "All skins" bundle grants every skin.
 */
import type { MonsterKind } from './tuning.ts';

export interface SkinDef {
    id: string;
    monster: MonsterKind;
    name: string;
    /** Surface recolored toward `tint` by `amount`, keeping texture brightness (see CharacterView.setSkin). */
    tint: number;
    amount: number;
    /** Faint idle aura. */
    glow: number;
    glowAmount: number;
    /** Price in Souls (earned in runs). */
    souls: number;
}

export const SKINS: SkinDef[] = [
    { id: 'wolf_silver', monster: 'werewolf', name: 'Silverback', tint: 0xdfe3ea, amount: 0.85, glow: 0x93c5fd, glowAmount: 0.07, souls: 150 },
    { id: 'wolf_hellhound', monster: 'werewolf', name: 'Hellhound', tint: 0x241816, amount: 0.92, glow: 0xff3d00, glowAmount: 0.07, souls: 400 },
    { id: 'vamp_nosferatu', monster: 'vampire', name: 'Nosferatu', tint: 0x8aa1b6, amount: 0.75, glow: 0x67e8f9, glowAmount: 0.07, souls: 150 },
    { id: 'vamp_bloodmoon', monster: 'vampire', name: 'Blood Moon', tint: 0xb0122e, amount: 0.7, glow: 0xff1744, glowAmount: 0.2, souls: 400 },
    { id: 'stitch_pumpkin', monster: 'stitched', name: 'Pumpkin King', tint: 0xff7a1a, amount: 0.75, glow: 0xffa040, glowAmount: 0.1, souls: 150 },
    { id: 'stitch_toxic', monster: 'stitched', name: 'Toxic', tint: 0x3ddc5a, amount: 0.75, glow: 0x7cff4f, glowAmount: 0.22, souls: 400 },
    { id: 'wolf_moonwraith', monster: 'werewolf', name: 'Moon Wraith', tint: 0x9fd6ff, amount: 0.82, glow: 0x60a5fa, glowAmount: 0.12, souls: 600 },
    { id: 'vamp_thornrose', monster: 'vampire', name: 'Thorn Rose', tint: 0xd9468f, amount: 0.7, glow: 0xff8ac2, glowAmount: 0.14, souls: 600 },
    { id: 'stitch_graverot', monster: 'stitched', name: 'Grave Rot', tint: 0x7f8f3a, amount: 0.8, glow: 0xa3e635, glowAmount: 0.14, souls: 600 },
];

export const skinById = (id: string | undefined): SkinDef | undefined => SKINS.find((s) => s.id === id);

/** Shop item ids (rundot/shop.config.json). */
export const shopItemFor = (skinId: string): string => `skin_${skinId}`;
export const BUNDLE_ITEM = 'skins_all';
/** Entitlement ids match the shop item ids. */
export const entitlementFor = shopItemFor;

/** Souls a run earns: per KO, per wave cleared, per Gravelord felled. */
export const SOULS = { perKill: 1, perWave: 5, perBoss: 25 };

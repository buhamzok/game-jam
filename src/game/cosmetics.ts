/**
 * Non-skin cosmetics: portal colors and the victory pose.
 * Cosmetic only. Portal colors tint the realm portal (PortalView) and unlock
 * with Souls; the victory pose makes the title-screen lineup celebrate.
 */
export interface PortalStyleDef {
    id: string;
    name: string;
    color: number;
    /** Price in Souls; 0 = owned from the start. */
    souls: number;
}

export const PORTAL_STYLES: PortalStyleDef[] = [
    { id: 'violet', name: 'Violet Rift', color: 0xc084fc, souls: 0 },
    { id: 'emerald', name: 'Emerald Rift', color: 0x34d399, souls: 250 },
    { id: 'crimson', name: 'Crimson Rift', color: 0xfb7185, souls: 250 },
    { id: 'frost', name: 'Frost Rift', color: 0x67e8f9, souls: 250 },
];

export const portalStyleById = (id: string | undefined): PortalStyleDef | undefined =>
    PORTAL_STYLES.find((p) => p.id === id);

/** The victory pose cosmetic (one unlock, all three monsters). */
export const VICTORY_POSE = { name: 'Victory Pose', souls: 300 };

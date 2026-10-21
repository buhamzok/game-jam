/**
 * Realms: the maps a run travels through. Every boss wave (5, 10, ...) ends
 * with a portal; stepping in moves the fight to the next realm, and the waves
 * carry on (still getting harder). After the last realm the cycle repeats.
 *
 * The simulation reads `arena` (size in sim units) and `obstacles` (solid
 * circles nobody can walk through, in sim units, y down). The 3D view reads
 * `theme` (colors, lights, border style, props); prop names come from
 * props.glb (see view/arena3d.ts).
 */

export interface Obstacle {
    x: number;
    y: number;
    /** Solid radius, sim units. */
    r: number;
    /** Prop drawn there, and its size relative to the KayKit scale. */
    prop: string;
    scale: number;
    /** Prop yaw, radians. */
    rot?: number;
}

export type BorderStyle = 'fence' | 'trees' | 'graves' | 'pumpkins';

export interface RealmTheme {
    /** Sky/background and fog color, fog density. */
    night: number;
    fog: number;
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    moon: number;
    moonIntensity: number;
    /** Ground outside the fight area and the fight floor: base color + speckle colors. */
    outside: [string, string[]];
    floor: [string, string[]];
    border: BorderStyle;
    /** Props scattered in the dark around the arena. */
    outsideProps: string[];
    /** Low props along the near edge (never hide the action). */
    nearProps: string[];
    /** Flat decor inside the fight area. */
    decor: string[];
    /** Point-light color for lanterns and jack-o'-lanterns. */
    lamp: number;
    /** A landmark beyond the far edge. */
    landmark?: { prop: string; scale: number };
}

export interface RealmDef {
    id: string;
    name: string;
    /** Banner subtitle when arriving. */
    sub: string;
    arena: { w: number; h: number };
    obstacles: Obstacle[];
    theme: RealmTheme;
}

const GRAVEYARD: RealmDef = {
    id: 'graveyard',
    name: 'THE GRAVEYARD',
    sub: 'Where the hunt begins',
    arena: { w: 1100, h: 1600 },
    obstacles: [],
    theme: {
        night: 0x120d1c,
        fog: 0.022,
        hemiSky: 0xb4bcff,
        hemiGround: 0x3a2440,
        hemiIntensity: 2.4,
        moon: 0xdfe4ff,
        moonIntensity: 2.6,
        outside: ['#1b1626', ['#2a2238', '#141019', '#24301f']],
        floor: ['#4a3e58', ['#5a4c69', '#3a3046', '#63557a', '#4d4936']],
        border: 'fence',
        outsideProps: ['tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'gravestone', 'grave_A', 'grave_B', 'gravemarker_A', 'gravemarker_B', 'coffin'],
        nearProps: ['pumpkin_orange_small', 'skull', 'bone_A', 'candle_triple', 'gravemarker_A'],
        decor: ['bone_A', 'skull', 'ribcage', 'pumpkin_orange_small'],
        lamp: 0xff8a2a,
        landmark: { prop: 'crypt', scale: 1.2 },
    },
};

const HOLLOW_WOODS: RealmDef = {
    id: 'woods',
    name: 'THE HOLLOW WOODS',
    sub: 'Dead trees block the way: use them as cover from bolts',
    arena: { w: 1500, h: 2000 },
    obstacles: [
        { x: -380, y: -560, r: 42, prop: 'tree_dead_large', scale: 1.1, rot: 0.4 },
        { x: 390, y: -380, r: 42, prop: 'tree_dead_large', scale: 1.0, rot: 2.1 },
        { x: -60, y: -120, r: 36, prop: 'tree_dead_medium', scale: 1.2, rot: 1.2 },
        { x: -430, y: 220, r: 36, prop: 'tree_dead_medium', scale: 1.2, rot: 3.0 },
        { x: 420, y: 330, r: 42, prop: 'tree_dead_large', scale: 1.0, rot: 5.0 },
        { x: 30, y: 620, r: 30, prop: 'tree_dead_small', scale: 1.4, rot: 0.9 },
    ],
    theme: {
        night: 0x0b1410,
        fog: 0.03,
        hemiSky: 0xa7f3d0,
        hemiGround: 0x1f2b1a,
        hemiIntensity: 2.1,
        moon: 0xd1fae5,
        moonIntensity: 2.2,
        outside: ['#111a14', ['#1b2a1e', '#0b120d', '#2a2a18']],
        floor: ['#3c4a33', ['#4a5c3d', '#2f3a28', '#56663f', '#433d2c']],
        border: 'trees',
        outsideProps: ['tree_dead_large', 'tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'gravemarker_B', 'post_lantern'],
        nearProps: ['bone_A', 'skull', 'gravemarker_A', 'pumpkin_orange_small'],
        decor: ['bone_A', 'skull', 'ribcage'],
        lamp: 0x9cff7a,
        landmark: { prop: 'shrine_candles', scale: 2.2 },
    },
};

const PUMPKIN_PATCH: RealmDef = {
    id: 'patch',
    name: 'THE PUMPKIN PATCH',
    sub: 'Lantern light, and the hunters are faster now',
    arena: { w: 1300, h: 1800 },
    obstacles: [
        { x: -320, y: -380, r: 52, prop: 'pumpkin_orange_jackolantern', scale: 2.4, rot: 0.5 },
        { x: 330, y: -360, r: 52, prop: 'pumpkin_yellow_jackolantern', scale: 2.4, rot: -0.4 },
        { x: -330, y: 360, r: 52, prop: 'pumpkin_yellow_jackolantern', scale: 2.4, rot: 2.6 },
        { x: 320, y: 380, r: 52, prop: 'pumpkin_orange_jackolantern', scale: 2.4, rot: 3.6 },
    ],
    theme: {
        night: 0x1a0f0a,
        fog: 0.02,
        hemiSky: 0xffd7a8,
        hemiGround: 0x3b2414,
        hemiIntensity: 2.2,
        moon: 0xffe8c7,
        moonIntensity: 2.0,
        outside: ['#1c130d', ['#2b1d12', '#120c08', '#2d2a14']],
        floor: ['#4a3324', ['#5a3f2b', '#3a2819', '#6b4a2f', '#433d22']],
        border: 'pumpkins',
        outsideProps: ['pumpkin_orange_jackolantern', 'pumpkin_yellow_jackolantern', 'pumpkin_orange_small', 'tree_dead_medium', 'post_lantern', 'gravemarker_A'],
        nearProps: ['pumpkin_orange_small', 'pumpkin_orange_small', 'candle_triple', 'skull'],
        decor: ['pumpkin_orange_small', 'bone_A', 'skull'],
        lamp: 0xff9a3c,
        landmark: { prop: 'arch_gate', scale: 1.3 },
    },
};

const BLOOD_MOON_CRYPT: RealmDef = {
    id: 'crypt',
    name: 'THE BLOOD MOON CRYPT',
    sub: 'The last stand before the hunt starts over',
    arena: { w: 1400, h: 1800 },
    obstacles: [
        { x: -360, y: -420, r: 40, prop: 'gravestone', scale: 1.8, rot: 0 },
        { x: 360, y: -420, r: 40, prop: 'gravestone', scale: 1.8, rot: 0 },
        { x: 0, y: -60, r: 58, prop: 'coffin', scale: 1.9, rot: Math.PI / 2 },
        { x: -360, y: 380, r: 40, prop: 'gravestone', scale: 1.8, rot: 0 },
        { x: 360, y: 380, r: 40, prop: 'gravestone', scale: 1.8, rot: 0 },
    ],
    theme: {
        night: 0x160608,
        fog: 0.026,
        hemiSky: 0xffb4b4,
        hemiGround: 0x3a1418,
        hemiIntensity: 2.0,
        moon: 0xff8a8a,
        moonIntensity: 2.6,
        outside: ['#180c0e', ['#26121a', '#0e0608', '#2a1a1a']],
        floor: ['#3e2a30', ['#4c333a', '#2e1e24', '#5a3c44', '#3a2f2a']],
        border: 'graves',
        outsideProps: ['gravestone', 'grave_A', 'grave_B', 'coffin', 'tree_dead_large', 'shrine_candles'],
        nearProps: ['candle_triple', 'skull', 'bone_A', 'gravemarker_B'],
        decor: ['bone_A', 'skull', 'ribcage', 'candle_triple'],
        lamp: 0xff4040,
        landmark: { prop: 'crypt', scale: 1.6 },
    },
};

export const REALMS: RealmDef[] = [GRAVEYARD, HOLLOW_WOODS, PUMPKIN_PATCH, BLOOD_MOON_CRYPT];

/** Portal: how close the player must get to step through, sim units. */
export const PORTAL = { radius: 85, banner: 2.4 };

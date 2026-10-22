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

export type BorderStyle = 'fence' | 'trees' | 'graves' | 'pumpkins' | 'pines' | 'posts' | 'barriers' | 'walls' | 'pillars';

/** How the fight floor is drawn: dirt speckles, fallen leaves, or stone tiles. */
export type FloorPattern = 'speckle' | 'leaves' | 'tiles';

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
    /** Floor drawing (default speckle). */
    pattern?: FloorPattern;
    /** Props at the near corners (lit by the lamps) and the far corners; default jack-o'-lanterns and lanterns. */
    corners?: { near: [string, string]; far: string };
    /** Flat props laid down the middle of the floor, e.g. a stone road. */
    road?: string[];
    /** Extra lamps over obstacles (indices into `obstacles`), for torchlit or glowing maps. Keep it to 4. */
    litObstacles?: number[];
}

export interface RealmDef {
    id: string;
    name: string;
    /** The boss at the end of this realm (every 5th wave). */
    boss: import('./tuning.ts').BossType;
    /** Banner subtitle when arriving. */
    sub: string;
    arena: { w: number; h: number };
    obstacles: Obstacle[];
    theme: RealmTheme;
}

const GRAVEYARD: RealmDef = {
    id: 'graveyard',
    boss: 'gravelord',
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
    boss: 'captain',
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
    boss: 'colossus',
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
    boss: 'gravelord',
    name: 'THE BLOOD MOON CRYPT',
    sub: 'The moon bleeds and the dead stir',
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

const AUTUMN_HOLLOW: RealmDef = {
    id: 'autumn',
    boss: 'captain',
    name: 'THE AUTUMN HOLLOW',
    sub: 'Pines close in: fight between the trunks',
    arena: { w: 1500, h: 1900 },
    obstacles: [
        { x: -420, y: -520, r: 40, prop: 'tree_pine_orange_medium', scale: 0.6, rot: 0.3 },
        { x: 300, y: -620, r: 36, prop: 'tree_pine_yellow_small', scale: 0.8, rot: 1.4 },
        { x: 470, y: -90, r: 40, prop: 'tree_pine_orange_medium', scale: 0.6, rot: 2.2 },
        { x: -150, y: -60, r: 34, prop: 'tree_pine_yellow_small', scale: 0.75, rot: 0.8 },
        { x: -470, y: 330, r: 36, prop: 'tree_pine_orange_small', scale: 0.8, rot: 4.0 },
        { x: 360, y: 520, r: 34, prop: 'tree_pine_yellow_small', scale: 0.75, rot: 5.2 },
    ],
    theme: {
        night: 0x1a0e08,
        fog: 0.024,
        hemiSky: 0xffd2a0,
        hemiGround: 0x3a2010,
        hemiIntensity: 2.3,
        moon: 0xffe2bd,
        moonIntensity: 2.2,
        outside: ['#1e120a', ['#2e1c0e', '#140b06', '#3a2410']],
        floor: ['#4a3220', ['#9a4a1c', '#b0702a', '#6e3216', '#8a6a2e', '#3e2818']],
        pattern: 'leaves',
        border: 'pines',
        outsideProps: ['tree_pine_orange_medium', 'tree_pine_orange_small', 'tree_pine_yellow_medium', 'tree_pine_yellow_small', 'pumpkin_orange', 'pumpkin_yellow'],
        nearProps: ['pumpkin_yellow_small', 'pumpkin_orange_small', 'bone_B', 'candle_melted'],
        decor: ['pumpkin_yellow_small', 'bone_B', 'skull'],
        lamp: 0xffb050,
        landmark: { prop: 'shrine', scale: 2.4 },
    },
};

const SHRINE_ROAD: RealmDef = {
    id: 'shrines',
    boss: 'colossus',
    name: 'THE SHRINE ROAD',
    sub: 'A long road of skulls: the hunters come from both ends',
    arena: { w: 1200, h: 2100 },
    obstacles: [
        { x: -330, y: -640, r: 34, prop: 'shrine', scale: 1.3, rot: 0.5 },
        { x: 330, y: -640, r: 34, prop: 'shrine', scale: 1.3, rot: -0.5 },
        { x: -340, y: -40, r: 30, prop: 'pillar', scale: 1.4, rot: 0 },
        { x: 340, y: -40, r: 30, prop: 'pillar', scale: 1.4, rot: 0 },
        { x: -330, y: 560, r: 34, prop: 'plaque_candles', scale: 1.3, rot: 0.3 },
        { x: 330, y: 560, r: 34, prop: 'plaque_candles', scale: 1.3, rot: -0.3 },
    ],
    theme: {
        night: 0x0c0d1c,
        fog: 0.028,
        hemiSky: 0xc4caff,
        hemiGround: 0x22203a,
        hemiIntensity: 2.3,
        moon: 0xdde3ff,
        moonIntensity: 2.4,
        outside: ['#13131f', ['#1d1d30', '#0b0b14', '#22283a']],
        floor: ['#3e3f52', ['#4c4e64', '#30313f', '#5a5c74', '#414a44']],
        border: 'posts',
        road: ['path_A', 'path_B', 'path_D'],
        outsideProps: ['post_skull', 'shrine', 'pillar', 'tree_dead_medium', 'gravemarker_B', 'grave_A_destroyed'],
        nearProps: ['candle_melted', 'skull', 'bone_C', 'candle_triple'],
        decor: ['skull', 'bone_C', 'candle_melted'],
        lamp: 0xa0b0ff,
        landmark: { prop: 'arch', scale: 2.2 },
        litObstacles: [0, 1],
    },
};

const OSSUARY: RealmDef = {
    id: 'ossuary',
    boss: 'colossus',
    name: 'THE OSSUARY',
    sub: 'Bones of every hunter who came before',
    arena: { w: 1300, h: 1800 },
    obstacles: [
        { x: -300, y: -380, r: 36, prop: 'd_column', scale: 2.2, rot: 0 },
        { x: 300, y: -380, r: 36, prop: 'd_column', scale: 2.2, rot: 0 },
        { x: 0, y: -80, r: 30, prop: 'skull_candle', scale: 2.2, rot: 0 },
        { x: -300, y: 300, r: 36, prop: 'd_column', scale: 2.2, rot: 0 },
        { x: 300, y: 300, r: 36, prop: 'd_column', scale: 2.2, rot: 0 },
    ],
    theme: {
        night: 0x0c120a,
        fog: 0.03,
        hemiSky: 0xd9f99d,
        hemiGround: 0x1f2814,
        hemiIntensity: 2.0,
        moon: 0xecfccb,
        moonIntensity: 2.0,
        outside: ['#10140c', ['#1a2012', '#0a0d07', '#26291a']],
        floor: ['#5c5a48', ['#77735c', '#46453a', '#8a856a', '#4f5a3c']],
        border: 'barriers',
        outsideProps: ['ribcage', 'skull', 'bone_B', 'bone_C', 'grave_A_destroyed', 'd_rubble_half', 'skull_candle'],
        nearProps: ['bone_A', 'bone_B', 'skull', 'bone_C'],
        decor: ['bone_A', 'bone_B', 'bone_C', 'skull', 'ribcage'],
        lamp: 0x9cff6a,
        landmark: { prop: 'crypt', scale: 1.4 },
        corners: { near: ['skull_candle', 'candle_triple'], far: 'skull_candle' },
        litObstacles: [2],
    },
};

const DUNGEON_DEPTHS: RealmDef = {
    id: 'depths',
    boss: 'gravelord',
    name: 'THE DUNGEON DEPTHS',
    sub: 'Torchlight and stone: the pillars stop bolts',
    arena: { w: 1300, h: 1900 },
    obstacles: [
        { x: -330, y: -560, r: 38, prop: 'd_pillar', scale: 1.0, rot: 0 },
        { x: 330, y: -560, r: 38, prop: 'd_pillar', scale: 1.0, rot: 0 },
        { x: -330, y: -60, r: 38, prop: 'd_pillar', scale: 1.0, rot: 0 },
        { x: 330, y: -60, r: 38, prop: 'd_pillar', scale: 1.0, rot: 0 },
        { x: -330, y: 440, r: 38, prop: 'd_pillar', scale: 1.0, rot: 0 },
        { x: 330, y: 440, r: 38, prop: 'd_pillar', scale: 1.0, rot: 0 },
    ],
    theme: {
        night: 0x0a0806,
        fog: 0.034,
        hemiSky: 0xffd8a8,
        hemiGround: 0x241a12,
        hemiIntensity: 1.7,
        moon: 0xffd2a0,
        moonIntensity: 1.4,
        outside: ['#100c09', ['#1a140e', '#080605', '#221a12']],
        floor: ['#4a4440', ['#57514c', '#3a3532', '#625a52', '#47413a']],
        pattern: 'tiles',
        border: 'walls',
        outsideProps: ['d_barrel_large', 'd_rubble_half', 'd_column', 'd_torch_lit', 'd_barrier_column'],
        nearProps: ['d_rubble_half', 'skull', 'bone_A', 'candle_melted'],
        decor: ['bone_A', 'skull', 'bone_C'],
        lamp: 0xff9a3c,
        corners: { near: ['d_torch_lit', 'd_barrel_large'], far: 'd_torch_lit' },
        litObstacles: [0, 1, 4, 5],
    },
};

const HUNTERS_KEEP: RealmDef = {
    id: 'keep',
    boss: 'captain',
    name: "THE HUNTERS' KEEP",
    sub: 'Their own hall: they will not hold back',
    arena: { w: 1400, h: 1800 },
    obstacles: [
        { x: -380, y: -460, r: 40, prop: 'd_barrel_large', scale: 1.3, rot: 0.4 },
        { x: 380, y: -460, r: 40, prop: 'd_barrel_large', scale: 1.3, rot: 1.9 },
        { x: 0, y: -100, r: 44, prop: 'd_barrel_large', scale: 1.5, rot: 0.9 },
        { x: -400, y: 360, r: 38, prop: 'd_column', scale: 2.2, rot: 0 },
        { x: 400, y: 360, r: 38, prop: 'd_column', scale: 2.2, rot: 0 },
    ],
    theme: {
        night: 0x120806,
        fog: 0.026,
        hemiSky: 0xffc9a0,
        hemiGround: 0x2e1a10,
        hemiIntensity: 2.0,
        moon: 0xffd8b0,
        moonIntensity: 1.8,
        outside: ['#140c08', ['#20140c', '#0a0604', '#2a1a0e']],
        floor: ['#5a4434', ['#6a503c', '#45342a', '#76583e', '#4e3e30']],
        pattern: 'tiles',
        border: 'walls',
        outsideProps: ['d_barrel_large', 'd_banner_triple_red', 'd_torch_lit', 'd_column', 'd_sword_shield'],
        nearProps: ['d_barrel_large', 'd_rubble_half', 'skull', 'candle_triple'],
        decor: ['bone_A', 'skull', 'candle_melted'],
        lamp: 0xffb060,
        corners: { near: ['d_torch_lit', 'd_barrel_large'], far: 'd_banner_patternA_red' },
        litObstacles: [3, 4],
    },
};

const WITCHING_GATE: RealmDef = {
    id: 'gate',
    boss: 'gravelord',
    name: 'THE WITCHING GATE',
    sub: 'The last stand before the hunt starts over',
    arena: { w: 1400, h: 1800 },
    obstacles: [
        { x: 0, y: -560, r: 30, prop: 'pillar', scale: 1.5, rot: 0 },
        { x: -440, y: -260, r: 30, prop: 'pillar', scale: 1.5, rot: 0.6 },
        { x: 440, y: -260, r: 30, prop: 'pillar', scale: 1.5, rot: -0.6 },
        { x: -440, y: 300, r: 30, prop: 'pillar', scale: 1.5, rot: 1.1 },
        { x: 440, y: 300, r: 30, prop: 'pillar', scale: 1.5, rot: -1.1 },
    ],
    theme: {
        night: 0x120a22,
        fog: 0.026,
        hemiSky: 0xe9d5ff,
        hemiGround: 0x2a1640,
        hemiIntensity: 2.3,
        moon: 0xf0e0ff,
        moonIntensity: 2.6,
        outside: ['#150d24', ['#211436', '#0c0716', '#2c1a40']],
        floor: ['#3e2e58', ['#4c3a6a', '#302246', '#5c4880', '#3a3a54']],
        border: 'pillars',
        outsideProps: ['pillar', 'arch', 'shrine', 'shrine_candles', 'tree_dead_large', 'grave_A_destroyed'],
        nearProps: ['candle_melted', 'candle_triple', 'skull', 'bone_C'],
        decor: ['candle_melted', 'skull', 'bone_C'],
        lamp: 0xc084fc,
        landmark: { prop: 'arch_gate', scale: 2.2 },
        litObstacles: [0, 1, 2],
    },
};

export const REALMS: RealmDef[] = [
    GRAVEYARD,
    HOLLOW_WOODS,
    PUMPKIN_PATCH,
    AUTUMN_HOLLOW,
    SHRINE_ROAD,
    BLOOD_MOON_CRYPT,
    OSSUARY,
    DUNGEON_DEPTHS,
    HUNTERS_KEEP,
    WITCHING_GATE,
];

/** The PVP arena: a sunken pit ringed with graves and candles under a blood moon, no obstacles. */
export const BLOOD_PIT: RealmDef = {
    id: 'pit',
    boss: 'gravelord',
    name: 'THE BLOOD PIT',
    sub: 'Tag team against tag team',
    arena: { w: 1200, h: 1500 },
    obstacles: [],
    theme: {
        ...BLOOD_MOON_CRYPT.theme,
        night: 0x12040a,
        fog: 0.03,
        floor: ['#45262c', ['#552e36', '#331a20', '#64363e', '#3d2a26']],
        border: 'graves',
        landmark: { prop: 'arch_gate', scale: 1.8 },
    },
};

/** Portal: how close the player must get to step through, sim units. */
export const PORTAL = { radius: 85, banner: 2.4 };

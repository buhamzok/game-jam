import { loadFont } from '@remotion/fonts';
import { continueRender, delayRender, Easing, interpolate, staticFile } from 'remotion';

// Fonts ship with the project (public/fonts, from @fontsource, SIL OFL), so renders never depend on the network.
export const HEAVY = 'Archivo Black';
export const SERIF = 'Instrument Serif';
export const MONO = 'JetBrains Mono';
const fontsReady = delayRender('Loading fonts');
void Promise.all([
    loadFont({ family: HEAVY, url: staticFile('fonts/archivo-black-latin-400-normal.woff2'), weight: '400' }),
    loadFont({ family: SERIF, url: staticFile('fonts/instrument-serif-latin-400-italic.woff2'), weight: '400', style: 'italic' }),
    loadFont({ family: MONO, url: staticFile('fonts/jetbrains-mono-latin-500-normal.woff2'), weight: '500' }),
    loadFont({ family: MONO, url: staticFile('fonts/jetbrains-mono-latin-700-normal.woff2'), weight: '700' }),
]).then(() => continueRender(fontsReady));

/** The game's palette: werewolf amber on a graveyard night, blood red, witching violet. */
export const C = {
    ink: '#0d0a16',
    amber: '#f59e0b',
    gold: '#fde68a',
    blood: '#dc2626',
    violet: '#a855f7',
    cream: '#EDEBE4',
    white: '#ffffff',
};

/** Music: "The 9th Circle" (CC0) at exactly 180 BPM: a beat is 10 frames at 30 fps, a bar 40. */
export const BEAT = 10;
export const BAR = 40;
/** The track's first strong downbeat after the build starts, in seconds. */
export const MUSIC_START = 8.892;

/** Scene lengths in frames (every cut lands on a beat). */
export const SCENES = {
    spark: 60,
    brand: 100,
    combat: 120,
    tag: 100,
    moon: 100,
    boss: 120,
    realms: 120,
    pvp: 120,
    end: 110,
} as const;
export const TOTAL = Object.values(SCENES).reduce((a, b) => a + b, 0);

/** Frame each scene starts at. */
export const STARTS = (() => {
    const out: Record<keyof typeof SCENES, number> = {} as never;
    let t = 0;
    for (const k of Object.keys(SCENES) as (keyof typeof SCENES)[]) {
        out[k] = t;
        t += SCENES[k];
    }
    return out;
})();

const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0..1 progress of `frame` through [a, b], eased. */
export const seg = (frame: number, a: number, b: number, easing = Easing.bezier(0.16, 1, 0.3, 1)) => interpolate(frame, [a, b], [0, 1], { ...CL, easing });

/** A punchy landing with a slight overshoot (spring-like, frame based). */
export const land = (frame: number, at: number, dur = 9) => interpolate(frame, [at, at + dur], [0, 1], { ...CL, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });

/** Font size scaled to the frame: sizes are written for a 1080 px short side. */
export const useUnit = (width: number, height: number) => Math.min(width, height) / 1080;

import type { SfxName } from './audio.ts';

export interface SoundOpts {
    /** Extra gain on top of the event's mix level. */
    volume?: number;
    /** Sim x of the source; the sound pans left or right of the player. */
    x?: number;
    /** Seconds until the moment the sound's peak should land (a whoosh on its hit frame). */
    align?: number;
    /** Seconds to wait before playing. */
    delay?: number;
}

/**
 * The effects interface the simulation talks to. The simulation only says
 * what happened and where (in sim units, y down); the renderer decides how it
 * looks. Hitstop and shake live here too because they change simulation time
 * and camera, and both sides read them.
 */
export interface Fx {
    /** Seconds of frozen simulation left (hit pause). */
    hitstop: number;
    /** 0..1 camera shake intensity. */
    trauma: number;

    burst(x: number, y: number, color: number, count?: number, speed?: number, size?: number, life?: number, glow?: boolean): void;
    /** Directional spray of sparks, e.g. away from the attacker. */
    spray(x: number, y: number, angle: number, spreadRad: number, color: number, count?: number, speed?: number, size?: number, life?: number): void;
    /** Stationary fading afterimage blob. */
    trail(x: number, y: number, color: number, size: number, life?: number): void;
    slash(x: number, y: number, angle: number, radius: number, spreadRad: number, color: number, width?: number, life?: number): void;
    ring(x: number, y: number, r0: number, r1: number, color: number, width?: number, life?: number): void;
    /** Ground cracks radiating from (x, y) out to `radius`, with a glowing seam of `color`. */
    crack(x: number, y: number, radius: number, color: number, life?: number): void;
    text(x: number, y: number, str: string, color?: number, size?: number, life?: number): void;
    shake(amount: number): void;
    freeze(seconds: number): void;
    /** Screen-wide color flash. */
    flash(color: number, alpha: number): void;
    /** Play a named sound event (see tools/sfx-kit.json). */
    sound(name: SfxName, opts?: SoundOpts): void;
}

/** Shared palette (hex numbers), used by both simulation effect calls and the renderer. */
export const C = {
    wolf: 0xf59e0b,
    jab: 0xef4444,
    heavy: 0xa855f7,
    counter: 0xd8b4fe,
    witching: 0x4c1d95,
    spark: 0xffe8a3,
    blood: 0xfb7185,
    hunter: 0xc8a27a,
    block: 0xcbd5e1,
    rod: 0x4ade80,
    /** Crossbow bolts and the rogue's aim line. */
    bolt: 0xff6a3d,
    /** Red Overcharge (transformed Stitched). */
    overcharge: 0xff3b3b,
    /** Vampire bats. */
    bat: 0x9f1239,
};

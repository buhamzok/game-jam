/**
 * Shared layers: gameplay footage (cover-fit), the viewfinder HUD frame,
 * vignette and grain, and the shape wipes that carry each cut.
 */
import { Video } from '@remotion/media';
import { AbsoluteFill, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, MONO, TOTAL } from './theme';

export const Footage = ({ clip, orient, trim = 0, rate = 1 }: { clip: string; orient: string; trim?: number; rate?: number }) => (
    <Video
        src={staticFile(`clips/${orient}/${clip}.mp4`)}
        trimBefore={trim}
        playbackRate={rate}
        muted
        objectFit="cover"
        style={{ width: '100%', height: '100%' }}
    />
);

/** Darken the footage under text: a gradient from the side the text sits on. */
export const Shade = ({ from = 'bottom', strength = 0.75 }: { from?: 'bottom' | 'top' | 'left' | 'right' | 'center'; strength?: number }) => {
    const bg =
        from === 'center'
            ? `radial-gradient(ellipse at center, rgba(13,10,22,${strength}) 0%, rgba(13,10,22,${strength * 0.4}) 55%, rgba(13,10,22,0) 100%)`
            : `linear-gradient(to ${({ bottom: 'top', top: 'bottom', left: 'right', right: 'left' } as const)[from]}, rgba(13,10,22,${strength}) 0%, rgba(13,10,22,0) 60%)`;
    return <AbsoluteFill style={{ background: bg }} />;
};

/** Camera viewfinder on every scene: corner brackets, scene count, category, running timecode. */
export const Hud = ({ scene, total, label, start = 0 }: { scene: number; total: number; label: string; start?: number }) => {
    const frame = useCurrentFrame() + start;
    const { width, height, fps } = useVideoConfig();
    const u = Math.min(width, height) / 1080;
    const m = 44 * u;
    const len = 46 * u;
    const line = 3 * u;
    const font = { fontFamily: MONO, fontWeight: 500, fontSize: 19 * u, letterSpacing: 2 * u, color: C.white, opacity: 0.6 } as const;
    const corner = (x: 'left' | 'right', y: 'top' | 'bottom') => (
        <div style={{ position: 'absolute', [x]: m, [y]: m, width: len, height: len, [`border${y === 'top' ? 'Top' : 'Bottom'}`]: `${line}px solid rgba(255,255,255,0.55)`, [`border${x === 'left' ? 'Left' : 'Right'}`]: `${line}px solid rgba(255,255,255,0.55)` }} />
    );
    // the timecode runs on the whole trailer's clock (scenes pass their offset in via the parent sequence)
    const s = frame / fps;
    const tc = `00:${String(Math.floor(s)).padStart(2, '0')}:${String(Math.floor((s % 1) * fps)).padStart(2, '0')}`;
    const blink = Math.floor(frame / 8) % 2 === 0;
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            {corner('left', 'top')}
            {corner('right', 'top')}
            {corner('left', 'bottom')}
            {corner('right', 'bottom')}
            <div style={{ ...font, position: 'absolute', top: m + 8 * u, right: m + len + 14 * u }}>
                SCENE {String(scene).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </div>
            <div style={{ ...font, position: 'absolute', bottom: m + 8 * u, left: m + len + 14 * u }}>{label}</div>
            <div style={{ ...font, position: 'absolute', bottom: m + 8 * u, right: m + len + 14 * u, display: 'flex', alignItems: 'center', gap: 10 * u }}>
                <span style={{ width: 12 * u, height: 12 * u, borderRadius: 99, background: C.blood, opacity: blink ? 1 : 0.25 }} />
                {tc}
            </div>
        </AbsoluteFill>
    );
};

/** Vignette and film grain over everything (seeded grain tiles, cycled). */
export const Texture = () => {
    const frame = useCurrentFrame();
    const tile = Math.floor(frame / 2) % 6;
    const dots = Array.from({ length: 160 }, (_, i) => {
        const r = random(`g${tile}-${i}`);
        const r2 = random(`h${tile}-${i}`);
        return `radial-gradient(circle at ${(r * 100).toFixed(2)}% ${(r2 * 100).toFixed(2)}%, rgba(255,255,255,0.07) 0, rgba(255,255,255,0) 2px)`;
    });
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)' }} />
            <AbsoluteFill style={{ backgroundImage: dots.join(','), mixBlendMode: 'screen' }} />
        </AbsoluteFill>
    );
};

/**
 * Shape wipes that carry the cut (rendered on top, centered on the cut frame):
 * - flood: an accent bar sweeps across and covers the frame, then leaves the other way;
 * - slash: a diagonal blade of color crosses the frame;
 * - iris: a ring closes to a dot then opens on the next scene.
 */
export const Wipe = ({ kind, color = C.blood, dur }: { kind: 'flood' | 'slash' | 'iris'; color?: string; dur: number }) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const half = dur / 2;
    if (kind === 'iris') {
        const r = Math.hypot(width, height) / 2;
        const close = interpolate(frame, [0, half], [r, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const open = interpolate(frame, [half, dur], [0, r], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const rad = frame < half ? close : open;
        return (
            <AbsoluteFill
                style={{
                    background: `radial-gradient(circle at 50% 50%, rgba(0,0,0,0) ${rad}px, ${color} ${rad + 2}px)`,
                }}
            />
        );
    }
    if (kind === 'slash') {
        const p = interpolate(frame, [0, dur], [-0.6, 1.6], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
            <AbsoluteFill style={{ overflow: 'hidden' }}>
                <div
                    style={{
                        position: 'absolute',
                        top: '-50%',
                        left: `${p * 100 - 50}%`,
                        width: '100%',
                        height: '200%',
                        rotate: '18deg',
                        background: `linear-gradient(to right, rgba(0,0,0,0) 0%, ${color} 30%, ${color} 70%, rgba(0,0,0,0) 100%)`,
                    }}
                />
            </AbsoluteFill>
        );
    }
    // flood: in from the left, out to the right
    const inP = interpolate(frame, [0, half], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const outP = interpolate(frame, [half, dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${outP * 100}%`, width: `${(inP - outP) * 100}%`, background: color }} />
        </AbsoluteFill>
    );
};

export const TOTAL_SCENES = 9;
export const TRAILER_FRAMES = TOTAL;

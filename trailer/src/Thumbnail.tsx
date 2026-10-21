/**
 * The game tile (public/thumbnail.jpg): the 3D hero shot from the game
 * (capture/thumb.mjs -> public/thumb-art.png) with the title on top, in the
 * trailer's type. Rendered at 1024 and scaled to 512 for RUN.
 */
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { C, HEAVY, MONO } from './trailer/theme';

const title = {
    fontFamily: HEAVY,
    lineHeight: 0.86,
    letterSpacing: -2,
    color: C.amber,
    backgroundImage: `linear-gradient(to bottom, ${C.gold} 0%, ${C.amber} 55%, #ea580c 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    // dark outline drawn under the fill, then a hard drop shadow
    WebkitTextStroke: '14px #1a0b05',
    paintOrder: 'stroke fill',
    filter: 'drop-shadow(0 10px 0 #1a0b05) drop-shadow(0 0 36px rgba(220,38,38,0.55))',
} as const;

export const Thumbnail = () => (
    <AbsoluteFill style={{ background: C.ink }}>
        <Img src={staticFile('thumb-art.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {/* vignette, and night pooling at the bottom under the title */}
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0) 50%, rgba(5,2,10,0.65) 100%)' }} />
        <AbsoluteFill style={{ background: 'linear-gradient(to top, rgba(13,10,22,0.96) 0%, rgba(13,10,22,0.82) 24%, rgba(13,10,22,0) 46%)' }} />
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 54 }}>
            <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 30, letterSpacing: 12, color: C.gold, marginBottom: 14, textShadow: '0 3px 0 #000' }}>MONSTER MASH</div>
            <div style={{ ...title, fontSize: 150 }}>TAG TEAM</div>
            <div style={{ ...title, fontSize: 212, marginTop: 4 }}>TERROR</div>
        </AbsoluteFill>
    </AbsoluteFill>
);

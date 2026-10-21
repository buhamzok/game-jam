/**
 * The trailer's scenes. Each one is gameplay footage (or the dark open/end)
 * with one idea in kinetic type on top, landing on the 180 BPM grid
 * (a beat = 10 frames). Sizes are written for a 1080 px short side and scale.
 */
import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { Footage, Hud, Shade } from './Frame';
import { BEAT, C, HEAVY, land, MONO, seg, SERIF } from './theme';

type SceneProps = { orient: string; scene: number; total: number; start: number };
const CL = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const useLayout = () => {
    const { width, height } = useVideoConfig();
    const u = Math.min(width, height) / 1080;
    return { u, portrait: height > width, width, height };
};

/** Letters rise into place one after another (masked), starting at `at`, `every` frames apart. */
const MaskedWord = ({ text, at, every = 2, style }: { text: string; at: number; every?: number; style: CSSProperties }) => {
    const frame = useCurrentFrame();
    return (
        <div style={{ display: 'flex', whiteSpace: 'nowrap', ...style }}>
            {text.split('').map((ch, i) => {
                const p = land(frame, at + i * every, 8);
                return (
                    <span key={i} style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.08em' }}>
                        <span style={{ display: 'inline-block', translate: `0 ${(1 - p) * 105}%` }}>{ch === ' ' ? ' ' : ch}</span>
                    </span>
                );
            })}
        </div>
    );
};

/** A word that slams in: from big and blurred to its size, with an overshoot. */
const Slam = ({ children, at, style }: { children: ReactNode; at: number; style: CSSProperties }) => {
    const frame = useCurrentFrame();
    const p = land(frame, at, 8);
    const blur = interpolate(frame, [at, at + 5], [14, 0], CL);
    return (
        <div
            style={{
                whiteSpace: 'nowrap',
                opacity: interpolate(frame, [at, at + 2], [0, 1], CL),
                scale: String(interpolate(p, [0, 1], [1.6, 1])),
                filter: `blur(${blur}px)`,
                ...style,
            }}
        >
            {children}
        </div>
    );
};

const Mono = ({ children, u, style }: { children: ReactNode; u: number; style?: CSSProperties }) => (
    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 24 * u, letterSpacing: 6 * u, color: C.cream, whiteSpace: 'nowrap', ...style }}>{children}</div>
);

const heavy = (size: number, color: string): CSSProperties => ({
    fontFamily: HEAVY,
    fontSize: size,
    lineHeight: 0.92,
    color,
    textShadow: `0 ${size * 0.05}px 0 rgba(0,0,0,0.85)`,
    letterSpacing: size * 0.01,
});

// ---- 1. spark open ------------------------------------------------------------------------

export const SparkOpen = ({ scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, width } = useLayout();
    const pulse = 1 + 0.35 * Math.sin(frame * 0.9) * interpolate(frame, [0, 12], [1, 0], CL);
    const stretch = seg(frame, 10, 26);
    const lineW = interpolate(stretch, [0, 1], [14 * u, width * 0.78]);
    const wobble = Math.sin(frame * 1.4) * 6 * u * interpolate(frame, [26, 34, 40], [0, 1, 0], CL);
    const flood = seg(frame, 44, 58, Easing.bezier(0.7, 0, 0.84, 0));
    const lineH = interpolate(flood, [0, 1], [6 * u, 2400 * u]);
    return (
        <AbsoluteFill style={{ background: C.ink }}>
            {/* faint grid */}
            <AbsoluteFill
                style={{
                    backgroundImage: `linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)`,
                    backgroundSize: `${60 * u}px ${60 * u}px`,
                }}
            />
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
                <div
                    style={{
                        width: lineW,
                        height: stretch > 0 ? lineH : 14 * u * pulse,
                        borderRadius: stretch > 0 && flood < 0.2 ? 6 * u : stretch > 0 ? 0 : 99,
                        background: C.blood,
                        boxShadow: `0 0 ${30 * u}px ${C.blood}`,
                        translate: `0 ${wobble}px`,
                    }}
                />
                <Mono u={u} style={{ position: 'absolute', marginTop: -90 * u, opacity: interpolate(frame, [16, 22, 42, 46], [0, 0.8, 0.8, 0], CL) }}>
                    RUN.WORLD / OCTOBER JAM — MONSTER MASH
                </Mono>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="OPEN" />
        </AbsoluteFill>
    );
};

// ---- 2. brand slam over the lineup --------------------------------------------------------

export const BrandSlam = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    // the red flood from the open slides off to reveal the footage
    const reveal = seg(frame, 0, 10, Easing.bezier(0.7, 0, 0.3, 1));
    const size = (portrait ? 150 : 170) * u;
    return (
        <AbsoluteFill>
            <Footage clip="lineup" orient={orient} />
            <Shade from={portrait ? 'top' : 'right'} strength={0.85} />
            <AbsoluteFill
                style={{
                    padding: portrait ? `${200 * u}px ${80 * u}px` : `${120 * u}px ${110 * u}px`,
                    justifyContent: portrait ? 'flex-start' : 'center',
                    alignItems: portrait ? 'center' : 'flex-end',
                    textAlign: portrait ? 'center' : 'right',
                }}
            >
                <Mono u={u} style={{ opacity: seg(frame, 8, 14), color: C.gold }}>
                    INTRODUCING — MONSTER MASH 2026
                </Mono>
                <div style={{ marginTop: 18 * u, display: 'flex', flexDirection: 'column', alignItems: portrait ? 'center' : 'flex-end' }}>
                    <MaskedWord text="TAG TEAM" at={12} style={heavy(size, C.amber)} />
                    <MaskedWord text="TERROR" at={28} style={heavy(size * 1.12, C.amber)} />
                </div>
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 64 * u, color: C.cream, marginTop: 14 * u, opacity: seg(frame, 44, 54), translate: `0 ${(1 - seg(frame, 44, 54)) * 20 * u}px` }}>
                    three monsters, one tag team
                </div>
            </AbsoluteFill>
            <AbsoluteFill style={{ background: C.blood, translate: `${reveal * 100}% 0` }} />
            <Hud scene={scene} total={total} start={start} label="TITLE" />
        </AbsoluteFill>
    );
};

// ---- 3. combat: DODGE / COUNTER / BREAK ------------------------------------------------------

const TRIPLET = [
    { word: 'DODGE', color: C.white, sub: 'red attacks' },
    { word: 'COUNTER', color: C.violet, sub: 'purple attacks' },
    { word: 'BREAK', color: C.blood, sub: 'their guard' },
];

export const Combat = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    const i = Math.min(2, Math.floor(frame / (4 * BEAT)));
    const at = i * 4 * BEAT;
    const t = TRIPLET[i];
    const size = (portrait ? 190 : 200) * u;
    return (
        <AbsoluteFill>
            <Footage clip="fight" orient={orient} trim={6} />
            <Shade from="bottom" strength={0.85} />
            {/* the word, repeated as an outline pattern behind it */}
            <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: (portrait ? 330 : 150) * u }}>
                <div style={{ position: 'absolute', bottom: (portrait ? 300 : 120) * u, opacity: 0.18 * seg(frame, at, at + 6), display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {[0, 1, 2].map((k) => (
                        <div key={k} style={{ fontFamily: HEAVY, fontSize: size * 0.9, lineHeight: 0.95, color: 'transparent', WebkitTextStroke: `${2 * u}px ${t.color}`, translate: `${(k - 1) * 60 * u + (frame - at) * (k % 2 ? 2 : -2) * u}px 0`, whiteSpace: 'nowrap' }}>
                            {t.word} {t.word}
                        </div>
                    ))}
                </div>
                <Slam key={t.word} at={at} style={heavy(size, t.color)}>
                    {t.word}.
                </Slam>
                <div key={`${t.word}-sub`} style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 58 * u, color: C.cream, opacity: seg(frame, at + 6, at + 12) }}>
                    {t.sub}
                </div>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="COMBAT" />
        </AbsoluteFill>
    );
};

// ---- 4. tag team ------------------------------------------------------------------------------

const TEAM = [
    { name: 'WEREWOLF', color: C.amber },
    { name: 'VAMPIRE', color: '#e11d48' },
    { name: 'STITCHED', color: '#4ade80' },
];

export const TagTeam = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    return (
        <AbsoluteFill>
            <Footage clip="swap" orient={orient} trim={25} />
            <Shade from="bottom" strength={0.85} />
            <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: portrait ? 'center' : 'flex-start', padding: portrait ? `0 0 ${320 * u}px` : `0 ${130 * u}px ${110 * u}px` }}>
                <Slam at={2} style={heavy((portrait ? 200 : 210) * u, C.gold)}>
                    TAG IN
                </Slam>
                <div style={{ display: 'flex', flexDirection: 'row', gap: 16 * u, marginTop: 24 * u }}>
                    {TEAM.map((m, k) => {
                        const p = land(frame, 12 + k * BEAT, 8);
                        const active = Math.floor(frame / (3 * BEAT)) % 3 === k;
                        return (
                            <div
                                key={m.name}
                                style={{
                                    fontFamily: MONO,
                                    fontWeight: 700,
                                    fontSize: (portrait ? 30 : 34) * u,
                                    letterSpacing: 4 * u,
                                    color: active ? C.ink : m.color,
                                    background: active ? m.color : 'rgba(13,10,22,0.7)',
                                    border: `${3 * u}px solid ${m.color}`,
                                    padding: `${10 * u}px ${18 * u}px`,
                                    borderRadius: 10 * u,
                                    opacity: p,
                                    translate: portrait ? `0 ${(1 - p) * 40 * u}px` : `${(1 - p) * -60 * u}px 0`,
                                }}
                            >
                                {k + 1} · {m.name}
                            </div>
                        );
                    })}
                </div>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="TAG TEAM" />
        </AbsoluteFill>
    );
};

// ---- 5. Full Moon ----------------------------------------------------------------------------

export const FullMoon = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait, height } = useLayout();
    const moon = seg(frame, 0, 18);
    const flash = interpolate(frame, [10, 13, 22], [0, 0.55, 0], CL);
    // the game camera keeps the wolf a little above center: the halo frames it, the words sit below
    const cy = height * (portrait ? 0.42 : 0.47);
    const ring = (portrait ? 430 : 420) * u;
    return (
        <AbsoluteFill>
            <Footage clip="transform" orient={orient} trim={6} />
            <Shade from="bottom" strength={0.85} />
            <AbsoluteFill style={{ background: '#ff1a1a', opacity: flash, mixBlendMode: 'screen' }} />
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    top: cy,
                    width: ring,
                    height: ring,
                    marginLeft: -ring / 2,
                    marginTop: -ring / 2,
                    borderRadius: 999,
                    border: `${5 * u}px solid ${C.cream}`,
                    boxShadow: `0 0 ${50 * u}px rgba(237,235,228,0.45), inset 0 0 ${50 * u}px rgba(237,235,228,0.2)`,
                    opacity: 0.8 * moon,
                    scale: String(interpolate(moon, [0, 1], [0.25, 1])),
                }}
            />
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: (portrait ? 300 : 120) * u }}>
                <Slam at={10} style={heavy((portrait ? 128 : 170) * u, C.white)}>
                    FULL MOON
                </Slam>
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 58 * u, color: C.cream, opacity: seg(frame, 22, 30) }}>transform for 10 seconds</div>
                <Mono u={u} style={{ marginTop: 12 * u, color: '#fca5a5', opacity: seg(frame, 34, 40) }}>
                    RED EYES · BLACK FUR · +35% DAMAGE
                </Mono>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="TRANSFORM" />
        </AbsoluteFill>
    );
};

// ---- 6. the Gravelord ----------------------------------------------------------------------

export const Gravelord = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    const shake = interpolate(frame, [4, 6, 18], [0, 1, 0], CL) * 14 * u;
    const hp = interpolate(frame, [30, 44, 70, 82], [1, 0.52, 0.52, 0.49], CL);
    const enraged = frame >= 80;
    const barW = (portrait ? 760 : 900) * u;
    return (
        <AbsoluteFill>
            <AbsoluteFill style={{ translate: `${Math.sin(frame * 3.1) * shake}px ${Math.cos(frame * 2.3) * shake}px` }}>
                <Footage clip="boss" orient={orient} trim={4} />
            </AbsoluteFill>
            <Shade from="bottom" strength={0.88} />
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: (portrait ? 280 : 90) * u }}>
                <Slam at={4} style={heavy((portrait ? 96 : 120) * u, C.cream)}>
                    THE GRAVELORD
                </Slam>
                <Slam at={18} style={heavy((portrait ? 190 : 170) * u, C.blood)}>
                    RISES
                </Slam>
                <div style={{ marginTop: 28 * u, width: barW, opacity: seg(frame, 26, 32) }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontWeight: 700, fontSize: 24 * u, letterSpacing: 4 * u, color: '#fda4af' }}>
                        <span>{enraged ? 'GRAVELORD · ENRAGED' : 'GRAVELORD'}</span>
                        <span>{Math.ceil(hp * 100)}%</span>
                    </div>
                    <div style={{ position: 'relative', marginTop: 8 * u, height: 18 * u, borderRadius: 99, background: 'rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                        <div style={{ width: `${hp * 100}%`, height: '100%', background: enraged ? C.blood : '#f43f5e', boxShadow: enraged ? `0 0 ${20 * u}px ${C.blood}` : 'none' }} />
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3 * u, background: 'rgba(255,255,255,0.8)', opacity: hp > 0.5 ? 1 : 0 }} />
                    </div>
                    <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 52 * u, color: C.cream, marginTop: 10 * u, opacity: seg(frame, 82, 90), textAlign: 'center' }}>
                        half health: it roars, summons, and leaps
                    </div>
                </div>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="BOSS" />
        </AbsoluteFill>
    );
};

// ---- 7. realms ------------------------------------------------------------------------------

const REALMS = ['THE GRAVEYARD', 'THE HOLLOW WOODS', 'THE PUMPKIN PATCH', 'THE BLOOD MOON CRYPT'];

export const Realms = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    // the portal walk-in shows realms 1 -> 2; the montage shows 3 and 4
    const idx = frame < 18 ? 0 : frame < 60 ? 1 : frame < 90 ? 2 : 3;
    const swaps = [0, 18, 60, 90];
    const at = swaps[idx];
    return (
        <AbsoluteFill>
            <Sequence durationInFrames={60} layout="none">
                <Footage clip="portal" orient={orient} trim={4} />
            </Sequence>
            <Sequence from={60} durationInFrames={30} layout="none">
                <Footage clip="patch" orient={orient} trim={20} />
            </Sequence>
            <Sequence from={90} layout="none">
                <Footage clip="crypt" orient={orient} trim={20} />
            </Sequence>
            <Shade from="bottom" strength={0.85} />
            <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: portrait ? 'center' : 'flex-start', padding: portrait ? `0 0 ${330 * u}px` : `0 ${130 * u}px ${150 * u}px` }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26 * u }}>
                    <Slam key={idx} at={at} style={heavy((portrait ? 260 : 280) * u, C.gold)}>
                        {idx + 1}
                    </Slam>
                    <div style={{ paddingBottom: 22 * u }}>
                        <div style={heavy(70 * u, C.white)}>{idx === 3 ? 'REALMS' : 'REALM'}</div>
                        <Mono u={u} style={{ color: C.cream, opacity: 0.85 }}>
                            {REALMS[idx]}
                        </Mono>
                    </div>
                </div>
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 54 * u, color: C.cream, marginTop: 6 * u, opacity: seg(frame, 6, 14) }}>
                    beat the boss, step through the portal
                </div>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="REALMS" />
        </AbsoluteFill>
    );
};

// ---- 8. PVP arena ---------------------------------------------------------------------------

export const Pvp = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    const vs = land(frame, 24, 8);
    return (
        <AbsoluteFill>
            <Footage clip="pvp" orient={orient} trim={8} />
            <Shade from="bottom" strength={0.88} />
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'flex-end', paddingBottom: (portrait ? 280 : 90) * u }}>
                <Mono u={u} style={{ color: '#fda4af', opacity: seg(frame, 2, 8) }}>
                    NEW MODE
                </Mono>
                <Slam at={4} style={heavy((portrait ? 140 : 200) * u, C.blood)}>
                    PVP ARENA
                </Slam>
                <div style={{ display: 'flex', alignItems: 'center', gap: 26 * u, marginTop: 18 * u }}>
                    <div style={{ ...heavy(54 * u, C.amber), opacity: seg(frame, 20, 26) }}>YOUR TEAM</div>
                    <div
                        style={{
                            fontFamily: HEAVY,
                            fontStyle: 'italic',
                            fontSize: 72 * u,
                            color: C.white,
                            background: C.blood,
                            borderRadius: 14 * u,
                            padding: `${0 * u}px ${18 * u}px`,
                            scale: String(interpolate(vs, [0, 1], [2.2, 1])),
                            opacity: interpolate(frame, [24, 26], [0, 1], CL),
                        }}
                    >
                        VS
                    </div>
                    <div style={{ ...heavy(54 * u, '#fb7185'), opacity: seg(frame, 28, 34) }}>THEIRS</div>
                </div>
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 56 * u, color: C.cream, marginTop: 14 * u, opacity: seg(frame, 40, 48), textAlign: 'center', maxWidth: 900 * u }}>
                    fight other players' tag teams, in their skins
                </div>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="PVP" />
        </AbsoluteFill>
    );
};

// ---- 9. end card ----------------------------------------------------------------------------

const URL = 'W.RUN/COBALTPHOENIX373/TAG-TEAM-TERROR';

export const EndCard = ({ orient, scene, total, start }: SceneProps) => {
    const frame = useCurrentFrame();
    const { u, portrait } = useLayout();
    const typed = Math.floor(interpolate(frame, [36, 76], [0, URL.length], CL));
    const caret = Math.floor(frame / 6) % 2 === 0 && typed < URL.length + 1;
    const rule = seg(frame, 26, 40);
    return (
        <AbsoluteFill style={{ background: C.ink }}>
            <AbsoluteFill style={{ opacity: 0.35, filter: `blur(${6 * u}px)` }}>
                <Footage clip="lineup" orient={orient} trim={40} rate={0.6} />
            </AbsoluteFill>
            <AbsoluteFill style={{ background: 'radial-gradient(ellipse at center, rgba(13,10,22,0.55) 0%, rgba(13,10,22,0.95) 75%)' }} />
            <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 80 * u }}>
                <MaskedWord text="TAG TEAM" at={2} every={1} style={heavy((portrait ? 150 : 150) * u, C.amber)} />
                <MaskedWord text="TERROR" at={10} every={1} style={heavy((portrait ? 168 : 168) * u, C.amber)} />
                <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 62 * u, color: C.cream, marginTop: 10 * u, opacity: seg(frame, 18, 26) }}>
                    a monster tag-team brawler
                </div>
                <div style={{ width: 640 * u * rule, height: 2 * u, background: 'rgba(237,235,228,0.6)', margin: `${30 * u}px 0` }} />
                <div style={{ ...heavy(64 * u, C.white), opacity: seg(frame, 28, 34) }}>PLAY NOW ON RUN</div>
                <Mono u={u} style={{ marginTop: 16 * u, fontSize: (portrait ? 24 : 28) * u, letterSpacing: 4 * u, color: C.gold }}>
                    {URL.slice(0, typed)}
                    <span style={{ opacity: caret ? 1 : 0 }}>_</span>
                </Mono>
                <div style={{ marginTop: 26 * u, fontFamily: MONO, fontWeight: 700, fontSize: 30 * u, letterSpacing: 5 * u, color: C.ink, background: C.amber, padding: `${10 * u}px ${22 * u}px`, borderRadius: 10 * u, opacity: seg(frame, 74, 82), scale: String(interpolate(land(frame, 74, 8), [0, 1], [1.4, 1])) }}>
                    VOTE IN THE OCTOBER JAM
                </div>
            </AbsoluteFill>
            <Hud scene={scene} total={total} start={start} label="END" />
        </AbsoluteFill>
    );
};

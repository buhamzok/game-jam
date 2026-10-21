/**
 * Tag Team Terror trailer. Beat sheet (30 fps, 180 BPM, a beat = 10 frames):
 *
 *   frame  scene            on screen                                   sound
 *   0      1 spark open     ember -> line -> red flood                  riser into the slam
 *   60     2 brand slam     lineup in skins, TAG TEAM TERROR            boom on the reveal
 *   160    3 combat         DODGE. / COUNTER. / BREAK. (a bar each)     impact per word
 *   280    4 tag team       TAG IN + 1 2 3 chips                        pops on the chips
 *   380    5 Full Moon      moon ring, red flash, FULL MOON             impact
 *   480    6 the Gravelord  THE GRAVELORD / RISES, boss bar to ENRAGED  dramatic hit
 *   600    7 realms         portal walk-in, Pumpkin Patch, Crypt, 1..4  tick per realm
 *   720    8 PVP arena      PVP ARENA, YOUR TEAM vs THEIRS              impact
 *   840    9 end card       title, PLAY NOW ON RUN, link types, VOTE    riser, boom, typing ticks
 *
 * Every cut is carried by a shape wipe (slash, flood or iris) centered on it.
 * Music: "The 9th Circle" (OpenGameArt, CC0) from its build at 8.892 s.
 * Sound effects: the CC0 kit from the sound-effects skill.
 */
import { Audio } from '@remotion/media';
import { TransitionSeries } from '@remotion/transitions';
import { AbsoluteFill, interpolate, Sequence, staticFile, useVideoConfig } from 'remotion';
import { Texture, Wipe } from './Frame';
import { BrandSlam, Combat, EndCard, FullMoon, Gravelord, Pvp, Realms, SparkOpen, TagTeam } from './Scenes';
import { C, MUSIC_START, SCENES, STARTS, TOTAL } from './theme';

export type TrailerProps = { orient: 'landscape' | 'portrait' };

const N = 9;
const WIPE = 12;

const Sfx = ({ at, src, volume = 0.6 }: { at: number; src: string; volume?: number }) => (
    <Sequence from={at} layout="none" name={src}>
        <Audio src={staticFile(`sfx/${src}.ogg`)} volume={volume} />
    </Sequence>
);

export const Trailer = ({ orient }: TrailerProps) => {
    const { fps } = useVideoConfig();
    const s = STARTS;
    return (
        <AbsoluteFill style={{ background: C.ink }}>
            <TransitionSeries name="Scenes">
                <TransitionSeries.Sequence name="Spark open" durationInFrames={SCENES.spark}>
                    <SparkOpen orient={orient} scene={1} total={N} start={s.spark} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence name="Brand slam" durationInFrames={SCENES.brand}>
                    <BrandSlam orient={orient} scene={2} total={N} start={s.brand} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="slash" color={C.amber} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="Combat" durationInFrames={SCENES.combat}>
                    <Combat orient={orient} scene={3} total={N} start={s.combat} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="flood" color={C.violet} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="Tag team" durationInFrames={SCENES.tag}>
                    <TagTeam orient={orient} scene={4} total={N} start={s.tag} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="iris" color={C.ink} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="Full Moon" durationInFrames={SCENES.moon}>
                    <FullMoon orient={orient} scene={5} total={N} start={s.moon} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="slash" color={C.blood} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="Gravelord" durationInFrames={SCENES.boss}>
                    <Gravelord orient={orient} scene={6} total={N} start={s.boss} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="flood" color={C.violet} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="Realms" durationInFrames={SCENES.realms}>
                    <Realms orient={orient} scene={7} total={N} start={s.realms} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="slash" color={C.blood} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="PVP arena" durationInFrames={SCENES.pvp}>
                    <Pvp orient={orient} scene={8} total={N} start={s.pvp} />
                </TransitionSeries.Sequence>
                <TransitionSeries.Overlay durationInFrames={WIPE}>
                    <Wipe kind="iris" color={C.ink} dur={WIPE} />
                </TransitionSeries.Overlay>
                <TransitionSeries.Sequence name="End card" durationInFrames={SCENES.end}>
                    <EndCard orient={orient} scene={9} total={N} start={s.end} />
                </TransitionSeries.Sequence>
            </TransitionSeries>

            <Texture />

            {/* music: from the build, fading in over a beat and out over the last bar */}
            <Audio
                name="Music"
                src={staticFile('music/the-9th-circle.mp3')}
                trimBefore={Math.round(MUSIC_START * fps)}
                volume={(f) => interpolate(f, [0, 10, TOTAL - 40, TOTAL - 2], [0, 0.85, 0.85, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
            />

            {/* sound effects on the grid */}
            <Sfx at={s.spark + 18} src="riser" volume={0.45} />
            <Sfx at={s.brand} src="boom" volume={0.7} />
            {[s.combat, s.tag, s.moon, s.boss, s.realms, s.pvp, s.end].map((c) => (
                <Sfx key={c} at={c - 5} src="whoosh" volume={0.5} />
            ))}
            <Sfx at={s.combat} src="impact" volume={0.55} />
            <Sfx at={s.combat + 40} src="impact" volume={0.55} />
            <Sfx at={s.combat + 80} src="impact" volume={0.6} />
            <Sfx at={s.tag + 12} src="pop" volume={0.5} />
            <Sfx at={s.tag + 22} src="pop" volume={0.5} />
            <Sfx at={s.tag + 32} src="pop" volume={0.5} />
            <Sfx at={s.moon + 10} src="impact" volume={0.6} />
            <Sfx at={s.boss + 4} src="dramatic-hit" volume={0.6} />
            {[0, 18, 60, 90].map((f) => (
                <Sfx key={f} at={s.realms + f} src="tick" volume={0.6} />
            ))}
            <Sfx at={s.pvp + 4} src="impact" volume={0.6} />
            <Sfx at={s.end - 30} src="riser" volume={0.35} />
            <Sfx at={s.end + 2} src="boom" volume={0.55} />
            {Array.from({ length: 10 }, (_, k) => (
                <Sfx key={`t${k}`} at={s.end + 36 + k * 4} src="click" volume={0.25} />
            ))}
            <Sfx at={s.end + 74} src="impact" volume={0.5} />
        </AbsoluteFill>
    );
};

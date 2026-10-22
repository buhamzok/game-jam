/**
 * Views for the player and the hunters: they read simulation state every
 * frame and drive a CharacterView (animation, facing, glow) plus ground
 * markers (attack telegraphs, parry ring). Nothing here changes the
 * simulation.
 */
import {
    AdditiveBlending,
    CircleGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    RingGeometry,
    SphereGeometry,
} from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { T, DEG, type MonsterKind, type BossType } from '../tuning.ts';
import type { SkinDef } from '../skins.ts';
import { C } from '../fxTypes.ts';
import type { Player } from '../player.ts';
import type { Hunter, HunterKind } from '../hunter.ts';
import { CharacterView, type AnimSpec } from './characterView.ts';
import { U } from './fx3d.ts';
import { BatSwarm, type SwarmShape } from './bats.ts';
import { WolfForm } from './wolfForm.ts';

/** Sim facing (radians, y down) to three.js rotation.y for a model that faces +Z. */
export function yawFromFacing(facing: number): number {
    return Math.PI / 2 - facing;
}

function turnToward(current: number, target: number, rate: number, dt: number): number {
    let d = target - current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return current + d * Math.min(1, rate * dt);
}

// ---- hero ------------------------------------------------------------------

/**
 * A clip whose hit frame is known: `impact` is the fraction of the clip where
 * the blow lands. HeroView sets its speed so that frame arrives exactly when
 * the simulation registers the hit (swing windup, counter zip, special
 * windup), counted from `start`.
 */
type HitAnim = AnimSpec & { impact?: number };

interface HeroAnims {
    idle: AnimSpec;
    run: AnimSpec;
    combo: HitAnim[];
    dodge: AnimSpec;
    dodgeBack: AnimSpec;
    guard: AnimSpec;
    counter: HitAnim;
    special: HitAnim;
    /** Swarm: the Vampire re-forms with this clip after the dive. */
    specialEnd?: AnimSpec;
    /** Transform pose (roar, spin, stomp). */
    trans?: AnimSpec;
    /** Swap-in turn. */
    entry: HitAnim;
    hurt: AnimSpec;
    dead: AnimSpec;
    /** Playback speed of a combo clip after its hit frame (default: keep the windup speed). */
    follow?: number;
}

/** KayKit skeleton stand-in. */
const PLACEHOLDER_ANIMS: HeroAnims = {
    idle: { clip: 'Idle_Combat', loop: true },
    run: { clip: 'Running_A', loop: true, speed: 1.25 },
    combo: [
        { clip: 'Unarmed_Melee_Attack_Punch_A', speed: 2.2, start: 0.12, fade: 0.05 },
        { clip: 'Unarmed_Melee_Attack_Punch_B', speed: 2.2, start: 0.12, fade: 0.05 },
        { clip: 'Unarmed_Melee_Attack_Kick', speed: 1.8, start: 0.1, fade: 0.05 },
    ],
    dodge: { clip: 'Dodge_Forward', speed: 2.4, start: 0.05, fade: 0.04 },
    dodgeBack: { clip: 'Dodge_Backward', speed: 2.4, start: 0.05, fade: 0.04 },
    guard: { clip: 'Block', speed: 2.0, fade: 0.04 },
    counter: { clip: 'Block_Attack', speed: 2.2, start: 0.2, fade: 0.03 },
    special: { clip: '1H_Melee_Attack_Jump_Chop', speed: 1.5, start: 0.15, fade: 0.05 },
    entry: { clip: 'Unarmed_Melee_Attack_Kick', speed: 2.0, start: 0.08, fade: 0.04 },
    hurt: { clip: 'Hit_A', speed: 1.6, fade: 0.05 },
    dead: { clip: 'Death_A', speed: 1.0 },
};

/** Generated werewolf; clip names are set by tools/merge-anims.mjs. Speeds are first guesses to tune on device. */
const WEREWOLF_ANIMS: HeroAnims = {
    idle: { clip: 'idle', loop: true },
    run: { clip: 'run', loop: true, speed: 1.1 },
    combo: [
        { clip: 'hook', speed: 2.0, start: 0.15, fade: 0.05 },
        { clip: 'uppercut', speed: 2.0, start: 0.15, fade: 0.05 },
        { clip: 'slam', speed: 1.8, start: 0.12, fade: 0.05 },
    ],
    dodge: { clip: 'roll', speed: 2.2, start: 0.05, fade: 0.04 },
    dodgeBack: { clip: 'roll', speed: 2.2, start: 0.05, fade: 0.04 },
    guard: { clip: 'guard', speed: 1.0, fade: 0.04 },
    counter: { clip: 'counter', speed: 2.0, start: 0.2, fade: 0.03 },
    special: { clip: 'pounce', speed: 1.4, start: 0.1, fade: 0.05 },
    trans: { clip: 'trans', speed: 2.4, start: 0.12, fade: 0.05 },
    entry: { clip: 'slam', speed: 2.2, start: 0.1, fade: 0.03 },
    hurt: { clip: 'hit', speed: 1.6, fade: 0.05 },
    dead: { clip: 'dead', speed: 1.0 },
};

/** Generated vampire; same clip names, so merge-anims output slots straight in. */
const VAMPIRE_ANIMS: HeroAnims = {
    idle: { clip: 'idle', loop: true },
    run: { clip: 'run', loop: true, speed: 1.15 },
    combo: [
        { clip: 'hook', speed: 2.2, start: 0.15, fade: 0.04 },
        { clip: 'uppercut', speed: 2.2, start: 0.15, fade: 0.04 },
        { clip: 'slam', speed: 2.0, start: 0.12, fade: 0.04 },
    ],
    dodge: { clip: 'roll', speed: 2.4, start: 0.05, fade: 0.04 },
    dodgeBack: { clip: 'roll', speed: 2.4, start: 0.05, fade: 0.04 },
    guard: { clip: 'guard', speed: 1.0, fade: 0.04 },
    counter: { clip: 'counter', speed: 2.1, start: 0.2, fade: 0.03 },
    special: { clip: 'cast', speed: 1.3, start: 0.1, fade: 0.05 },
    specialEnd: { clip: 'slam', speed: 1.9, start: 0.32, fade: 0.04 },
    trans: { clip: 'trans', speed: 2.0, start: 0.05, fade: 0.05 },
    entry: { clip: 'slam', speed: 2.2, start: 0.1, fade: 0.03 },
    hurt: { clip: 'hit', speed: 1.6, fade: 0.05 },
    dead: { clip: 'dead', speed: 1.0 },
};

/**
 * Generated Stitched. Hit frames were measured from the hands' motion in each
 * clip (fists furthest forward or lowest): Punch_Forward_with_Both_Fists lands
 * at 1.55 of 3.5 s, Heavy_Hammer_Swing at 1.5 of 1.87 s, Charged_Ground_Slam
 * at 1.8 of 3.03 s, Shield_Push_Left at 1.08 of 2.4 s. Each attack starts just
 * before its blow so a tap answers at once.
 * Monster_Walk moves the planted foot back at 0.94 m/s, so 3.4x matches his
 * 320 units/s (3.2 m/s) without sliding.
 */
const STITCHED_ANIMS: HeroAnims = {
    // the idle clip opens with a turn-away and an overhead flex; only its last stretch is a calm stance
    idle: { clip: 'idle', loop: true, range: [0.6, 0.98], speed: 0.8, fade: 0.22 },
    // after the blow lands, the swing follows through at this speed instead of the sped-up windup speed
    follow: 1.15,
    run: { clip: 'run', loop: true, speed: 3.4 },
    combo: [
        { clip: 'hook', start: 0.394, impact: 0.443, fade: 0.04 },
        { clip: 'uppercut', start: 0.722, impact: 0.802, fade: 0.04 },
        { clip: 'slam', start: 0.5, impact: 0.594, fade: 0.04 },
    ],
    dodge: { clip: 'roll', speed: 2.6, start: 0.07, fade: 0.04 },
    dodgeBack: { clip: 'roll', speed: 2.6, start: 0.07, fade: 0.04 },
    guard: { clip: 'guard', speed: 1.0, fade: 0.04 },
    counter: { clip: 'counter', start: 0.396, impact: 0.45, fade: 0.03 },
    // the smash shows the charge: from the crouch to the fists hitting the ground
    special: { clip: 'slam', start: 0.4, impact: 0.594, fade: 0.05 },
    trans: { clip: 'trans', speed: 1.6, fade: 0.05 },
    entry: { clip: 'hook', start: 0.394, impact: 0.443, fade: 0.03 },
    hurt: { clip: 'hit', speed: 1.5, fade: 0.05 },
    dead: { clip: 'dead', speed: 1.0 },
};

const MONSTER_ANIMS: Record<string, HeroAnims> = {
    werewolf: WEREWOLF_ANIMS,
    vampire: VAMPIRE_ANIMS,
    stitched: STITCHED_ANIMS,
};

/** A monster's idle clip, for the title-screen lineup. */
export function heroIdle(kind: MonsterKind): AnimSpec {
    return (MONSTER_ANIMS[kind] ?? WEREWOLF_ANIMS).idle;
}

/** Signature glow per monster when the special is ready. */
const READY_GLOW: Record<MonsterKind, number> = { werewolf: C.wolf, vampire: C.counter, stitched: C.rod };

export class HeroView {
    readonly char: CharacterView;
    private readonly anims: HeroAnims;
    private readonly parry: Mesh;
    private readonly parryMat: MeshBasicMaterial;
    /** Only the Vampire has one: her special and her transformation turn her into bats. */
    private readonly swarm: BatSwarm | null;
    private readonly swarmShape: SwarmShape = { spread: 0.6, height: 1.1, forward: 0 };
    private yaw = 0;
    private lastState = '';
    private lastSt = 0;
    private swingSerial = 0;
    /** 0..1, eases in while transformed: black wolf, red Stitched. */
    private transBlend = 0;
    /** Full Moon: glowing red eyes on the Werewolf's head bone. */
    private readonly wolfForm: WolfForm | null;
    /** Equipped skin's idle aura (black/0 for the classic look). */
    private skinGlow = 0x000000;
    private skinGlowAmount = 0;

    constructor(
        private readonly kind: MonsterKind,
        gltf: GLTF,
        scale: number,
    ) {
        this.char = new CharacterView(gltf, scale, kind === 'vampire' ? 0.7 : kind === 'stitched' ? 0.7 : 0.55);
        const generated = MONSTER_ANIMS[kind] ?? WEREWOLF_ANIMS;
        const chosen = this.char.hasClip('hook') ? generated : PLACEHOLDER_ANIMS;
        // older bundles may lack the dedicated guard and transform clips; fall back to what exists
        const guardAnim: AnimSpec = this.char.hasClip(chosen.guard.clip)
            ? chosen.guard
            : { clip: chosen.counter.clip, speed: 0.5, fade: 0.04 };
        const transAnim = chosen.trans && this.char.hasClip(chosen.trans.clip) ? chosen.trans : { ...chosen.counter, speed: 1.4 };
        const specialAnim = this.char.hasClip(chosen.special.clip) ? chosen.special : chosen.combo[2];
        // clips with a known hit frame are sped so the blow lands when the simulation hits
        const def = T.monsters[kind];
        this.anims = {
            ...chosen,
            guard: guardAnim,
            trans: transAnim,
            combo: chosen.combo.map((spec, i) => this.timed(spec, def.combo[i].windup)),
            counter: this.timed(chosen.counter, T.counter.zip),
            special: this.timed(specialAnim, def.special.duration),
            entry: this.timed(chosen.entry, T.tag.entryDuration * 0.45),
        };
        this.parryMat = new MeshBasicMaterial({ color: C.heavy, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
        this.parry = new Mesh(new RingGeometry(0.62, 0.75, 40), this.parryMat);
        this.parry.rotation.x = -Math.PI / 2;
        this.parry.position.y = 0.05;
        this.char.root.add(this.parry);
        this.swarm = kind === 'vampire' ? new BatSwarm() : null;
        if (this.swarm) this.char.root.add(this.swarm.group);
        this.wolfForm = kind === 'werewolf' ? new WolfForm(this.char.model) : null;
    }

    /** Speed a clip so its impact frame arrives `hitTime` seconds after it starts. */
    private timed(spec: HitAnim, hitTime: number): HitAnim {
        if (spec.impact === undefined || !this.char.hasClip(spec.clip)) return spec;
        const span = (spec.impact - (spec.start ?? 0)) * this.char.clipDuration(spec.clip);
        return { ...spec, speed: Math.max(0.5, span / hitTime) };
    }

    /**
     * @param animDt animation time this frame (0 during hitstop)
     * @param realDt real time, for smoothing
     */
    update(p: Player, animDt: number, realDt: number): void {
        const root = this.char.root;
        root.position.set(p.x * U, 0, p.y * U);
        const snap = p.state === 'attack' || p.state === 'counter' || p.state === 'special' || p.state === 'dodge';
        this.yaw = snap ? yawFromFacing(p.facing) : turnToward(this.yaw, yawFromFacing(p.facing), 18, realDt);
        root.rotation.y = this.yaw;

        // a new swing restarts the clip even when the state name repeats
        if (p.state === 'attack' && (this.lastState !== 'attack' || p.st < this.lastSt)) this.swingSerial++;
        this.lastState = p.state;
        this.lastSt = p.st;

        const c = this.char;
        const A = this.anims;
        const sp = T.monsters[this.kind].special;
        const landed = p.state === 'special' && p.st >= sp.duration;
        switch (p.state) {
            case 'idle': c.play(A.idle); break;
            case 'move': c.play(A.run); break;
            case 'attack':
                c.play(A.combo[p.combo], `swing-${this.swingSerial}`);
                if (A.follow && p.st >= T.monsters[this.kind].combo[p.combo].windup) c.setSpeed(A.follow);
                break;
            case 'dodge': c.play(p.dodgeBackward ? A.dodgeBack : A.dodge); break;
            case 'guard': c.play(A.guard); break;
            case 'counter': c.play(A.counter); break;
            case 'special':
                if (landed && A.specialEnd) c.play(A.specialEnd, 'special-end');
                else c.play(A.special);
                break;
            case 'transform': c.play(A.trans!); break;
            case 'entry': c.play(A.entry); break;
            case 'hurt': c.play(A.hurt); break;
            case 'dead': c.play(A.dead); break;
        }
        c.update(animDt);

        // leap arc on the Werewolf's pounce
        const leap = p.state === 'special' && sp.style === 'pounce' ? Math.sin(Math.min(1, p.st / sp.duration) * Math.PI) * 1.2 : 0;
        c.body.position.y = leap;

        // transformation look: black and bigger wolf, red Stitched (the Vampire becomes the swarm)
        const transOn = p.transT > 0 || (p.state === 'transform' && p.st > T.trans.startup * 0.4);
        this.transBlend += ((transOn ? 1 : 0) - this.transBlend) * Math.min(1, realDt * 5);
        this.applyForm(this.transBlend);

        // bats: the swarm flight of the special, and the whole Night Swarm
        const swarmTravel = p.state === 'special' && sp.style === 'swarm' && !landed;
        const swarmForm = this.kind === 'vampire' && p.transT > 0 && !(p.state === 'special' && landed);
        if (this.swarm) {
            const sh = this.swarmShape;
            if (swarmTravel) {
                const t = p.st / sp.duration;
                // fly in a loose cloud, then gather and dive onto the landing point
                sh.spread = t < 0.6 ? 0.7 : 0.7 - (t - 0.6) * 1.5;
                sh.height = t < 0.6 ? 1.3 : 1.3 - (t - 0.6) * 2.6;
                sh.forward = 0;
            } else if (p.state === 'attack') {
                sh.spread = 0.35;
                sh.height = 0.9;
                sh.forward = 0.7;
            } else if (p.state === 'guard') {
                sh.spread = 0.28;
                sh.height = 0.9;
                sh.forward = 0;
            } else if (p.state === 'dodge') {
                sh.spread = 0.3;
                sh.height = 0.8;
                sh.forward = 0;
            } else {
                sh.spread = 0.85;
                sh.height = 1.1;
                sh.forward = 0;
            }
            this.swarm.update(swarmTravel || swarmForm, sh, realDt);
        }
        c.setModelVisible(!(swarmTravel || swarmForm));

        // glow: white hit flash, transformation aura, per-monster cue when the special is ready
        const pulse = Math.sin(performance.now() / 120);
        if (p.flashT > 0) c.setGlow(0xffffff, 0.9);
        else if (this.transBlend > 0.05 && this.kind === 'stitched') c.setGlow(C.overcharge, (0.14 + 0.08 * pulse) * this.transBlend);
        // moonlit sheen so the black wolf still reads against the dark ground
        else if (this.transBlend > 0.05 && this.kind === 'werewolf') c.setGlow(0x312e81, 0.12 * this.transBlend);
        else if (p.transReady && p.alive) c.setGlow(READY_GLOW[this.kind], 0.25 + 0.2 * pulse);
        else c.setGlow(this.skinGlow, this.skinGlowAmount * (0.85 + 0.15 * pulse));
        c.setOpacity(p.hurtFlicker > 0 && Math.floor(p.hurtFlicker * 20) % 2 === 0 ? 0.35 : p.state === 'dodge' ? 0.7 : 1);

        this.parryMat.opacity = p.state === 'guard' ? (p.parryOpen ? 0.95 : 0.25) : 0;
    }

    /** Cosmetic skin (undefined = classic look). */
    applySkin(skin: SkinDef | undefined): void {
        this.char.setSkin(skin?.tint ?? 0xffffff, skin?.amount ?? 0);
        this.skinGlow = skin?.glow ?? 0x000000;
        this.skinGlowAmount = skin?.glowAmount ?? 0;
    }

    /** Transformation tint and size at blend 0..1. */
    private applyForm(blend: number): void {
        const c = this.char;
        if (this.kind === 'werewolf') {
            c.setSize(1 + (T.trans.werewolf.scale - 1) * blend);
            c.setTint(0x000000, blend);
            this.wolfForm?.set(blend);
        } else if (this.kind === 'stitched') {
            c.setTint(0xff2020, 0.45 * blend);
        }
    }

    /** Keep the hidden view placed at the body with a settled yaw, so a swap does not snap. */
    idlePose(p: Player, realDt: number): void {
        const root = this.char.root;
        root.position.set(p.x * U, 0, p.y * U);
        this.yaw = turnToward(this.yaw, yawFromFacing(p.facing), 18, realDt);
        root.rotation.y = this.yaw;
        // a benched monster is never transformed
        if (this.transBlend !== 0) {
            this.transBlend = 0;
            this.applyForm(0);
            this.char.setModelVisible(true);
        }
        this.char.update(0);
    }

    dispose(): void {
        this.parry.geometry.dispose();
        this.parryMat.dispose();
        this.swarm?.dispose();
        this.wolfForm?.dispose();
        this.char.dispose();
    }
}

// ---- hunters ---------------------------------------------------------------

interface HunterAnims {
    idle: AnimSpec;
    run: AnimSpec;
    /** Ranged kinds: walking backwards to keep their distance. */
    back?: AnimSpec;
    /** Ranged kinds: looping aim pose during the windup; the attack clip then plays on release. */
    aim?: AnimSpec;
    jab: AnimSpec;
    heavy: AnimSpec;
    /** Fraction of each melee attack clip where the weapon connects. */
    jabImpact: number;
    heavyImpact: number;
    /** Boss Grave Leap: one clip timed so the landing frame meets the end of the windup. */
    leap?: AnimSpec;
    leapImpact?: number;
    /** Hunt Captain: the whirlwind (a 360-degree heavy) loops this clip; the charge plays `charge` while it dashes. */
    spin?: AnimSpec;
    charge?: AnimSpec;
}

/** The Hunt Captain: the KayKit barbarian at boss size. */
const CAPTAIN_ANIMS: HunterAnims = {
    idle: { clip: '2H_Melee_Idle', loop: true },
    run: { clip: 'Running_A', loop: true, speed: 1.15 },
    jab: { clip: '2H_Melee_Attack_Slice', fade: 0.08 },
    heavy: { clip: '2H_Melee_Attack_Chop', fade: 0.08 },
    jabImpact: 0.45,
    heavyImpact: 0.48,
    spin: { clip: '2H_Melee_Attack_Spinning', loop: true, speed: 1.4, fade: 0.08 },
    charge: { clip: 'Running_B', loop: true, speed: 2.2, fade: 0.05 },
};

/** The Bone Colossus: the KayKit skeleton warrior at boss size. Bone Rain casts with the summon clip. */
const COLOSSUS_ANIMS: HunterAnims = {
    idle: { clip: 'Idle_Combat', loop: true, speed: 0.8 },
    run: { clip: 'Walking_B', loop: true, speed: 1.3 },
    jab: { clip: 'Unarmed_Melee_Attack_Punch_B', fade: 0.08 },
    heavy: { clip: '1H_Melee_Attack_Jump_Chop', fade: 0.08 },
    jabImpact: 0.4,
    heavyImpact: 0.55,
    aim: { clip: 'Spellcast_Summon', loop: true, speed: 0.9, fade: 0.1 },
};

type Common = { spawn: AnimSpec; flinch: AnimSpec; broken: AnimSpec; dead: AnimSpec; roar: AnimSpec; guard: AnimSpec };

/** Shared moments for the two KayKit bosses. */
const BOSS_COMMON: Record<'captain' | 'colossus', Common> = {
    captain: {
        guard: { clip: 'Block_Hit', speed: 1.1, fade: 0.06 },
        spawn: { clip: 'Cheer', loop: false, speed: 0.9 },
        roar: { clip: 'Cheer', loop: false, speed: 1.2, fade: 0.08 },
        flinch: { clip: 'Hit_A', speed: 1.2, fade: 0.06 },
        broken: { clip: 'Hit_A', speed: 0.4, fade: 0.05 },
        dead: { clip: 'Death_A', speed: 0.8, fade: 0.08 },
    },
    colossus: {
        guard: { clip: 'Block_Hit', speed: 1.0, fade: 0.06 },
        spawn: { clip: 'Skeletons_Awaken_Standing', loop: false, speed: 1.2 },
        roar: { clip: 'Skeletons_Awaken_Standing', loop: false, speed: 1.4, fade: 0.08 },
        flinch: { clip: 'Hit_A', speed: 1.0, fade: 0.06 },
        broken: { clip: 'Hit_A', speed: 0.35, fade: 0.05 },
        dead: { clip: 'Death_C_Skeletons', speed: 0.9, fade: 0.08 },
    },
};

/** The Gravelord: same 24-bone Meshy rig as the monsters, so clip names slot straight in. */
const BOSS_ANIMS: HunterAnims = {
    idle: { clip: 'idle', loop: true },
    run: { clip: 'run', loop: true, speed: 1.6 },
    jab: { clip: 'hook', fade: 0.08 },
    heavy: { clip: 'slam', fade: 0.08 },
    // measured like the Stitched: Punch_Forward_with_Both_Fists impact 0.443, Charged_Ground_Slam impact 0.594
    jabImpact: 0.443,
    heavyImpact: 0.594,
    /** Quake windup: the cast pose loops (the circle telegraph tracks the player); the release replays the heavy slam. */
    aim: { clip: 'cast', loop: true, fade: 0.1 },
    // Jump_and_Slam: crouch, take off at 0.16, land at 0.43 (measured from the hips)
    leap: { clip: 'pounce', fade: 0.08 },
    leapImpact: 0.43,
};

/** PVP rivals: a monster model on the shared Meshy rig, played like a hunter. Run speed and idle come per monster. */
const RIVAL_ANIMS: HunterAnims = {
    idle: { clip: 'idle', loop: true },
    run: { clip: 'run', loop: true },
    jab: { clip: 'hook', fade: 0.06 },
    heavy: { clip: 'slam', fade: 0.06 },
    jabImpact: 0.443,
    heavyImpact: 0.594,
    // ranged specials (Bat Storm, Thunder Quake): a braced cast while the circle tracks, then the slam
    aim: { clip: 'guard', loop: true, speed: 1.4, fade: 0.1 },
    leap: { clip: 'pounce', fade: 0.08 },
    leapImpact: 0.43,
};

const HUNTER_ANIMS: Record<HunterKind, HunterAnims> = {
    boss: BOSS_ANIMS,
    rival: RIVAL_ANIMS,
    knight: {
        idle: { clip: 'Idle', loop: true },
        run: { clip: 'Running_A', loop: true },
        jab: { clip: '1H_Melee_Attack_Stab', fade: 0.08 },
        heavy: { clip: '1H_Melee_Attack_Chop', fade: 0.08 },
        jabImpact: 0.42,
        heavyImpact: 0.45,
    },
    barbarian: {
        idle: { clip: '2H_Melee_Idle', loop: true },
        run: { clip: 'Running_A', loop: true },
        jab: { clip: '2H_Melee_Attack_Stab', fade: 0.08 },
        heavy: { clip: '2H_Melee_Attack_Chop', fade: 0.08 },
        jabImpact: 0.42,
        heavyImpact: 0.48,
    },
    rogue: {
        idle: { clip: 'Idle', loop: true },
        run: { clip: 'Running_A', loop: true },
        back: { clip: 'Walking_Backwards', loop: true, speed: 1.4 },
        aim: { clip: '2H_Ranged_Aiming', loop: true, fade: 0.1 },
        jab: { clip: '2H_Ranged_Shoot', speed: 1.5, fade: 0.04 },
        heavy: { clip: '2H_Ranged_Shoot', speed: 1.5, fade: 0.04 },
        jabImpact: 0,
        heavyImpact: 0,
    },
    mage: {
        idle: { clip: 'Idle', loop: true },
        run: { clip: 'Running_A', loop: true },
        back: { clip: 'Walking_Backwards', loop: true, speed: 1.2 },
        aim: { clip: 'Spellcasting', loop: true, fade: 0.1 },
        jab: { clip: 'Spellcast_Shoot', speed: 1.3, fade: 0.04 },
        heavy: { clip: 'Spellcast_Shoot', speed: 1.3, fade: 0.04 },
        jabImpact: 0,
        heavyImpact: 0,
    },
};

/** Guard pose: KayKit's Block_Hit, held at its raised-shield frame; the boss loops its own guard clip. */
const GUARD_HOLD = 0.32;
const GUARD_COLOR = 0x60a5fa;

const COMMON = {
    guard: { clip: 'Block_Hit', speed: 1.3, fade: 0.06 } as AnimSpec,
    spawn: { clip: 'Cheer', loop: false, speed: 1.4 } as AnimSpec,
    flinch: { clip: 'Hit_A', speed: 1.6, fade: 0.05 } as AnimSpec,
    broken: { clip: 'Hit_B', speed: 0.6, fade: 0.05 } as AnimSpec,
    dead: { clip: 'Death_A', speed: 1.1, fade: 0.05 } as AnimSpec,
};

/** Per-kind overrides for the shared hunter moments (the boss has its own clips). */
const COMMON_OVERRIDE: Partial<Record<HunterKind, Partial<{ spawn: AnimSpec; flinch: AnimSpec; broken: AnimSpec; dead: AnimSpec; roar: AnimSpec; guard: AnimSpec }>>> = {
    rival: {
        spawn: { clip: 'trans', loop: false, speed: 1.4 / T.hunter.spawnTime, fade: 0.05 },
        flinch: { clip: 'hit', speed: 1.4, fade: 0.06 },
        broken: { clip: 'hit', speed: 0.5, fade: 0.05 },
        dead: { clip: 'dead', speed: 1.0, fade: 0.08 },
        guard: { clip: 'guard', loop: true, fade: 0.08 },
    },
    boss: {
        guard: { clip: 'guard', loop: true, fade: 0.1 },
        // the entrance roars the transform clip; the death is its Knock_Down
        spawn: { clip: 'trans', loop: false, speed: 0.4, fade: 0.05 },
        // phase 2 roar: the same clip, played over the roar time
        roar: { clip: 'trans', loop: false, speed: 1.4 / T.boss.roar.time, fade: 0.08 },
        flinch: { clip: 'hit', speed: 1.1, fade: 0.07 },
        broken: { clip: 'hit', speed: 0.5, fade: 0.05 },
        dead: { clip: 'dead', speed: 0.8, fade: 0.08 },
    },
};

const commonFor = (kind: HunterKind) => ({ ...COMMON, roar: COMMON.spawn, ...(COMMON_OVERRIDE[kind] ?? {}) });

/** Unit pie slice in the XZ plane, pointing along +X, `half` radians each side. */
function sliceGeometry(half: number): CircleGeometry {
    const g = new CircleGeometry(1, 28, -half, half * 2);
    g.rotateX(-Math.PI / 2);
    return g;
}

/** Unit strip in the XZ plane from x = 0 to 1, 1 wide in z (scaled to the aim line). */
function stripGeometry(): PlaneGeometry {
    const g = new PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    g.translate(0.5, 0, 0);
    return g;
}

function flatCircle(): CircleGeometry {
    const g = new CircleGeometry(1, 36);
    g.rotateX(-Math.PI / 2);
    return g;
}

function flatRing(): RingGeometry {
    const g = new RingGeometry(0.92, 1, 48);
    g.rotateX(-Math.PI / 2);
    return g;
}

const teleMaterial = () => new MeshBasicMaterial({ transparent: true, depthWrite: false, side: DoubleSide });

export class HunterView {
    readonly char: CharacterView;
    private readonly anims: HunterAnims;
    private readonly common: { spawn: AnimSpec; flinch: AnimSpec; broken: AnimSpec; dead: AnimSpec; roar: AnimSpec; guard: AnimSpec };
    /** Raised-guard shield: a flat glowing arc in front of the hunter (world space, like the telegraphs). */
    private readonly shield: Mesh;
    private readonly shieldMat = new MeshBasicMaterial({ color: GUARD_COLOR, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    /** World-space telegraphs (not rotated with the body): melee cone, aim line, blast circle. */
    private readonly teleRoot = new Group();
    private readonly cone = new Group();
    private readonly coneFull: Mesh;
    private readonly coneFill: Mesh;
    private readonly line = new Group();
    private readonly lineFull: Mesh;
    private readonly lineFill: Mesh;
    private readonly circle = new Group();
    private readonly circleEdge: Mesh;
    private readonly circleFill: Mesh;
    private readonly fullMat = teleMaterial();
    private readonly fillMat = teleMaterial();
    private readonly stars = new Group();
    private teleHalf = -1;
    private yaw = 0;
    private attackKey = '';
    private serial = 0;
    private lastState = '';

    /** PVP rivals: a red ring under the feet marks the enemy team. */
    private readonly enemyRing: Mesh | null = null;

    constructor(gltf: GLTF, scale: number, readonly kind: HunterKind, rival?: { monster: MonsterKind; skin?: SkinDef; runScale: number }, bossType: BossType = 'gravelord') {
        this.char = new CharacterView(gltf, scale, kind === 'boss' ? 0.35 : rival ? 0.65 : 0.5);
        const kaykitBoss = kind === 'boss' && bossType !== 'gravelord' ? bossType : null;
        this.anims = kaykitBoss === 'captain' ? CAPTAIN_ANIMS : kaykitBoss === 'colossus' ? COLOSSUS_ANIMS : HUNTER_ANIMS[kind];
        if (rival) {
            const hero = MONSTER_ANIMS[rival.monster] ?? WEREWOLF_ANIMS;
            this.anims = { ...RIVAL_ANIMS, idle: hero.idle, run: { ...hero.run, speed: (hero.run.speed ?? 1) * rival.runScale } };
            if (rival.skin) this.char.setSkin(rival.skin.tint, rival.skin.amount);
            const ringMat = new MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false });
            this.enemyRing = new Mesh(new RingGeometry(0.62, 0.74, 40), ringMat);
            this.enemyRing.rotation.x = -Math.PI / 2;
            this.enemyRing.position.y = 0.04;
            this.char.root.add(this.enemyRing);
        }
        this.common = kaykitBoss ? BOSS_COMMON[kaykitBoss] : commonFor(kind);
        // the Captain wears crimson so he never reads as a big barbarian; the Colossus stays bone-white
        if (kaykitBoss === 'captain') this.char.setSkin(0xb91c1c, 0.72);
        this.coneFull = new Mesh(sliceGeometry(0.5), this.fullMat);
        this.coneFill = new Mesh(sliceGeometry(0.5), this.fillMat);
        this.coneFill.position.y = 0.005;
        this.cone.add(this.coneFull, this.coneFill);
        this.lineFull = new Mesh(stripGeometry(), this.fullMat);
        this.lineFill = new Mesh(stripGeometry(), this.fillMat);
        this.lineFill.position.y = 0.005;
        this.line.add(this.lineFull, this.lineFill);
        this.circleEdge = new Mesh(flatRing(), this.fillMat);
        this.circleFill = new Mesh(flatCircle(), this.fullMat);
        this.circleEdge.position.y = 0.005;
        this.circle.add(this.circleFill, this.circleEdge);
        const arc = new RingGeometry(0.78, 1, 32, 1, -Math.PI * 0.5, Math.PI);
        arc.rotateX(-Math.PI / 2);
        this.shield = new Mesh(arc, this.shieldMat);
        this.teleRoot.add(this.cone, this.line, this.circle, this.shield);
        this.cone.visible = this.line.visible = this.circle.visible = false;

        const starMat = new MeshBasicMaterial({ color: C.counter });
        for (let i = 0; i < 3; i++) this.stars.add(new Mesh(new SphereGeometry(0.07, 8, 6), starMat));
        this.stars.visible = false;
        this.char.body.add(this.stars);
    }

    /** Telegraph group lives in world space (not rotated with the body); add it to the scene. */
    get telegraph(): Group {
        return this.teleRoot;
    }

    update(h: Hunter, animDt: number, realDt: number): void {
        const root = this.char.root;
        root.position.set(h.x * U, 0, h.y * U);
        this.yaw = turnToward(this.yaw, yawFromFacing(h.facing), h.state === 'windup' ? 30 : 14, realDt);
        if (this.lastState === '') this.yaw = yawFromFacing(h.facing);
        root.rotation.y = this.yaw;

        if (h.state !== this.lastState) this.serial++;
        this.lastState = h.state;
        const c = this.char;
        const a = this.anims;

        switch (h.state) {
            case 'spawn':
                c.play(this.common.spawn);
                break;
            case 'chase':
                c.play(h.retreating && a.back ? a.back : a.run);
                break;
            case 'windup':
            case 'active':
            case 'recover': {
                if (!h.atk) break;
                const leap = h.atk.style === 'leap' && a.leap;
                const spec = leap ? a.leap! : h.atk.heavy ? a.heavy : a.jab;
                // Captain: the charge stands braced, then runs; the whirlwind spins from windup to recovery
                if (h.atk.style === 'charge' && a.charge) {
                    c.play(h.state === 'active' ? a.charge : h.state === 'windup' ? a.idle : a.idle, `charge-${h.state}-${this.serial}`);
                    break;
                }
                if (h.atk.arcDeg >= 360 && a.spin) {
                    c.play(a.spin, `spin-${this.serial}`);
                    break;
                }
                if (h.state === 'windup' && this.attackKey !== `atk-${this.serial}`) {
                    this.attackKey = `atk-${this.serial}`;
                    if (leap) {
                        const speed = ((a.leapImpact ?? 0.5) * c.clipDuration(spec.clip)) / h.atk.windup;
                        c.play({ ...spec, speed }, this.attackKey);
                    } else if (a.aim && (h.atk.style === 'bolt' || h.atk.style === 'blast' || !a.jabImpact)) {
                        c.play(a.aim, this.attackKey);
                    } else {
                        // one clip per melee attack: slow it so the weapon connects exactly when the windup ends
                        const impact = h.atk.heavy ? a.heavyImpact : a.jabImpact;
                        const speed = (impact * c.clipDuration(spec.clip)) / h.atk.windup;
                        c.play({ ...spec, speed }, this.attackKey);
                    }
                } else if (h.state !== 'windup') {
                    if (leap) c.setSpeed(1);
                    else if (a.aim && (h.atk.style === 'bolt' || h.atk.style === 'blast' || !a.jabImpact)) c.play(spec, `${this.attackKey}-release`);
                    else c.setSpeed(1.2);
                }
                break;
            }
            case 'flinch':
                c.play(this.common.flinch, `flinch-${this.serial}`);
                break;
            case 'broken':
                c.play(this.common.broken);
                break;
            case 'roar':
                c.play(this.common.roar, `roar-${this.serial}`);
                break;
            case 'guard': {
                // each blocked hit restarts the block reaction (a new key), then the pose holds
                c.play(this.common.guard, `guard-${this.serial}-${h.blockSerial}`);
                if (!this.common.guard.loop && c.clipFraction() >= GUARD_HOLD) c.setSpeed(0);
                break;
            }
            case 'dead':
                c.play(this.common.dead);
                break;
        }
        c.update(animDt);

        // spawn: rise out of the ground; death: sink after falling
        let lift = 0;
        let alpha = 1;
        if (h.state === 'spawn') {
            const t = Math.min(1, h.st / T.hunter.spawnTime);
            lift = (t - 1) * 1.6;
            alpha = t;
        } else if (h.state === 'dead') {
            const sink = Math.max(0, h.st - (T.hunter.deathTime - 0.6)) / 0.6;
            lift = -sink * 0.8;
            alpha = 1 - sink;
        }
        // Grave Leap: a high arc on top of the clip's own jump
        lift += h.air * 2.2;
        c.body.position.y = lift;
        c.setOpacity(alpha);

        // glow: hit flash, pulsing purple for an armored heavy windup, a red smoulder once enraged
        if (h.flashT > 0) c.setGlow(0xffffff, 0.9);
        else if (h.state === 'windup' && h.atk?.heavy) c.setGlow(C.heavy, 0.3 + 0.25 * Math.sin(h.st * 30));
        else if (h.state === 'roar') c.setGlow(C.blood, 0.5 + 0.3 * Math.sin(h.st * 24));
        else if (h.state === 'guard') c.setGlow(GUARD_COLOR, 0.28 + 0.1 * Math.sin(h.st * 18));
        else if (h.phase === 2 && h.alive) c.setGlow(0xdc2626, 0.16 + 0.08 * Math.sin(performance.now() / 160));
        else c.setGlow(0x000000, 0);

        this.updateTelegraph(h);

        // raised guard: a blue arc in front, fading in fast
        const on = h.state === 'guard';
        this.shieldMat.opacity += ((on ? 0.75 : 0) - this.shieldMat.opacity) * Math.min(1, realDt * 14);
        this.shield.visible = this.shieldMat.opacity > 0.02;
        if (this.shield.visible) {
            this.shield.position.set(h.x * U, 0.06, h.y * U);
            this.shield.rotation.y = -h.facing;
            this.shield.scale.setScalar((h.r + 34) * U);
        }

        this.stars.visible = h.state === 'broken';
        if (this.stars.visible) {
            this.stars.children.forEach((s, i) => {
                const ang = h.st * 6 + (i * Math.PI * 2) / 3;
                s.position.set(Math.cos(ang) * 0.35, 2.0 + Math.sin(ang * 2) * 0.06, Math.sin(ang) * 0.35);
            });
        }
    }

    private updateTelegraph(h: Hunter): void {
        const atk = h.state === 'windup' ? h.atk : null;
        const style = atk?.style ?? 'melee';
        this.cone.visible = !!atk && style === 'melee';
        this.line.visible = !!atk && (style === 'bolt' || style === 'charge');
        this.circle.visible = !!atk && (style === 'blast' || style === 'leap');
        if (!atk) return;
        const color = style === 'bolt' ? C.bolt : atk.heavy ? C.heavy : C.jab;
        // the charge's lane: as long as the dash, and as wide as the Captain
        const progress = Math.min(1, h.st / atk.windup);
        this.fullMat.color.setHex(color);
        this.fillMat.color.setHex(color);

        if (style === 'melee') {
            const half = (atk.arcDeg / 2) * DEG;
            if (half !== this.teleHalf) {
                this.teleHalf = half;
                this.coneFull.geometry.dispose();
                this.coneFill.geometry.dispose();
                this.coneFull.geometry = sliceGeometry(half);
                this.coneFill.geometry = sliceGeometry(half);
            }
            const reach = (atk.range + h.r * 0.5) * U;
            this.cone.position.set(h.x * U, 0.04, h.y * U);
            this.cone.rotation.y = -h.facing;
            this.coneFull.scale.setScalar(reach);
            this.coneFill.scale.setScalar(Math.max(0.001, reach * progress));
            this.fullMat.opacity = 0.18;
            this.fillMat.opacity = 0.42;
        } else if (style === 'bolt' || style === 'charge') {
            // the line goes solid once the aim locks: that is the moment to move
            const locked = h.st >= atk.windup * T.hunter.trackFraction;
            const len = (style === 'charge' ? (atk.speed ?? 1400) * atk.active + h.r : atk.range) * U;
            if (style === 'charge') {
                this.line.position.set(h.x * U, 0.05, h.y * U);
                this.line.rotation.y = -h.facing;
                this.lineFull.scale.set(len, 1, h.r * 2 * U);
                this.lineFill.scale.set(Math.max(0.001, len * progress), 1, h.r * (locked ? 1.6 : 0.8) * U);
                this.fullMat.opacity = locked ? 0.28 : 0.12;
                this.fillMat.opacity = locked ? 0.6 : 0.35;
                return;
            }
            this.line.position.set(h.x * U, 0.05, h.y * U);
            this.line.rotation.y = -h.facing;
            this.lineFull.scale.set(len, 1, 0.16);
            this.lineFill.scale.set(Math.max(0.001, len * progress), 1, locked ? 0.1 : 0.05);
            this.fullMat.opacity = locked ? 0.3 : 0.12;
            this.fillMat.opacity = locked ? 0.85 : 0.45;
        } else {
            const r = (atk.radius ?? 120) * U;
            this.circle.position.set(h.aimX * U, 0.045, h.aimY * U);
            this.circleEdge.scale.setScalar(r);
            this.circleFill.scale.setScalar(Math.max(0.001, r * progress));
            this.fullMat.opacity = 0.35;
            this.fillMat.opacity = 0.8;
        }
    }

    dispose(): void {
        this.teleRoot.removeFromParent();
        for (const m of [this.coneFull, this.coneFill, this.lineFull, this.lineFill, this.circleEdge, this.circleFill, this.shield]) m.geometry.dispose();
        this.shieldMat.dispose();
        if (this.enemyRing) {
            this.enemyRing.geometry.dispose();
            (this.enemyRing.material as MeshBasicMaterial).dispose();
        }
        this.fullMat.dispose();
        this.fillMat.dispose();
        this.stars.children.forEach((s) => (s as Mesh).geometry.dispose());
        ((this.stars.children[0] as Mesh)?.material as MeshBasicMaterial)?.dispose();
        this.char.dispose();
    }
}

/**
 * Every combat number in one place, so feel can be tuned from playtest notes
 * without hunting through logic. Distances are design units (screen is 720
 * wide), times are seconds, angles are degrees.
 */

export interface SwingDef {
    dmg: number;
    poise: number;
    knock: number;
    windup: number;
    active: number;
    recover: number;
    range: number;
    arcDeg: number;
    lunge: number;
    hitstop: number;
    shake: number;
}

/**
 * A monster's special (attack while the energy bar is full):
 *   - pounce: leap to the nearest hunter and land with an area hit (Werewolf);
 *   - swarm: dissolve into bats, fly through hunters biting each once, then slam down (Vampire);
 *   - smash: plant and smash the ground in front, then an aftershock ring (Stitched).
 * For a smash, `duration` is the windup before impact and `maxRange` only aims.
 */
export interface PounceDef {
    style: 'pounce' | 'swarm' | 'smash';
    duration: number;
    maxRange: number;
    radius: number;
    dmg: number;
    poise: number;
    knock: number;
    hitstop: number;
    recover: number;
    /** swarm: damage of each bite on the way. */
    pathDmg?: number;
    /** smash: impact center sits this far in front of the monster. */
    offset?: number;
    /** smash: aftershock ring after the impact. */
    shockDelay?: number;
    shockRadius?: number;
    shockDmg?: number;
}

export interface EnemyAttackDef {
    /**
     * melee: cone in front; bolt: a projectile along a red line; blast: a purple
     * circle on the ground; leap: the attacker jumps onto a red circle and lands on it.
     */
    style?: 'melee' | 'bolt' | 'blast' | 'leap';
    heavy: boolean;
    windup: number;
    active: number;
    recover: number;
    range: number;
    arcDeg: number;
    dmg: number;
    lunge: number;
    /** bolt: projectile speed, units per second. */
    speed?: number;
    /** blast: circle radius. */
    radius?: number;
}

/** Per-kind hunter body; ranged kinds keep their distance inside [keepMin, keepMax]. */
export interface HunterKindDef {
    hp: number;
    poise: number;
    speed: number;
    radius?: number;
    ranged?: { attack: EnemyAttackDef; keepMin: number; keepMax: number };
    /** Boss body: two melee attacks (light sweep, armored heavy smash) plus a ground quake. */
    boss?: boolean;
}

/** One member of the tag team, driving the shared player body when active. */
export interface MonsterDef {
    /** Human name shown in the HUD. */
    name: string;
    radius: number;
    hp: number;
    speed: number;
    /** Three-hit claw combo. The last hit is slower and hits harder. */
    combo: SwingDef[];
    /** Special attack on its own button (E / SPECIAL), with a cooldown. The energy bar is only for transforming. */
    special: PounceDef;
    /** Seconds between specials. */
    specialCooldown: number;
    specialText: string;
    /** Short special name for the attack button when the bar is full. */
    specialButton: string;
    /** Label of the energy bar. */
    energyLabel: string;
    /** Off-field: seconds between automatic strike pulses while benched. */
    offFieldInterval: number;
    /** Off-field strike: per-pulse damage done to a random hunter. */
    offFieldDmg: number;
}

export type MonsterKind = 'werewolf' | 'vampire' | 'stitched';
export type HunterKind = 'knight' | 'barbarian' | 'rogue' | 'mage' | 'boss';

export const T = {
    /** Shared body movement speed scale; each monster multiplies in its own speed. */
    bodySpeed: 430,

    /** The tag team, in swap order (key 1, 2, ...). */
    monsters: {
        werewolf: {
            name: 'Werewolf',
            radius: 34,
            hp: 100,
            speed: 430,
            combo: [
                { dmg: 10, poise: 12, knock: 150, windup: 0.05, active: 0.07, recover: 0.16, range: 120, arcDeg: 130, lunge: 70, hitstop: 0.05, shake: 0.12 },
                { dmg: 10, poise: 12, knock: 150, windup: 0.05, active: 0.07, recover: 0.16, range: 120, arcDeg: 130, lunge: 70, hitstop: 0.05, shake: 0.12 },
                { dmg: 20, poise: 26, knock: 380, windup: 0.09, active: 0.08, recover: 0.26, range: 138, arcDeg: 170, lunge: 115, hitstop: 0.09, shake: 0.3 },
            ] as SwingDef[],
            special: { style: 'pounce', duration: 0.38, maxRange: 480, radius: 175, dmg: 45, poise: 60, knock: 440, hitstop: 0.12, recover: 0.15 } as PounceDef,
            specialCooldown: 9,
            specialText: 'MOON POUNCE',
            specialButton: 'POUNCE',
            energyLabel: 'MOON',
            offFieldInterval: 999,
            offFieldDmg: 0,
        },
        vampire: {
            name: 'Vampire',
            radius: 30,
            hp: 85,
            speed: 470,
            combo: [
                { dmg: 8, poise: 9, knock: 120, windup: 0.04, active: 0.06, recover: 0.13, range: 122, arcDeg: 120, lunge: 85, hitstop: 0.04, shake: 0.1 },
                { dmg: 8, poise: 9, knock: 120, windup: 0.04, active: 0.06, recover: 0.13, range: 122, arcDeg: 120, lunge: 85, hitstop: 0.04, shake: 0.1 },
                { dmg: 16, poise: 22, knock: 320, windup: 0.08, active: 0.07, recover: 0.22, range: 140, arcDeg: 150, lunge: 130, hitstop: 0.08, shake: 0.26 },
            ] as SwingDef[],
            special: { style: 'swarm', duration: 0.6, maxRange: 600, radius: 210, dmg: 40, poise: 55, knock: 380, hitstop: 0.12, recover: 0.32, pathDmg: 8 } as PounceDef,
            specialCooldown: 10,
            specialText: 'SWARM SLAM',
            specialButton: 'SWARM',
            energyLabel: 'BLOOD',
            // no passive bench damage: hunters losing hp with nothing visibly hitting them read as a bug
            offFieldInterval: 999,
            offFieldDmg: 0,
        },
        stitched: {
            name: 'Stitched',
            radius: 40,
            hp: 135,
            // matched to his walk cycle (STITCHED_ANIMS run speed in view/actors.ts)
            speed: 320,
            combo: [
                { dmg: 14, poise: 18, knock: 180, windup: 0.07, active: 0.08, recover: 0.2, range: 128, arcDeg: 130, lunge: 60, hitstop: 0.06, shake: 0.15 },
                { dmg: 14, poise: 18, knock: 180, windup: 0.07, active: 0.08, recover: 0.2, range: 128, arcDeg: 130, lunge: 60, hitstop: 0.06, shake: 0.15 },
                { dmg: 28, poise: 40, knock: 450, windup: 0.12, active: 0.09, recover: 0.32, range: 145, arcDeg: 170, lunge: 100, hitstop: 0.1, shake: 0.35 },
            ] as SwingDef[],
            special: {
                style: 'smash', duration: 0.42, maxRange: 420, radius: 240, dmg: 55, poise: 80, knock: 480, hitstop: 0.16, recover: 0.42,
                offset: 60, shockDelay: 0.22, shockRadius: 380, shockDmg: 15,
            } as PounceDef,
            specialCooldown: 11,
            specialText: 'THUNDER SMASH',
            specialButton: 'SMASH',
            energyLabel: 'VOLT',
            offFieldInterval: 999,
            offFieldDmg: 0,
        },
    } as Record<MonsterKind, MonsterDef>,

    tag: {
        /** Swapping in: brief invulnerability so it happens mid-storm safely. */
        invuln: 0.3,
        /** Time the entry attack lasts before control is free. */
        entryDuration: 0.28,
        /** Entry attack range/arc: a quick 360 spin when arriving. */
        entryRange: 110,
        entryDmg: 6,
        entryPoise: 10,
        entryLunge: 130,
        /** Cooldown between swaps. */
        cooldown: 2.0,
        /** Benched monsters passively refill energy at this per second. */
        benchEnergy: 10,
        /** Crimson Rain: swap/press request within this window after a big move triggers it. */
        rainWindow: 2.0,
        rainDmg: 30,
        rainPoise: 30,
        rainRadius: 260,
        rainCooldown: 6,
        /** Lightning Rod: swapping out of a living Stitched leaves this shield on the field. */
        rodMult: 1.25,
        rodDuration: 10,
    },

    /** Time after a swing ends during which the next press continues the combo. */
    comboResetTime: 0.45,
    /** Fraction of a swing's recovery that a buffered attack may cancel. */
    comboCancelAt: 0.45,
    /** Swings turn toward the nearest enemy inside this radius. */
    aimAssistRange: 320,

    dodge: { duration: 0.22, distance: 270, cooldown: 0.3, perfectWindow: 0.2 },
    /** Perfect-dodge reward: enemies slow down while the player keeps full speed. */
    witching: { duration: 1.5, enemyTimeScale: 0.12, cooldown: 8, moveBuff: 1.25 },

    /** Transformations (Q while the energy bar is full; nothing else spends the bar): one per monster. */
    trans: {
        /** Seconds transformed. */
        duration: 10,
        /** Transform pose (roar, spin, stomp) before the form kicks in; invulnerable. */
        startup: 0.6,
        /** Every transformation: all damage the monster deals is multiplied by this. */
        dmgMult: 1.35,
        werewolf: {
            label: 'FULL MOON',
            /** Black wolf, this much bigger. */
            scale: 1.2,
            /** Move and attack speeds scale by this. */
            speedMult: 1.25,
            /** Another transformation's hp can never drop below this. Full Moon makes the wolf unkillable while up. */
            floorHp: 1,
            /** Howl shockwave when the transformation ends. */
            endRadius: 300,
            endDmg: 30,
            endKnock: 420,
        },
        vampire: {
            label: 'NIGHT SWARM',
            /** As a swarm the bats bite every hunter within auraRadius each auraInterval seconds. */
            auraRadius: 170,
            auraInterval: 0.5,
            auraDmg: 5,
            /** The attack-state clock runs this fast: faster strikes. */
            attackSpeed: 1.4,
            /** Fraction of swing damage returned as hp per landed hit. */
            healFrac: 0.5,
        },
        stitched: {
            label: 'RED OVERCHARGE',
            /** On activation: heal every living teammate this fraction of their max hp... */
            teamHealFrac: 0.3,
            /** ...and shock nearby hunters. */
            shockRadius: 320,
            shockDmg: 25,
            shockPoise: 35,
            shockKnock: 320,
        },
    },

    guard: { parryWindow: 0.22, recovery: 0.28, maxHits: 5, breakCooldown: 2 },
    counter: { dmg: 40, poise: 999, knock: 280, zip: 0.07, duration: 0.38, hitstop: 0.14 },

    energy: { max: 100, perHit: 7, perCounter: 30, perPerfect: 20 },

    hurt: { stun: 0.25, invuln: 0.7, knock: 280 },

    /** Hunter bodies per kind; attacks below. Melee kinds share jab/heavy. */
    hunterKinds: {
        knight: { hp: 60, poise: 40, speed: 165 },
        barbarian: { hp: 60, poise: 40, speed: 165 },
        rogue: {
            hp: 40,
            poise: 24,
            speed: 185,
            ranged: {
                // red: dodge it, block it, or parry it in the window to send it back
                attack: { style: 'bolt', heavy: false, windup: 0.85, active: 0.05, recover: 0.6, range: 820, arcDeg: 4, dmg: 9, lunge: 0, speed: 1050 } as EnemyAttackDef,
                keepMin: 360,
                keepMax: 560,
            },
        },
        mage: {
            hp: 45,
            poise: 30,
            speed: 140,
            ranged: {
                // purple: leave the circle, or parry in the window to warp in and counter
                attack: { style: 'blast', heavy: true, windup: 1.15, active: 0.1, recover: 0.8, range: 760, arcDeg: 0, dmg: 16, lunge: 0, radius: 120 } as EnemyAttackDef,
                keepMin: 420,
                keepMax: 640,
            },
         },
         // radius matches the 3.2 m golem model so nobody stands inside it
         boss: { hp: 620, poise: 150, speed: 135, radius: 92, boss: true },
     } as Record<HunterKind, HunterKindDef>,
     boss: {
        /** Deadzone: the player may hug its legs, but its swings cover far ahead. */
        sweep: { heavy: false, windup: 1.05, active: 0.16, recover: 0.95, range: 215, arcDeg: 190, dmg: 15, lunge: 0 } as EnemyAttackDef,
        /** Armored: guard in the parry window to counter; big purple telegraph. */
        smash: { heavy: true, windup: 1.4, active: 0.2, recover: 1.3, range: 235, arcDeg: 70, dmg: 26, lunge: 0 } as EnemyAttackDef,
        /** A quake circle chases the player, then detonates (like a mage blast, far bigger). */
        quake: { style: 'blast', heavy: true, windup: 1.7, active: 0.1, recover: 1.1, range: 980, arcDeg: 0, dmg: 18, lunge: 0, radius: 240 } as EnemyAttackDef,
        /** Every third attack is the quake. */
        quakeEvery: 3,
        cooldownMin: 2.2,
        cooldownMax: 3.2,
        /** Fraction of knockback the boss lets land. */
        knockScale: 0.35,
        /** Phase 2 starts at this fraction of max hp. */
        enrageAt: 0.5,
        /** Phase 2: the roar (immune, pushes the player away, raises two hunters). */
        roar: { time: 1.5, pushRadius: 340, push: 900, adds: 2 },
        /** Phase 2 tempo: windups and recoveries scale by this, and so do cooldowns. */
        p2Windup: 0.82,
        p2Cooldown: 0.65,
        /** Phase 2: a quake every N attacks, with a wider circle. */
        p2QuakeEvery: 2,
        p2QuakeRadius: 300,
        /** Phase 2 Grave Leap: from range, it jumps onto a red circle under the player. Dodge out. */
        leap: { style: 'leap', heavy: false, windup: 1.15, active: 0.12, recover: 0.9, range: 900, arcDeg: 0, dmg: 22, lunge: 0, radius: 175 } as EnemyAttackDef,
        /** The leap's circle tracks the player for this fraction of the windup, then locks; the jump takes the rest. */
        leapTrack: 0.4,
        leapCooldown: 5,
        /** Only leaps when the player is at least this far away. */
        leapMinDist: 300,
        /** Its death: every hunter left crumbles; the team heals this fraction of max hp. */
        killHeal: 0.35,
    },
    /** Reflected bolts (parried) fly back this much faster and hit for this. */
    reflect: { speedMult: 1.3, dmg: 30, poise: 40 },

    hunter: {
        radius: 30,
        poiseRegenDelay: 2.5,
        attackRange: 135,
        stopRange: 105,
        spawnTime: 0.6,
        jab: { heavy: false, windup: 0.6, active: 0.08, recover: 0.55, range: 125, arcDeg: 70, dmg: 10, lunge: 0 } as EnemyAttackDef,
        heavy: { heavy: true, windup: 0.8, active: 0.12, recover: 0.75, range: 175, arcDeg: 56, dmg: 18, lunge: 90 } as EnemyAttackDef,
        heavyChance: 0.32,
        cooldownMin: 1.0,
        cooldownMax: 2.0,
        /** Fraction of the windup during which the enemy still turns to track the player. */
        trackFraction: 0.45,
        flinch: 0.22,
        breakStun: 2.2,
        breakDamageMult: 1.5,
        /** Death animation time before the body is removed. */
        deathTime: 1.6,
    },
    /** At most this many enemies wind up or strike at the same time. */
    maxAttackers: 2,

    /**
     * Fight area. Bodies stop `wall` units inside the fence on the sides and far
     * end, and `nearWall` inside the near fence (the camera looks over it, so a
     * body pressed against it would stand in the railings).
     */
    arena: { w: 1100, h: 1600, wall: 38, nearWall: 90 },
    waves: { base: 2, perWave: 1, max: 7, delay: 1.2, bannerTime: 1.6, minSpawnDistance: 380 },
    /**
     * Each wave after the first makes hunters stronger: per-wave step and cap
     * for each stat. Windups and cooldowns shrink (multiplier below 1).
     */
    difficulty: {
        hp: { step: 0.1, cap: 2.2 },
        dmg: { step: 0.07, cap: 1.8 },
        speed: { step: 0.03, cap: 1.3 },
        windup: { step: -0.03, cap: 0.7 },
        cooldown: { step: -0.05, cap: 0.55 },
        /** One more hunter may attack at once every this many waves (2 at the start), up to maxAttackersCap. */
        attackersEvery: 4,
        maxAttackersCap: 4,
        /** First waves for each new hunter kind. */
        barbarianFrom: 2,
        rogueFrom: 3,
        mageFrom: 5,
        /** A Gravelord rises every this many waves. */
        bossEvery: 5,
    },
    /** Player sits at this fraction of screen height; the bottom is under the thumbs. */
    camera: { anchorY: 0.4, lerp: 8 },

    /** How long a button press stays queued while the player is busy. */
    inputBuffer: { attack: 0.25, special: 0.25, dodge: 0.15, guard: 0.1, swap: 0.2, trans: 0.25 },
};

export const DEG = Math.PI / 180;

/**
 * Builds the game's model files from the KayKit source packs (CC0).
 *
 * Each character keeps only the animations and accessory meshes the game
 * uses, which cuts files from ~4 MB to a fraction of that. Realm props
 * (Halloween Bits, plus Dungeon Remastered ones prefixed `d_`) are merged
 * into one props.glb, one top-level node per prop, named after the source
 * file. Packs: github.com/KayKit-Game-Assets (CC0).
 *
 * Usage: node tools/prep-models.mjs [path-to-game-assets]
 * Set ONLY=rogue,mage (output names, or props) to rebuild just those files.
 * Default source: ../game-assets (sibling of this project).
 */
import path from 'node:path';
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, mergeDocuments, unpartition, reorder, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..', '..', 'game-assets'));
const out = path.join(import.meta.dirname, '..', 'public', 'cdn-assets', 'models');
fs.mkdirSync(out, { recursive: true });

const ADV = path.join(root, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf');
const SKL = path.join(root, 'KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Characters/gltf');
const HAL = path.join(root, 'KayKit-Halloween-Bits-1.0/addons/kaykit_halloween_bits/Assets/gltf');
const DUN = path.join(root, 'KayKit-Dungeon-Remastered-1.0/addons/kaykit_dungeon_remastered/Assets/gltf');
/** Source file of a prop: `d_` names come from the Dungeon pack (some ship as plain .glb), the rest from Halloween Bits. */
const propFile = (name) => {
    if (!name.startsWith('d_')) return path.join(HAL, `${name}.gltf`);
    const base = path.join(DUN, name.slice(2));
    return fs.existsSync(`${base}.gltf.glb`) ? `${base}.gltf.glb` : `${base}.glb`;
};

const CHARACTERS = [
    {
        src: path.join(ADV, 'Knight.glb'),
        out: 'knight.glb',
        dropMeshes: ['1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield', '2H_Sword'],
        anims: ['Idle', 'Running_A', '1H_Melee_Attack_Stab', '1H_Melee_Attack_Chop', 'Hit_A', 'Hit_B', 'Death_A', 'Block_Hit', 'Cheer'],
    },
    {
        src: path.join(ADV, 'Barbarian.glb'),
        out: 'barbarian.glb',
        dropMeshes: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'],
        anims: ['2H_Melee_Idle', 'Running_A', '2H_Melee_Attack_Stab', '2H_Melee_Attack_Chop', 'Hit_A', 'Hit_B', 'Death_A', 'Block_Hit', 'Cheer'],
    },
    {
        // Ranged hunter: two-handed crossbow, aims along a red line, then fires a bolt.
        src: path.join(ADV, 'Rogue_Hooded.glb'),
        out: 'rogue.glb',
        dropMeshes: ['Knife_Offhand', '1H_Crossbow', 'Knife', 'Throwable'],
        anims: ['Idle', 'Running_A', 'Walking_Backwards', '2H_Ranged_Aiming', '2H_Ranged_Shoot', 'Hit_A', 'Hit_B', 'Death_A', 'Cheer'],
    },
    {
        // Ranged hunter: staff caster, marks a purple circle on the ground, then blasts it.
        src: path.join(ADV, 'Mage.glb'),
        out: 'mage.glb',
        dropMeshes: ['Spellbook', 'Spellbook_open', '1H_Wand'],
        anims: ['Idle', 'Running_A', 'Walking_Backwards', 'Spellcasting', 'Spellcast_Shoot', 'Hit_A', 'Hit_B', 'Death_A', 'Cheer'],
    },
    {
        // Shield knight: keeps the big shield up in front (flank it or break it).
        src: path.join(ADV, 'Knight.glb'),
        out: 'shieldknight.glb',
        dropMeshes: ['1H_Sword_Offhand', 'Badge_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword'],
        anims: ['Idle', 'Walking_B', 'Blocking', 'Block_Hit', '1H_Melee_Attack_Stab', '1H_Melee_Attack_Chop', 'Hit_A', 'Hit_B', 'Death_A', 'Cheer'],
    },
    {
        // Skeleton minion: small, fast, weak, comes in packs in the bone realms.
        src: path.join(SKL, 'Skeleton_Minion.glb'),
        out: 'skeleton.glb',
        dropMeshes: [],
        anims: ['Idle_Combat', 'Running_A', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Hit_A', 'Hit_B', 'Death_A', 'Block_Hit', 'Skeletons_Awaken_Floor'],
    },
    {
        // Boss: the Hunt Captain (barbarian with the big axe, played at boss size).
        src: path.join(ADV, 'Barbarian.glb'),
        out: 'captain.glb',
        dropMeshes: ['1H_Axe_Offhand', 'Barbarian_Round_Shield', '1H_Axe', 'Mug'],
        anims: [
            '2H_Melee_Idle', 'Running_A', 'Running_B', '2H_Melee_Attack_Slice', '2H_Melee_Attack_Chop',
            '2H_Melee_Attack_Spinning', 'Cheer', 'Hit_A', 'Death_A', 'Block_Hit',
        ],
    },
    {
        // Boss: the Bone Colossus (skeleton warrior, played at boss size).
        src: path.join(SKL, 'Skeleton_Warrior.glb'),
        out: 'colossus.glb',
        dropMeshes: [],
        anims: [
            'Idle_Combat', 'Walking_B', 'Unarmed_Melee_Attack_Punch_B', '1H_Melee_Attack_Jump_Chop', 'Spellcast_Summon',
            'Skeletons_Awaken_Standing', 'Hit_A', 'Death_C_Skeletons', 'Block_Hit',
        ],
    },
    {
        // Stand-in hero until the generated werewolf arrives.
        src: path.join(SKL, 'Skeleton_Minion.glb'),
        out: 'hero-placeholder.glb',
        dropMeshes: [],
        anims: [
            'Idle_Combat', 'Running_A', 'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B',
            'Unarmed_Melee_Attack_Kick', 'Dodge_Forward', 'Dodge_Backward', 'Block', 'Block_Attack',
            'Hit_A', 'Death_A', '1H_Melee_Attack_Jump_Chop', 'Taunt',
        ],
    },
];

const PROPS = [
    'gravestone', 'grave_A', 'grave_B', 'gravemarker_A', 'gravemarker_B', 'tree_dead_large', 'tree_dead_medium',
    'tree_dead_small', 'fence', 'fence_broken', 'fence_pillar', 'pumpkin_orange_jackolantern', 'pumpkin_yellow_jackolantern',
    'pumpkin_orange_small', 'lantern_standing', 'post_lantern', 'skull', 'bone_A', 'ribcage', 'crypt', 'coffin',
    'candle_triple', 'shrine_candles', 'arch_gate', 'floor_dirt_grave',
    // realms 5 to 10 (Halloween Bits; the heaviest decorated variants are left out to keep the file small)
    'tree_pine_orange_large', 'tree_pine_orange_medium', 'tree_pine_orange_small', 'tree_pine_yellow_large',
    'tree_pine_yellow_medium', 'tree_pine_yellow_small', 'pumpkin_orange', 'pumpkin_yellow', 'pumpkin_yellow_small',
    'shrine', 'plaque_candles', 'pillar', 'arch', 'post', 'post_skull', 'fence_seperate', 'fence_seperate_broken',
    'fence_pillar_broken', 'grave_A_destroyed', 'skull_candle', 'bone_B', 'bone_C', 'candle_melted', 'path_A', 'path_B',
    'path_D',
    // realms 5 to 10 (Dungeon Remastered)
    'd_wall', 'd_wall_half', 'd_pillar', 'd_column', 'd_barrier', 'd_barrier_half', 'd_barrier_column', 'd_barrel_large',
    'd_torch_lit', 'd_torch_mounted', 'd_banner_patternA_red', 'd_banner_triple_red', 'd_rubble_half', 'd_sword_shield',
];

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const kb = (f) => `${Math.round(fs.statSync(f).size / 1024)} KB`;

/** Accessors left behind by disposed animations are only attached to the root; drop them. */
function dropOrphanAccessors(doc) {
    let n = 0;
    for (const acc of doc.getRoot().listAccessors()) {
        if (acc.listParents().every((p) => p.propertyType === 'Root')) {
            acc.dispose();
            n++;
        }
    }
    return n;
}

const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const wanted = (name) => !only || only.has(name);

for (const c of CHARACTERS) {
    if (!wanted(c.out.replace('.glb', ''))) continue;
    const doc = await io.read(c.src);
    const keep = new Set(c.anims);
    const have = doc.getRoot().listAnimations().map((a) => a.getName());
    const missing = c.anims.filter((n) => !have.includes(n));
    if (missing.length) throw new Error(`${c.src}: missing animations ${missing.join(', ')}`);
    for (const a of doc.getRoot().listAnimations()) {
        if (keep.has(a.getName())) continue;
        // samplers outlive their animation unless disposed explicitly, and they pin the keyframe
        // data; the accessors themselves may be shared with kept animations, so prune drops them
        for (const s of a.listSamplers()) s.dispose();
        for (const ch of a.listChannels()) ch.dispose();
        a.dispose();
    }
    for (const n of doc.getRoot().listNodes()) if (c.dropMeshes.includes(n.getName())) n.dispose();
    await doc.transform(resample(), dedup(), prune());
    dropOrphanAccessors(doc);
    await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const file = path.join(out, c.out);
    await io.write(file, doc);
    console.log(`${c.out}: ${kb(c.src)} -> ${kb(file)}`);
}

if (wanted('props')) {
    // Props: merge every prop into one document, one scene, one node per prop.
    const props = await io.read(propFile(PROPS[0]));
    const scene = props.getRoot().getDefaultScene() ?? props.getRoot().listScenes()[0];
    const wrap = (doc, sceneOfDoc, name) => {
        const holder = doc.createNode(name);
        for (const child of sceneOfDoc.listChildren()) {
            sceneOfDoc.removeChild(child);
            holder.addChild(child);
        }
        return holder;
    };
    scene.addChild(wrap(props, scene, PROPS[0]));
    for (const name of PROPS.slice(1)) {
        const src = await io.read(propFile(name));
        const map = mergeDocuments(props, src);
        const srcScene = src.getRoot().listScenes()[0];
        const merged = map.get(srcScene);
        scene.addChild(wrap(props, merged, name));
        merged.dispose();
    }
    await props.transform(unpartition(), dedup(), prune());
    dropOrphanAccessors(props);
    await props.transform(reorder({ encoder: MeshoptEncoder }), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const propsFile = path.join(out, 'props.glb');
    await io.write(propsFile, props);
    console.log(`props.glb: ${PROPS.length} props -> ${kb(propsFile)}`);
}

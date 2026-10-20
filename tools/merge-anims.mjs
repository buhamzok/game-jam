/**
 * Merges RUN/Meshy animation exports into one game-ready GLB.
 *
 * `rundot game animate-3d` writes one GLB per clip, each carrying the same
 * rigged mesh. This keeps the mesh from the first file, copies every clip onto
 * it (matched to bones by name), renames clips to the game's names, strips
 * horizontal root motion (the game moves characters itself), and compresses.
 *
 * Usage:
 *   node tools/merge-anims.mjs <out.glb> <name>=<file.glb> [<name>=<file.glb> ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, resample, reorder, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

const [outFile, ...pairs] = process.argv.slice(2);
if (!outFile || pairs.length === 0) {
    console.error('usage: node tools/merge-anims.mjs <out.glb> <name>=<file.glb> ...');
    process.exit(1);
}
const clips = pairs.map((p) => {
    const i = p.indexOf('=');
    return { name: p.slice(0, i), file: p.slice(i + 1) };
});

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
        'meshopt.encoder': MeshoptEncoder,
        'meshopt.decoder': MeshoptDecoder,
        'draco3d.decoder': await draco3d.createDecoderModule(),
    });

const base = await io.read(clips[0].file);
const root = base.getRoot();
const buffer = root.listBuffers()[0] ?? base.createBuffer();
const nodesByName = new Map(root.listNodes().map((n) => [n.getName(), n]));

// The first file's own animation becomes the first clip; drop any extras it carried.
const baseAnims = root.listAnimations();
baseAnims.forEach((a, i) => {
    if (i === 0) a.setName(clips[0].name);
    else a.dispose();
});

const copyAccessor = (src) =>
    base
        .createAccessor()
        .setType(src.getType())
        .setArray(src.getArray().slice())
        .setNormalized(src.getNormalized())
        .setBuffer(buffer);

for (const { name, file } of clips.slice(1)) {
    const doc = await io.read(file);
    const anim = doc.getRoot().listAnimations()[0];
    if (!anim) throw new Error(`${file}: no animation`);
    const out = base.createAnimation(name);
    let skipped = 0;
    for (const ch of anim.listChannels()) {
        const target = nodesByName.get(ch.getTargetNode()?.getName() ?? '');
        if (!target) {
            skipped++;
            continue;
        }
        const s = ch.getSampler();
        const sampler = base
            .createAnimationSampler()
            .setInput(copyAccessor(s.getInput()))
            .setOutput(copyAccessor(s.getOutput()))
            .setInterpolation(s.getInterpolation());
        out.addSampler(sampler).addChannel(base.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler));
    }
    if (skipped) console.warn(`${name}: ${skipped} channels had no matching bone`);
}

// Strip horizontal root motion: the hips keep their bob but stay over the feet.
for (const a of root.listAnimations()) {
    for (const ch of a.listChannels()) {
        if (ch.getTargetPath() !== 'translation') continue;
        const node = ch.getTargetNode();
        if (!node || !/hips|root|pelvis/i.test(node.getName())) continue;
        const outAcc = ch.getSampler().getOutput();
        const arr = outAcc.getArray().slice();
        const x0 = arr[0];
        const z0 = arr[2];
        for (let i = 0; i < arr.length; i += 3) {
            arr[i] = x0;
            arr[i + 2] = z0;
        }
        outAcc.setArray(arr);
    }
}

// Flat, stylized shading like the KayKit models: color texture only, matte, no metal.
for (const m of root.listMaterials()) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setEmissiveTexture(null);
    m.setMetallicFactor(0).setRoughnessFactor(0.85).setEmissiveFactor([0, 0, 0]);
}

for (const acc of root.listAccessors()) {
    if (acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose();
}
// Draco is only needed to read the sources; the output uses meshopt instead.
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_draco_mesh_compression') ext.dispose();
await base.transform(
    resample(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
await io.write(outFile, base);
console.log(`${outFile}: ${root.listAnimations().map((a) => a.getName()).join(', ')} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);

/**
 * Model loading. Models live in public/cdn-assets/models/ (built by
 * tools/prep-models.mjs and tools/merge-anims.mjs) and are fetched through
 * the RUN CDN when the host is available, or straight from the dev server
 * otherwise. Everything is loaded once during the loading screen; scenes then
 * clone from the cache.
 */
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { sdkReady } from '../../sdk/runSdk.ts';

const MODEL_FILES = {
    werewolf: 'models/werewolf.glb',
    vampire: 'models/vampire.glb',
    stitched: 'models/stitched.glb',
    placeholder: 'models/hero-placeholder.glb',
    knight: 'models/knight.glb',
    barbarian: 'models/barbarian.glb',
    rogue: 'models/rogue.glb',
    mage: 'models/mage.glb',
    bossgolem: 'models/bossgolem.glb',
    captain: 'models/captain.glb',
    colossus: 'models/colossus.glb',
    props: 'models/props.glb',
} as const;

type FileKey = keyof typeof MODEL_FILES;
/** 'hero' and 'vampire' fall back to whichever generated hero file exists. */
export type ModelKey = FileKey | 'hero';

/** Files the game can run without. */
const OPTIONAL = new Set<FileKey>(['werewolf', 'vampire', 'stitched', 'bossgolem', 'captain', 'colossus']);

const cache = new Map<FileKey, GLTF>();

export async function fetchCdnAsset(path: string): Promise<ArrayBuffer> {
    if (sdkReady()) {
        try {
            const blob = await RundotGameAPI.cdn.fetchAsset(path);
            return await blob.arrayBuffer();
        } catch (err) {
            console.warn(`[assets] CDN fetch failed for ${path}, trying the local file`, err);
        }
    }
    const res = await fetch(`cdn-assets/${path}`);
    if (!res.ok) throw new Error(`[assets] ${path}: HTTP ${res.status}`);
    return res.arrayBuffer();
}

/** Load every model. `onProgress` receives 0..1 as files finish. */
export async function loadModels(onProgress: (p: number) => void = () => {}): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const load = async (key: FileKey) => {
        if (cache.has(key)) return;
        const buf = await fetchCdnAsset(MODEL_FILES[key]);
        cache.set(key, await loader.parseAsync(buf, ''));
    };
    // generated hero models are only fetched when present; the skeleton stand-in covers all misses
    const keys = (Object.keys(MODEL_FILES) as FileKey[]).filter((k) => k !== 'placeholder');
    let done = 0;
    await Promise.all(
        keys.map(async (key) => {
            try {
                await load(key);
            } catch (err) {
                if (!OPTIONAL.has(key)) throw err;
                console.info(`[assets] optional model "${key}" not available`);
            }
            done++;
            onProgress(done / keys.length);
        }),
    );
    if (!cache.has('werewolf')) await load('placeholder');
}

/** Whether a model file loaded (optional files may be missing). */
export function hasModel(key: FileKey): boolean {
    return cache.has(key);
}

/** Per-monster model resolution: its own file, then any generated hero, then the stand-in. */
export function getModel(key: ModelKey): GLTF {
    const order =
        key === 'hero'
            ? ['werewolf', 'placeholder']
            : key === 'vampire'
              ? ['vampire', 'werewolf', 'placeholder']
              : key === 'stitched'
                ? ['stitched', 'werewolf', 'placeholder']
                : [key as FileKey];
    for (const file of order) {
        const gltf = cache.get(file as FileKey);
        if (gltf) return gltf;
    }
    throw new Error(`[assets] model "${key}" not loaded`);
}

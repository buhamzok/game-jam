/**
 * One animated character instance: a skinned clone of a cached glTF, its own
 * animation mixer and its own materials (so hit flashes tint only this one),
 * plus a soft blob shadow. Positioned at the feet; rotation.y is the facing.
 */
import {
    AnimationMixer,
    Box3,
    CanvasTexture,
    CircleGeometry,
    Color,
    Group,
    LoopOnce,
    LoopRepeat,
    Mesh,
    MeshBasicMaterial,
    type AnimationAction,
    type Material,
    type MeshStandardMaterial,
    type Object3D,
} from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

export interface AnimSpec {
    clip: string;
    loop?: boolean;
    /** Playback rate. */
    speed?: number;
    /** Start offset as a fraction of the clip (skips wind-up frames). */
    start?: number;
    /** Crossfade time in seconds. */
    fade?: number;
}

let shadowTexture: CanvasTexture | null = null;

function blobShadowTexture(): CanvasTexture {
    if (shadowTexture) return shadowTexture;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowTexture = new CanvasTexture(c);
    return shadowTexture;
}

/** Height of a glTF scene in its own units (bind pose). */
export function modelHeight(gltf: GLTF): number {
    const box = new Box3().setFromObject(gltf.scene);
    return box.max.y - box.min.y;
}

export class CharacterView {
    /** Feet position and facing. Add to the scene. */
    readonly root = new Group();
    /** Holds the model; offset vertically for jumps and spawn/death sinks. */
    readonly body = new Group();
    readonly model: Object3D;

    private readonly mixer: AnimationMixer;
    private readonly actions = new Map<string, AnimationAction>();
    private readonly materials: MeshStandardMaterial[] = [];
    private readonly shadow: Mesh;
    private current: AnimationAction | null = null;
    private currentKey = '';
    private flashColor = new Color();
    /** Material colors as loaded, so tints can be undone. */
    private readonly baseColors: Color[] = [];
    /** Skin recolor uniforms, shared by this character's materials (installed on first setSkin). */
    private skinUniforms: { uSkinColor: { value: Color }; uSkinAmount: { value: number } } | null = null;
    private readonly tintColor = new Color();
    private tintKey = '';
    private readonly baseScale: number;

    constructor(gltf: GLTF, scale: number, shadowRadius: number) {
        this.model = cloneSkinned(gltf.scene);
        this.baseScale = scale;
        this.model.scale.setScalar(scale);
        this.model.traverse((o) => {
            const mesh = o as Mesh;
            if (!mesh.isMesh) return;
            mesh.frustumCulled = false; // skinned bounds do not follow animation
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            const cloned = mats.map((m: Material) => {
                const c = m.clone() as MeshStandardMaterial;
                this.materials.push(c);
                this.baseColors.push(c.color ? c.color.clone() : new Color(1, 1, 1));
                return c;
            });
            mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        });
        this.body.add(this.model);
        this.root.add(this.body);

        this.shadow = new Mesh(
            new CircleGeometry(shadowRadius, 24),
            new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false }),
        );
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.y = 0.02;
        this.shadow.renderOrder = -1;
        this.root.add(this.shadow);

        this.mixer = new AnimationMixer(this.model);
        for (const clip of gltf.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    hasClip(name: string): boolean {
        return this.actions.has(name);
    }

    clipDuration(name: string): number {
        return this.actions.get(name)?.getClip().duration ?? 1;
    }

    /**
     * Switch to an animation. Calls with the same `key` as the current one do
     * nothing, so this is safe to call every frame; pass a new key to restart
     * the same clip (e.g. each swing of a combo).
     */
    play(spec: AnimSpec, key: string = spec.clip): void {
        if (key === this.currentKey) return;
        const next = this.actions.get(spec.clip);
        if (!next) return;
        const prev = this.current;
        next.reset();
        next.setLoop(spec.loop ? LoopRepeat : LoopOnce, Infinity);
        next.clampWhenFinished = !spec.loop;
        next.timeScale = spec.speed ?? 1;
        if (spec.start) next.time = spec.start * next.getClip().duration;
        next.setEffectiveWeight(1);
        next.play();
        if (prev && prev !== next) next.crossFadeFrom(prev, spec.fade ?? 0.1, false);
        this.current = next;
        this.currentKey = key;
    }

    setSpeed(speed: number): void {
        if (this.current) this.current.timeScale = speed;
    }

    /** Playback position of the current clip as a fraction 0..1. */
    clipFraction(): number {
        if (!this.current) return 0;
        return this.current.time / Math.max(0.001, this.current.getClip().duration);
    }

    /** Advance animations. Pass 0 to freeze the pose (hitstop). */
    update(dt: number): void {
        this.mixer.update(dt);
    }

    /** Tint toward `color` by `amount` (0..1) through emissive light. */
    setGlow(color: number, amount: number): void {
        this.flashColor.setHex(color);
        for (const m of this.materials) {
            if (!m.emissive) continue;
            m.emissive.copy(this.flashColor);
            m.emissiveIntensity = amount;
        }
    }

    /** Blend every material's color toward `color` by `amount` (0 = as loaded). Textures still show through. */
    setTint(color: number, amount: number): void {
        const key = `${color}|${amount.toFixed(3)}`;
        if (key === this.tintKey) return;
        this.tintKey = key;
        this.tintColor.setHex(color);
        this.materials.forEach((m, i) => {
            if (m.color) m.color.copy(this.baseColors[i]).lerp(this.tintColor, amount);
        });
    }

    /**
     * Cosmetic skin: recolor the surface toward `color` by `amount` (0 = classic).
     * The shader keeps each texel's brightness and swaps its hue, so texture
     * detail survives and light skins work on dark fur too. Tints and glows
     * (hit flash, transformations) still apply on top.
     */
    setSkin(color: number, amount: number): void {
        if (!this.skinUniforms) {
            if (amount <= 0) return;
            const u = { uSkinColor: { value: new Color() }, uSkinAmount: { value: 0 } };
            this.skinUniforms = u;
            for (const m of this.materials) {
                m.onBeforeCompile = (shader) => {
                    shader.uniforms.uSkinColor = u.uSkinColor;
                    shader.uniforms.uSkinAmount = u.uSkinAmount;
                    shader.fragmentShader = shader.fragmentShader
                        .replace('void main() {', 'uniform vec3 uSkinColor;\nuniform float uSkinAmount;\nvoid main() {')
                        .replace(
                            '#include <map_fragment>',
                            '#include <map_fragment>\n\tfloat skinL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), skinL * uSkinColor * 1.9), uSkinAmount);',
                        );
                };
                m.customProgramCacheKey = () => 'ttt-skin';
                m.needsUpdate = true;
            }
        }
        this.skinUniforms.uSkinColor.value.setHex(color);
        this.skinUniforms.uSkinAmount.value = amount;
    }

    /** Scale the model relative to its loaded size (transformations). */
    setSize(mult: number): void {
        this.model.scale.setScalar(this.baseScale * mult);
    }

    /** Hide the model but keep the root (and its shadow) in place, e.g. while the body is a bat swarm. */
    setModelVisible(visible: boolean): void {
        this.model.visible = visible;
    }

    setOpacity(alpha: number): void {
        const transparent = alpha < 0.999;
        for (const m of this.materials) {
            if (m.transparent !== transparent) {
                m.transparent = transparent;
                m.needsUpdate = true;
            }
            m.opacity = alpha;
        }
        (this.shadow.material as MeshBasicMaterial).opacity = alpha;
    }

    dispose(): void {
        this.mixer.stopAllAction();
        this.root.removeFromParent();
        for (const m of this.materials) m.dispose();
        this.shadow.geometry.dispose();
        (this.shadow.material as Material).dispose();
    }
}

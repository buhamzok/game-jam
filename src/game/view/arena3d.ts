/**
 * The graveyard: ground, fence around the fight area, scattered KayKit props
 * and the night lighting. Props are cloned from props.glb (one node per prop,
 * named after its source file) and scaled with the same factor as the
 * characters, so the pack's proportions stay intact.
 */
import {
    Box3,
    CanvasTexture,
    Color,
    DirectionalLight,
    FogExp2,
    Group,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    PlaneGeometry,
    PointLight,
    RepeatWrapping,
    SRGBColorSpace,
    Vector3,
    type Object3D,
    type Scene,
} from 'three';
import { T } from '../tuning.ts';
import { getModel } from './assets.ts';
import { U } from './fx3d.ts';
import { seeded } from './random.ts';

export const NIGHT = 0x120d1c;

function groundTexture(base: string, speckles: string[], seed: number): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    const rand = seeded(seed);
    for (let i = 0; i < 900; i++) {
        g.fillStyle = speckles[Math.floor(rand() * speckles.length)];
        g.globalAlpha = 0.25 + rand() * 0.35;
        const s = 1 + rand() * 4;
        g.fillRect(rand() * 256, rand() * 256, s, s);
    }
    g.globalAlpha = 1;
    const tex = new CanvasTexture(c);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    return tex;
}

export class Arena3D {
    readonly group = new Group();
    private readonly props: Object3D;
    private readonly scale: number;

    constructor(scene: Scene, kaykitScale: number) {
        this.scale = kaykitScale;
        this.props = getModel('props').scene;

        scene.background = new Color(NIGHT);
        // thin enough that the fight area stays clear; the far graveyard fades out
        scene.fog = new FogExp2(NIGHT, 0.022);

        const hemi = new HemisphereLight(0xb4bcff, 0x3a2440, 2.4);
        const moon = new DirectionalLight(0xdfe4ff, 2.6);
        moon.position.set(-6, 12, 8);
        // soft warm fill from the camera side so faces read at night
        const fill = new DirectionalLight(0xffc89a, 0.8);
        fill.position.set(4, 5, 12);
        this.group.add(hemi, moon, fill);

        const hw = (T.arena.w / 2) * U;
        const hh = (T.arena.h / 2) * U;

        const outside = groundTexture('#1b1626', ['#2a2238', '#141019', '#24301f'], 3);
        outside.repeat.set(16, 16);
        const ground = new Mesh(new PlaneGeometry(70, 70), new MeshStandardMaterial({ map: outside, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        this.group.add(ground);

        const dirt = groundTexture('#4a3e58', ['#5a4c69', '#3a3046', '#63557a', '#4d4936'], 11);
        dirt.repeat.set(T.arena.w / 200, T.arena.h / 200);
        const floor = new Mesh(new PlaneGeometry(hw * 2, hh * 2), new MeshStandardMaterial({ map: dirt, roughness: 1 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.01;
        this.group.add(floor);

        this.buildFence(hw, hh);
        this.scatter(hw, hh);

        // warm light from the two jack-o'-lantern clusters by the near corners
        for (const sx of [-1, 1]) {
            const lamp = new PointLight(0xff8a2a, 6, 7, 1.6);
            lamp.position.set(sx * (hw + 0.9), 1.0, hh - 1.2);
            this.group.add(lamp);
        }
        scene.add(this.group);
    }

    private place(name: string, x: number, z: number, rotY = 0, scaleMul = 1): Object3D | null {
        const src = this.props.getObjectByName(name);
        if (!src) {
            console.warn(`[arena] prop "${name}" missing`);
            return null;
        }
        const o = src.clone();
        o.position.set(x, 0, z);
        o.rotation.set(0, rotY, 0);
        o.scale.setScalar(this.scale * scaleMul);
        this.group.add(o);
        return o;
    }

    /** Length of a prop along its local X axis, in meters after scaling. */
    private lengthX(name: string): number {
        const src = this.props.getObjectByName(name);
        if (!src) return 1;
        const size = new Box3().setFromObject(src).getSize(new Vector3());
        return Math.max(size.x, size.z) * this.scale;
    }

    private buildFence(hw: number, hh: number): void {
        const seg = this.lengthX('fence');
        const rand = seeded(5);
        const run = (x0: number, z0: number, x1: number, z1: number, rot: number) => {
            const len = Math.hypot(x1 - x0, z1 - z0);
            const n = Math.max(1, Math.round(len / seg));
            for (let i = 0; i < n; i++) {
                const t = (i + 0.5) / n;
                const piece = rand() < 0.2 ? 'fence_broken' : 'fence';
                this.place(piece, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot);
            }
        };
        const m = 0.15; // fence sits just outside the walkable area
        run(-hw, -hh - m, hw, -hh - m, 0);
        run(-hw, hh + m, hw, hh + m, 0);
        run(-hw - m, -hh, -hw - m, hh, Math.PI / 2);
        run(hw + m, -hh, hw + m, hh, Math.PI / 2);
        for (const [x, z] of [[-hw - m, -hh - m], [hw + m, -hh - m], [-hw - m, hh + m], [hw + m, hh + m]]) this.place('fence_pillar', x, z);
    }

    private scatter(hw: number, hh: number): void {
        const rand = seeded(42);
        // the crypt watches over the far end
        this.place('crypt', 0, -hh - 3.2, 0, 1.2);
        this.place('arch_gate', 0, -hh - 1.1, 0);
        // dead trees and graves in the dark outside the fence
        const outsideProps = ['tree_dead_large', 'tree_dead_medium', 'tree_dead_small', 'gravestone', 'grave_A', 'grave_B', 'gravemarker_A', 'gravemarker_B', 'coffin'];
        for (let i = 0; i < 46; i++) {
            const side = i % 3; // far edge, left, right (the near edge stays low so it never hides the action)
            let x = 0;
            let z = 0;
            if (side === 0) { x = (rand() * 2 - 1) * (hw + 4); z = -hh - 1.2 - rand() * 5; }
            if (side === 1) { x = -hw - 1 - rand() * 4; z = (rand() * 2 - 1) * (hh + 2); }
            if (side === 2) { x = hw + 1 + rand() * 4; z = (rand() * 2 - 1) * (hh + 2); }
            if (Math.abs(x) < 2 && z < -hh - 1.8 && z > -hh - 5) continue; // keep the crypt clear
            const name = outsideProps[Math.floor(rand() * outsideProps.length)];
            this.place(name, x, z, rand() * Math.PI * 2, 0.8 + rand() * 0.5);
        }
        // low props along the near edge
        for (let i = 0; i < 10; i++) {
            const names = ['pumpkin_orange_small', 'skull', 'bone_A', 'candle_triple', 'gravemarker_A'];
            this.place(names[i % names.length], (rand() * 2 - 1) * (hw + 2), hh + 0.8 + rand() * 1.5, rand() * Math.PI * 2);
        }
        // jack-o'-lantern clusters by the near corners (lit by the point lights)
        for (const sx of [-1, 1]) {
            this.place('pumpkin_orange_jackolantern', sx * (hw + 0.9), hh - 1.2, sx * 0.4);
            this.place('pumpkin_yellow_jackolantern', sx * (hw + 1.4), hh - 0.5, sx * 0.8, 0.8);
            this.place('lantern_standing', sx * (hw + 0.8), -hh + 1.5, 0);
        }
        // a little debris inside the fight area, flat enough not to block the view
        for (let i = 0; i < 8; i++) {
            const names = ['bone_A', 'skull', 'ribcage', 'pumpkin_orange_small'];
            const x = (rand() * 2 - 1) * (hw - 0.6);
            const z = (rand() * 2 - 1) * (hh - 0.6);
            this.place(names[i % names.length], x, z, rand() * Math.PI * 2, 0.8);
        }
        this.place('shrine_candles', -hw + 0.7, -hh + 0.6, 0.6);
        this.place('candle_triple', hw - 0.6, -hh + 0.6, 0);
    }

    dispose(): void {
        this.group.removeFromParent();
        this.group.traverse((o) => {
            const mesh = o as Mesh;
            if (mesh.isMesh && (mesh.geometry as unknown) && (mesh.material as MeshStandardMaterial).map instanceof CanvasTexture) {
                (mesh.material as MeshStandardMaterial).map?.dispose();
            }
        });
    }
}

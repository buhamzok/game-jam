/**
 * One realm's arena: ground, the border around the fight area, solid
 * obstacles, scattered KayKit props and the night lighting, all driven by the
 * realm's theme (see ../realms.ts). Props are cloned from props.glb (one node
 * per prop, named after its source file) and scaled with the same factor as
 * the characters, so the pack's proportions stay intact.
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
import type { RealmDef } from '../realms.ts';
import { getModel } from './assets.ts';
import { U } from './fx3d.ts';
import { seeded } from './random.ts';

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
    private readonly textures: CanvasTexture[] = [];

    constructor(scene: Scene, kaykitScale: number, private readonly realm: RealmDef) {
        this.scale = kaykitScale;
        this.props = getModel('props').scene;
        const th = realm.theme;
        // every realm has its own seeds so the scatter differs
        const seed = realm.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

        scene.background = new Color(th.night);
        // thin enough that the fight area stays clear; the far props fade out
        scene.fog = new FogExp2(th.night, th.fog);

        const hemi = new HemisphereLight(th.hemiSky, th.hemiGround, th.hemiIntensity);
        const moon = new DirectionalLight(th.moon, th.moonIntensity);
        moon.position.set(-6, 12, 8);
        // soft warm fill from the camera side so faces read at night
        const fill = new DirectionalLight(0xffc89a, 0.8);
        fill.position.set(4, 5, 12);
        this.group.add(hemi, moon, fill);

        const hw = (realm.arena.w / 2) * U;
        const hh = (realm.arena.h / 2) * U;

        const outside = groundTexture(th.outside[0], th.outside[1], 3 + seed);
        outside.repeat.set(16, 16);
        const ground = new Mesh(new PlaneGeometry(80, 80), new MeshStandardMaterial({ map: outside, roughness: 1 }));
        ground.rotation.x = -Math.PI / 2;
        this.group.add(ground);

        const dirt = groundTexture(th.floor[0], th.floor[1], 11 + seed);
        dirt.repeat.set(realm.arena.w / 200, realm.arena.h / 200);
        const floor = new Mesh(new PlaneGeometry(hw * 2, hh * 2), new MeshStandardMaterial({ map: dirt, roughness: 1 }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.01;
        this.group.add(floor);
        this.textures.push(outside, dirt);

        this.buildBorder(hw, hh, seed);
        this.scatter(hw, hh, seed);
        for (const o of realm.obstacles) this.place(o.prop, o.x * U, o.y * U, o.rot ?? 0, o.scale);

        // warm light from lantern clusters by the near corners
        for (const sx of [-1, 1]) {
            const lamp = new PointLight(th.lamp, 6, 7, 1.6);
            lamp.position.set(sx * (hw + 0.9), 1.0, hh - 1.2);
            this.group.add(lamp);
        }
        // big glowing pumpkins light the patch from inside
        if (th.border === 'pumpkins') {
            for (const o of realm.obstacles.slice(0, 4)) {
                const l = new PointLight(th.lamp, 4, 5, 1.6);
                l.position.set(o.x * U, 1.1, o.y * U);
                this.group.add(l);
            }
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

    /** Lay props along a line, `step` meters apart, picking names in turn. */
    private line(x0: number, z0: number, x1: number, z1: number, step: number, pick: (i: number) => string, rot: (i: number) => number, scaleOf: (i: number) => number = () => 1): void {
        const len = Math.hypot(x1 - x0, z1 - z0);
        const n = Math.max(1, Math.round(len / step));
        for (let i = 0; i < n; i++) {
            const t = (i + 0.5) / n;
            this.place(pick(i), x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, rot(i), scaleOf(i));
        }
    }

    private buildBorder(hw: number, hh: number, seed: number): void {
        const rand = seeded(5 + seed);
        const style = this.realm.theme.border;
        const m = 0.15; // the border sits just outside the walkable area
        if (style === 'fence') {
            const seg = this.lengthX('fence');
            const piece = () => (rand() < 0.2 ? 'fence_broken' : 'fence');
            this.line(-hw, -hh - m, hw, -hh - m, seg, piece, () => 0);
            this.line(-hw, hh + m, hw, hh + m, seg, piece, () => 0);
            this.line(-hw - m, -hh, -hw - m, hh, seg, piece, () => Math.PI / 2);
            this.line(hw + m, -hh, hw + m, hh, seg, piece, () => Math.PI / 2);
            for (const [x, z] of [[-hw - m, -hh - m], [hw + m, -hh - m], [-hw - m, hh + m], [hw + m, hh + m]]) this.place('fence_pillar', x, z);
            return;
        }
        if (style === 'trees') {
            // a wall of dead trees on three sides; a low line of grave markers on the near side
            const tree = () => (rand() < 0.55 ? 'tree_dead_large' : 'tree_dead_medium');
            const yaw = () => rand() * Math.PI * 2;
            const size = () => 0.9 + rand() * 0.4;
            this.line(-hw - 0.4, -hh - 0.5, hw + 0.4, -hh - 0.5, 1.5, tree, yaw, size);
            this.line(-hw - 0.5, -hh, -hw - 0.5, hh, 1.5, tree, yaw, size);
            this.line(hw + 0.5, -hh, hw + 0.5, hh, 1.5, tree, yaw, size);
            this.line(-hw, hh + 0.4, hw, hh + 0.4, 1.3, () => (rand() < 0.5 ? 'gravemarker_A' : 'gravemarker_B'), () => (rand() - 0.5) * 0.4);
            return;
        }
        if (style === 'graves') {
            const grave = () => ['gravestone', 'grave_A', 'grave_B'][Math.floor(rand() * 3)];
            this.line(-hw, -hh - 0.4, hw, -hh - 0.4, 1.1, grave, () => (rand() - 0.5) * 0.3);
            this.line(-hw - 0.4, -hh, -hw - 0.4, hh, 1.1, grave, () => Math.PI / 2 + (rand() - 0.5) * 0.3);
            this.line(hw + 0.4, -hh, hw + 0.4, hh, 1.1, grave, () => -Math.PI / 2 + (rand() - 0.5) * 0.3);
            this.line(-hw, hh + 0.3, hw, hh + 0.3, 1.8, () => (rand() < 0.5 ? 'candle_triple' : 'skull'), () => rand() * 6);
            for (const [x, z] of [[-hw - m, -hh - m], [hw + m, -hh - m], [-hw - m, hh + m], [hw + m, hh + m]]) this.place('fence_pillar', x, z);
            return;
        }
        // pumpkins: jack-o'-lanterns and lantern posts all around
        const pumpkin = (i: number) => (i % 4 === 0 ? 'post_lantern' : rand() < 0.5 ? 'pumpkin_orange_jackolantern' : 'pumpkin_yellow_jackolantern');
        const face = (toward: number) => () => toward + (rand() - 0.5) * 0.6;
        this.line(-hw, -hh - 0.4, hw, -hh - 0.4, 0.9, pumpkin, face(0));
        this.line(-hw - 0.4, -hh, -hw - 0.4, hh, 0.9, pumpkin, face(Math.PI / 2));
        this.line(hw + 0.4, -hh, hw + 0.4, hh, 0.9, pumpkin, face(-Math.PI / 2));
        this.line(-hw, hh + 0.35, hw, hh + 0.35, 0.8, () => 'pumpkin_orange_small', () => rand() * 6);
    }

    private scatter(hw: number, hh: number, seed: number): void {
        const rand = seeded(42 + seed);
        const th = this.realm.theme;
        // a landmark watches over the far end
        if (th.landmark) this.place(th.landmark.prop, 0, -hh - 3.2, 0, th.landmark.scale);
        if (th.border === 'fence') this.place('arch_gate', 0, -hh - 1.1, 0);
        // props in the dark outside the border
        for (let i = 0; i < 46; i++) {
            const side = i % 3; // far edge, left, right (the near edge stays low so it never hides the action)
            let x = 0;
            let z = 0;
            if (side === 0) { x = (rand() * 2 - 1) * (hw + 4); z = -hh - 1.2 - rand() * 5; }
            if (side === 1) { x = -hw - 1 - rand() * 4; z = (rand() * 2 - 1) * (hh + 2); }
            if (side === 2) { x = hw + 1 + rand() * 4; z = (rand() * 2 - 1) * (hh + 2); }
            if (Math.abs(x) < 2 && z < -hh - 1.8 && z > -hh - 5) continue; // keep the landmark clear
            const name = th.outsideProps[Math.floor(rand() * th.outsideProps.length)];
            this.place(name, x, z, rand() * Math.PI * 2, 0.8 + rand() * 0.5);
        }
        // low props along the near edge
        for (let i = 0; i < 10; i++) {
            this.place(th.nearProps[i % th.nearProps.length], (rand() * 2 - 1) * (hw + 2), hh + 0.8 + rand() * 1.5, rand() * Math.PI * 2);
        }
        // lantern clusters by the corners (lit by the point lights)
        for (const sx of [-1, 1]) {
            this.place('pumpkin_orange_jackolantern', sx * (hw + 0.9), hh - 1.2, sx * 0.4);
            this.place('pumpkin_yellow_jackolantern', sx * (hw + 1.4), hh - 0.5, sx * 0.8, 0.8);
            this.place('lantern_standing', sx * (hw + 0.8), -hh + 1.5, 0);
        }
        // a little debris inside the fight area, flat enough not to block the view
        for (let i = 0; i < 8; i++) {
            const x = (rand() * 2 - 1) * (hw - 0.6);
            const z = (rand() * 2 - 1) * (hh - 0.6);
            this.place(th.decor[i % th.decor.length], x, z, rand() * Math.PI * 2, 0.8);
        }
        this.place('shrine_candles', -hw + 0.7, -hh + 0.6, 0.6);
        this.place('candle_triple', hw - 0.6, -hh + 0.6, 0);
    }

    dispose(): void {
        this.group.removeFromParent();
        this.group.traverse((o) => {
            const mesh = o as Mesh;
            if (!mesh.isMesh) return;
            // cloned props share geometry and materials with props.glb: only free what this arena made
            if ((mesh.material as MeshStandardMaterial).map instanceof CanvasTexture) {
                mesh.geometry.dispose();
                (mesh.material as MeshStandardMaterial).dispose();
            }
        });
        for (const t of this.textures) t.dispose();
    }
}

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
import type { FloorPattern, RealmDef } from '../realms.ts';
import { getModel } from './assets.ts';
import { U } from './fx3d.ts';
import { seeded } from './random.ts';

function groundTexture(base: string, speckles: string[], seed: number, pattern: FloorPattern = 'speckle'): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    const rand = seeded(seed);
    if (pattern === 'tiles') {
        // stone flags: each tile a shade off the base, dark grout between, a few cracks
        const n = 4;
        const t = 256 / n;
        for (let ty = 0; ty < n; ty++) {
            // odd rows shift half a tile; start one tile early so the row wraps without a gap
            for (let tx = ty % 2 ? -1 : 0; tx < n; tx++) {
                const off = ty % 2 ? t / 2 : 0;
                g.fillStyle = speckles[Math.floor(rand() * speckles.length)];
                g.globalAlpha = 0.55 + rand() * 0.3;
                g.fillRect(tx * t + off + 3, ty * t + 3, t - 6, t - 6);
            }
        }
        g.globalAlpha = 1;
        g.strokeStyle = 'rgba(0,0,0,0.55)';
        g.lineWidth = 4;
        for (let ty = 0; ty <= n; ty++) {
            g.beginPath();
            g.moveTo(0, ty * t);
            g.lineTo(256, ty * t);
            g.stroke();
            for (let tx = 0; tx <= n; tx++) {
                const x = tx * t + (ty % 2 ? t / 2 : 0);
                g.beginPath();
                g.moveTo(x % 256, ty * t);
                g.lineTo(x % 256, ty * t + t);
                g.stroke();
            }
        }
        g.lineWidth = 1.5;
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        for (let i = 0; i < 10; i++) {
            let x = rand() * 256;
            let y = rand() * 256;
            g.beginPath();
            g.moveTo(x, y);
            for (let k = 0; k < 4; k++) {
                x += (rand() - 0.5) * 30;
                y += (rand() - 0.5) * 30;
                g.lineTo(x, y);
            }
            g.stroke();
        }
    }
    if (pattern === 'leaves') {
        // fallen leaves: small rotated ovals in autumn colors
        for (let i = 0; i < 260; i++) {
            g.save();
            g.translate(rand() * 256, rand() * 256);
            g.rotate(rand() * Math.PI);
            g.fillStyle = speckles[Math.floor(rand() * speckles.length)];
            g.globalAlpha = 0.3 + rand() * 0.35;
            g.beginPath();
            g.ellipse(0, 0, 3 + rand() * 4, 1.5 + rand() * 2, 0, 0, Math.PI * 2);
            g.fill();
            g.restore();
        }
    }
    for (let i = 0; i < (pattern === 'speckle' ? 900 : 300); i++) {
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

        const dirt = groundTexture(th.floor[0], th.floor[1], 11 + seed, th.pattern);
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
        // big glowing pumpkins light the patch from inside; torches, shrines and candles light theirs
        const lit = th.border === 'pumpkins' ? [0, 1, 2, 3] : (th.litObstacles ?? []);
        for (const i of lit.slice(0, 4)) {
            const o = realm.obstacles[i];
            if (!o) continue;
            const l = new PointLight(th.lamp, 4, 5, 1.6);
            l.position.set(o.x * U, 1.4, o.y * U);
            this.group.add(l);
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
            // the near edge stays low and sparse: props right under the camera look huge
            this.line(-hw, hh + 0.4, hw, hh + 0.4, 2.6, () => 'candle_triple', () => rand() * 6, () => 0.7);
            for (const [x, z] of [[-hw - m, -hh - m], [hw + m, -hh - m], [-hw - m, hh + m], [hw + m, hh + m]]) this.place('fence_pillar', x, z);
            return;
        }
        if (style === 'pines') {
            // a thick autumn pine wall on three sides; low pumpkins on the near side
            const pine = () => ['tree_pine_orange_large', 'tree_pine_yellow_large', 'tree_pine_orange_medium', 'tree_pine_yellow_medium'][Math.floor(rand() * 4)];
            const yaw = () => rand() * Math.PI * 2;
            const size = () => 0.5 + rand() * 0.25;
            this.line(-hw - 0.4, -hh - 0.9, hw + 0.4, -hh - 0.9, 1.3, pine, yaw, size);
            this.line(-hw - 0.9, -hh, -hw - 0.9, hh, 1.3, pine, yaw, size);
            this.line(hw + 0.9, -hh, hw + 0.9, hh, 1.3, pine, yaw, size);
            this.line(-hw, hh + 0.4, hw, hh + 0.4, 1.0, () => (rand() < 0.5 ? 'pumpkin_yellow_small' : 'pumpkin_orange_small'), yaw);
            return;
        }
        if (style === 'posts') {
            // skull posts with low rails between, lantern posts at every third
            const seg = this.lengthX('fence_seperate');
            const rail = () => (rand() < 0.2 ? 'fence_seperate_broken' : 'fence_seperate');
            this.line(-hw, -hh - m, hw, -hh - m, seg, rail, () => 0);
            this.line(-hw - m, -hh, -hw - m, hh, seg, rail, () => Math.PI / 2);
            this.line(hw + m, -hh, hw + m, hh, seg, rail, () => Math.PI / 2);
            const post = (i: number) => (i % 3 === 0 ? 'post_lantern' : 'post_skull');
            this.line(-hw - m, -hh, -hw - m, hh, seg * 2, post, () => Math.PI / 2);
            this.line(hw + m, -hh, hw + m, hh, seg * 2, post, () => -Math.PI / 2);
            this.line(-hw, -hh - m, hw, -hh - m, seg * 2, post, () => 0);
            this.line(-hw, hh + 0.4, hw, hh + 0.4, 2.4, () => 'candle_melted', () => rand() * 6, () => 0.9);
            return;
        }
        if (style === 'barriers') {
            // stone barriers with columns, bones heaped along the near edge
            const seg = this.lengthX('d_barrier');
            const piece = () => (rand() < 0.25 ? 'd_barrier_half' : 'd_barrier');
            this.line(-hw, -hh - m, hw, -hh - m, seg, piece, () => 0);
            this.line(-hw - m, -hh, -hw - m, hh, seg, piece, () => Math.PI / 2);
            this.line(hw + m, -hh, hw + m, hh, seg, piece, () => Math.PI / 2);
            for (const [x, z] of [[-hw - m, -hh - m], [hw + m, -hh - m], [-hw - m, hh + m], [hw + m, hh + m]]) this.place('d_barrier_column', x, z);
            this.line(-hw, hh + 0.4, hw, hh + 0.4, 1.0, () => ['bone_A', 'bone_B', 'bone_C', 'skull'][Math.floor(rand() * 4)], () => rand() * 6);
            return;
        }
        if (style === 'walls') {
            // a stone hall: full wall at the far end with mounted torches, half walls on the sides
            // (low enough not to hide the fight), low barriers on the near edge
            const seg = this.lengthX('d_wall');
            this.line(-hw, -hh - 0.3, hw, -hh - 0.3, seg, () => 'd_wall', () => 0);
            const half = this.lengthX('d_wall_half');
            this.line(-hw - 0.3, -hh, -hw - 0.3, hh, half, () => 'd_wall_half', () => Math.PI / 2);
            this.line(hw + 0.3, -hh, hw + 0.3, hh, half, () => 'd_wall_half', () => -Math.PI / 2);
            this.line(-hw, hh + 0.4, hw, hh + 0.4, this.lengthX('d_barrier_half'), () => 'd_barrier_half', () => 0);
            for (const x of [-hw * 0.5, hw * 0.5]) {
                const t = this.place('d_torch_mounted', x, -hh - 0.05, 0);
                if (t) t.position.y = 1.2;
                const l = new PointLight(this.realm.theme.lamp, 5, 6, 1.6);
                l.position.set(x, 1.8, -hh + 0.4);
                this.group.add(l);
            }
            if (this.realm.id === 'keep') {
                for (const x of [-hw * 0.75, 0, hw * 0.75]) {
                    const b = this.place('d_banner_triple_red', x, -hh - 0.05, 0);
                    if (b) b.position.y = 0.4;
                }
            }
            return;
        }
        if (style === 'pillars') {
            // a ring of standing stones with melted candles between
            const stone = () => (rand() < 0.15 ? 'fence_pillar_broken' : 'pillar');
            const yaw = () => rand() * Math.PI * 2;
            this.line(-hw, -hh - 0.5, hw, -hh - 0.5, 1.6, stone, yaw, () => 0.8);
            this.line(-hw - 0.5, -hh, -hw - 0.5, hh, 1.6, stone, yaw, () => 0.8);
            this.line(hw + 0.5, -hh, hw + 0.5, hh, 1.6, stone, yaw, () => 0.8);
            this.line(-hw, hh + 0.4, hw, hh + 0.4, 1.6, () => 'candle_melted', () => rand() * 6);
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
        // low props along the near edge (small: they sit right under the camera)
        for (let i = 0; i < 10; i++) {
            this.place(th.nearProps[i % th.nearProps.length], (rand() * 2 - 1) * (hw + 2), hh + 0.8 + rand() * 1.5, rand() * Math.PI * 2, 0.75);
        }
        // lantern clusters by the corners (lit by the point lights)
        const corners = th.corners ?? { near: ['pumpkin_orange_jackolantern', 'pumpkin_yellow_jackolantern'], far: 'lantern_standing' };
        for (const sx of [-1, 1]) {
            this.place(corners.near[0], sx * (hw + 0.9), hh - 1.2, sx * 0.4);
            this.place(corners.near[1], sx * (hw + 1.4), hh - 0.5, sx * 0.8, 0.8);
            this.place(corners.far, sx * (hw + 0.8), -hh + 1.5, 0);
        }
        // a stone road down the middle
        if (th.road) {
            const step = this.lengthX(th.road[0]) * 0.95;
            this.line(0, hh - 0.2, 0, -hh + 0.2, step, () => th.road![Math.floor(rand() * th.road!.length)], () => Math.floor(rand() * 4) * (Math.PI / 2));
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

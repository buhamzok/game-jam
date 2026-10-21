/**
 * Title-screen backdrop: the three monsters idling side by side in the
 * graveyard at night, wearing their equipped skins, while the camera drifts.
 * Its own small renderer; created when the menu mounts, destroyed when it goes.
 */
import { PerspectiveCamera, PointLight, Scene, WebGLRenderer } from 'three';
import type { MonsterKind } from '../tuning.ts';
import { REALMS } from '../realms.ts';
import { skinById } from '../skins.ts';
import { store } from '../../state/store.ts';
import { getModel, type ModelKey } from './assets.ts';
import { Arena3D } from './arena3d.ts';
import { CharacterView, modelHeight } from './characterView.ts';
import { heroIdle } from './actors.ts';
import { HERO_HEIGHTS, HUNTER_HEIGHT } from './gameView.ts';

/** The lineup stands this far back from the arena center, so the camera stays inside the fence. */
const LINEUP_Z = -2.2;

/** Lineup: x position (meters), yaw toward the camera, how far forward. */
const LINEUP: { kind: MonsterKind; x: number; z: number; yaw: number }[] = [
    { kind: 'vampire', x: -1.45, z: -0.2, yaw: 0.35 },
    { kind: 'werewolf', x: 0, z: 0.35, yaw: 0 },
    { kind: 'stitched', x: 1.5, z: -0.25, yaw: -0.35 },
];

export class MenuScene {
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(36, 1, 0.1, 80);
    private readonly arena: Arena3D;
    private readonly chars: { kind: MonsterKind; view: CharacterView }[] = [];
    private readonly resizeObserver: ResizeObserver;
    private readonly unsubscribe: () => void;
    private skinKey = '';
    private last = performance.now();
    private t = 0;
    private portrait = true;

    constructor(private readonly host: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
        host.appendChild(this.renderer.domElement);

        const kaykitScale = HUNTER_HEIGHT / modelHeight(getModel('knight'));
        this.arena = new Arena3D(this.scene, kaykitScale, REALMS[0]);
        // a warm rim light from behind the lineup
        const rim = new PointLight(0xff9a3c, 14, 9, 1.4);
        rim.position.set(0, 2.4, -2.2);
        this.scene.add(rim);

        for (const spot of LINEUP) {
            const gltf = getModel(spot.kind as ModelKey);
            const scale = HERO_HEIGHTS[spot.kind] / modelHeight(gltf);
            const view = new CharacterView(gltf, scale, spot.kind === 'werewolf' ? 0.55 : 0.7);
            view.root.position.set(spot.x, 0, spot.z + LINEUP_Z);
            view.root.rotation.y = spot.yaw;
            view.play(heroIdle(spot.kind));
            // offset each idle so they do not move in step
            view.update(Math.random() * 2);
            this.scene.add(view.root);
            this.chars.push({ kind: spot.kind, view });
        }
        this.applySkins();
        this.unsubscribe = store.subscribe(() => this.applySkins());

        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.resize();
        this.renderer.setAnimationLoop((now) => this.frame(now));
    }

    /** Equipped skins show on the lineup (and update live from the shop). */
    private applySkins(): void {
        const s = store.get();
        const key = JSON.stringify(s.equippedSkins) + s.ownedSkins.join(',');
        if (key === this.skinKey) return;
        this.skinKey = key;
        for (const { kind, view } of this.chars) {
            const skin = skinById(s.equippedSkins[kind]);
            const on = skin && s.ownedSkins.includes(skin.id) ? skin : undefined;
            view.setSkin(on?.tint ?? 0xffffff, on?.amount ?? 0);
            view.setGlow(on?.glow ?? 0x000000, on?.glowAmount ?? 0);
        }
    }

    private resize(): void {
        const w = Math.max(1, this.host.clientWidth);
        const h = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.portrait = h > w;
        // keep the whole lineup (about 5 m wide) in frame on narrow screens
        const hFov = 2 * Math.atan(Math.tan((36 * Math.PI) / 360) * (16 / 9));
        this.camera.fov = Math.max(36, (2 * Math.atan(Math.tan(hFov / 2) / this.camera.aspect) * 180) / Math.PI * (this.portrait ? 0.62 : 1));
        this.camera.updateProjectionMatrix();
    }

    private frame(now: number): void {
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        this.step(dt);
    }

    /** Advance and draw (exposed so headless tests can step without rAF). */
    step(dt: number): void {
        this.t += dt;
        for (const { view } of this.chars) view.update(dt);
        // slow drift; on portrait the lineup sits in the upper middle, above the buttons
        // landscape: aim right of the lineup so it sits left of the menu panel
        const sway = Math.sin(this.t * 0.25) * 0.4;
        const dist = this.portrait ? 8.6 : 8.0;
        const aimX = this.portrait ? 0 : 1.5;
        this.camera.position.set(aimX * 0.6 + sway, this.portrait ? 1.0 : 1.5, LINEUP_Z + dist);
        this.camera.lookAt(aimX + sway * 0.3, this.portrait ? 0.45 : 1.0, LINEUP_Z);
        this.renderer.render(this.scene, this.camera);
    }

    destroy(): void {
        this.renderer.setAnimationLoop(null);
        this.resizeObserver.disconnect();
        this.unsubscribe();
        for (const { view } of this.chars) view.dispose();
        this.arena.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

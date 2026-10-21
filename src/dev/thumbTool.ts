/**
 * Dev-only art tool: the game tile's 3D hero shot. The three monsters posed
 * in the graveyard under a blood moon, the Werewolf mid-Full Moon with red
 * eyes. Renders to a square canvas; the title goes on in the trailer project
 * (trailer/src/Thumbnail.tsx) so the type matches the promo.
 *
 * Open: http://localhost:5173/?tool=thumb   (renders the default shot)
 * Script: window.__thumb.shot(overrides) -> PNG data URL (see trailer/capture/thumb.mjs).
 */
import {
    CanvasTexture,
    Color,
    DirectionalLight,
    FogExp2,
    PerspectiveCamera,
    PointLight,
    Scene,
    Sprite,
    SpriteMaterial,
    WebGLRenderer,
} from 'three';
import type { MonsterKind } from '../game/tuning.ts';
import { T } from '../game/tuning.ts';
import { REALMS } from '../game/realms.ts';
import { skinById } from '../game/skins.ts';
import { getModel, loadModels, type ModelKey } from '../game/view/assets.ts';
import { Arena3D } from '../game/view/arena3d.ts';
import { CharacterView, modelHeight } from '../game/view/characterView.ts';
import { HERO_HEIGHTS, HUNTER_HEIGHT } from '../game/view/gameView.ts';
import { WolfForm } from '../game/view/wolfForm.ts';

export interface Pose {
    clip: string;
    /** Fraction of the clip to freeze on. */
    at: number;
    x: number;
    z: number;
    yaw: number;
    /** Skin id, if any. */
    skin?: string;
    /** Werewolf only: Full Moon blend 0..1 (black fur, size, red eyes). */
    form?: number;
}

export interface Shot {
    size: number;
    poses: Record<MonsterKind, Pose>;
    cam: { x: number; y: number; z: number; tx: number; ty: number; tz: number; fov: number };
    moon: { x: number; y: number; z: number; size: number };
}

export const DEFAULT_SHOT: Shot = {
    size: 1024,
    poses: {
        werewolf: { clip: 'slam', at: 0.45, x: 0, z: 0.7, yaw: 0, form: 0.5 },
        vampire: { clip: 'cast', at: 0.75, x: -1.45, z: 0.0, yaw: 0.45 },
        stitched: { clip: 'hook', at: 0.5, x: 1.6, z: -0.6, yaw: -0.5 },
    },
    cam: { x: 0, y: 0.85, z: 5.0, tx: 0, ty: 1.0, tz: 0, fov: 44 },
    moon: { x: -3.0, y: 6.6, z: -12, size: 6.5 },
};

function moonTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    // halo
    const halo = g.createRadialGradient(256, 256, 60, 256, 256, 256);
    halo.addColorStop(0, 'rgba(255,90,40,0.55)');
    halo.addColorStop(0.45, 'rgba(200,30,40,0.22)');
    halo.addColorStop(1, 'rgba(120,0,40,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, 512, 512);
    // disc
    const disc = g.createRadialGradient(230, 220, 10, 256, 256, 120);
    disc.addColorStop(0, '#ffd2a0');
    disc.addColorStop(0.55, '#ff7a3c');
    disc.addColorStop(1, '#c2262e');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(256, 256, 120, 0, Math.PI * 2);
    g.fill();
    // a few soft craters
    g.fillStyle = 'rgba(150,30,30,0.28)';
    for (const [x, y, r] of [
        [215, 225, 22],
        [290, 280, 30],
        [262, 190, 13],
        [205, 300, 15],
        [310, 215, 10],
    ]) {
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
    }
    return new CanvasTexture(c);
}

export async function runThumbTool(): Promise<void> {
    document.body.style.cssText = 'margin:0;background:#0d0a16;display:flex;align-items:center;justify-content:center;height:100vh';
    await loadModels();
    const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    document.body.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:min(100vw,100vh);height:min(100vw,100vh)';

    const scene = new Scene();
    const kaykitScale = HUNTER_HEIGHT / modelHeight(getModel('knight'));
    new Arena3D(scene, kaykitScale, REALMS[0]);
    scene.background = new Color(0x120a1c);
    scene.fog = new FogExp2(0x1a0d22, 0.045);

    const moon = new Sprite(new SpriteMaterial({ map: moonTexture(), transparent: true, depthWrite: false, fog: false }));
    scene.add(moon);
    // red rim from the moon side, violet fill from the left, warm key from the front
    const rim = new DirectionalLight(0xff4a3a, 2.6);
    rim.position.set(1.5, 4, -6);
    const fill = new PointLight(0x8b5cf6, 18, 10, 1.3);
    fill.position.set(-3, 2.2, 1.5);
    const key = new PointLight(0xffb070, 16, 9, 1.4);
    key.position.set(0.6, 2.4, 3.6);
    scene.add(rim, fill, key);

    const camera = new PerspectiveCamera(42, 1, 0.1, 100);
    const chars = new Map<MonsterKind, { view: CharacterView; form: WolfForm | null }>();
    // fresh characters for every shot: a pose change on a live mixer would cross-fade from the last one
    const build = () => {
        for (const { view, form } of chars.values()) {
            form?.dispose();
            view.dispose();
        }
        chars.clear();
        for (const kind of ['werewolf', 'vampire', 'stitched'] as MonsterKind[]) {
            const gltf = getModel(kind as ModelKey);
            const view = new CharacterView(gltf, HERO_HEIGHTS[kind] / modelHeight(gltf), kind === 'werewolf' ? 0.55 : 0.7);
            scene.add(view.root);
            chars.set(kind, { view, form: kind === 'werewolf' ? new WolfForm(view.model) : null });
        }
    };

    const shot = (over: Partial<Shot> = {}): string => {
        const s: Shot = { ...DEFAULT_SHOT, ...over, poses: { ...DEFAULT_SHOT.poses, ...(over.poses ?? {}) } };
        renderer.setSize(s.size, s.size, false);
        build();
        for (const [kind, { view, form }] of chars) {
            const p = s.poses[kind];
            view.root.position.set(p.x, 0, p.z);
            view.root.rotation.y = p.yaw;
            view.play({ clip: p.clip, speed: 0, start: p.at }, `${p.clip}@${p.at}`);
            view.update(0);
            const skin = skinById(p.skin);
            view.setSkin(skin?.tint ?? 0xffffff, skin?.amount ?? 0);
            if (form) {
                const f = p.form ?? 0;
                view.setSize(1 + (T.trans.werewolf.scale - 1) * f);
                view.setTint(0x000000, f);
                view.setGlow(0x312e81, 0.12 * f);
                form.set(f > 0 ? 1 : 0);
            }
        }
        moon.position.set(s.moon.x, s.moon.y, s.moon.z);
        moon.scale.setScalar(s.moon.size);
        camera.fov = s.cam.fov;
        camera.aspect = 1;
        camera.updateProjectionMatrix();
        camera.position.set(s.cam.x, s.cam.y, s.cam.z);
        camera.lookAt(s.cam.tx, s.cam.ty, s.cam.tz);
        renderer.render(scene, camera);
        return renderer.domElement.toDataURL('image/png');
    };
    (window as unknown as { __thumb?: unknown }).__thumb = { shot, DEFAULT_SHOT };
    shot();
}

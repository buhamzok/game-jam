/**
 * The 3D view: renderer, camera rig, arena and one view per character. Each
 * frame it steps the simulation, then mirrors its state into the scene.
 *
 * Camera: 3/4 top-down, following the player. The player sits above screen
 * center because the bottom of the phone is under the thumbs.
 */
import { PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { T } from '../tuning.ts';
import { World } from '../world.ts';
import type { HunterKind } from '../hunter.ts';
import { getModel, type ModelKey } from './assets.ts';
import { store } from '../../state/store.ts';
import { Fx3D, U } from './fx3d.ts';
import { Arena3D } from './arena3d.ts';
import { HeroView, HunterView } from './actors.ts';
import { BoltsView } from './bolts.ts';
import { modelHeight } from './characterView.ts';
const CAM = {
    fov: 42,
    /** Camera offset from its target, meters. */
    offset: new Vector3(0, 10, 9.5),
    /** Look this far toward the camera from the player, which lifts the player up the screen. */
    lookAhead: 0.7,
    lerp: 7,
    shake: 0.35,
};

/** Character heights in meters. */
const HUNTER_HEIGHT = 1.7;
/** Height above 1 for heroes that should read bigger (the vampire stays lean). */
const HERO_HEIGHTS = { werewolf: 1.85, vampire: 1.7, stitched: 2.3 } as const;

const MAX_DT = 1 / 20;

export class GameView {
    readonly world: World;
    private readonly renderer: WebGLRenderer;
    private readonly scene = new Scene();
    private readonly camera = new PerspectiveCamera(CAM.fov, 1, 0.1, 80);
    private readonly fx = new Fx3D();
    private readonly arena: Arena3D;
    /** One mirror view per team member; only the active monster is visible. */
    private readonly heroes: HeroView[] = [];
    private readonly hunters = new Map<number, HunterView>();
    private readonly bolts = new BoltsView();
    private readonly scales: Record<HunterKind, number>;
    private readonly camTarget = new Vector3();
    private readonly flashEl: HTMLDivElement;
    private readonly witchEl: HTMLDivElement;
    private readonly resizeObserver: ResizeObserver;
    private flashAlpha = 0;
    private last = 0;
    private paused = false;
    private landscape = false;
    private shownHero = -1;

    constructor(private readonly host: HTMLElement) {
        this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
        this.renderer.domElement.style.display = 'block';
        host.appendChild(this.renderer.domElement);

        // one scale for every KayKit asset, taken from the knight, keeps props and people in proportion
        const kaykitScale = HUNTER_HEIGHT / modelHeight(getModel('knight'));
        const scaleFor = (key: ModelKey, height: number) => height / modelHeight(getModel(key));
        this.scales = { knight: kaykitScale, barbarian: scaleFor('barbarian', HUNTER_HEIGHT), rogue: kaykitScale, mage: kaykitScale, boss: scaleFor('bossgolem', 3.2) };

        this.arena = new Arena3D(this.scene, kaykitScale);
        this.scene.add(this.fx.group, this.bolts.group);
        this.world = new World(this.fx);
        for (const kind of this.world.player.team.map((m) => m.kind)) {
            const height = HERO_HEIGHTS[kind as keyof typeof HERO_HEIGHTS] ?? HERO_HEIGHTS.werewolf;
            const hero = new HeroView(kind, getModel(kind as ModelKey), scaleFor(kind as ModelKey, height));
            this.heroes.push(hero);
            this.scene.add(hero.char.root);
        }

        this.flashEl = this.overlay();
        this.witchEl = this.overlay();
        this.witchEl.style.background = 'radial-gradient(ellipse at center, rgba(76,29,149,0.18) 40%, rgba(76,29,149,0.75) 100%)';
        this.fx.onFlash = (color, alpha) => {
            this.flashEl.style.background = `#${color.toString(16).padStart(6, '0')}`;
            this.flashAlpha = Math.max(this.flashAlpha, alpha);
        };

        this.camTarget.set(this.world.player.x * U, 0, this.world.player.y * U);
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.resize();

        this.last = performance.now();
        this.renderer.setAnimationLoop((now) => this.frame(now));
    }

    private overlay(): HTMLDivElement {
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;';
        this.host.appendChild(el);
        return el;
    }

    setPaused(paused: boolean): void {
        this.paused = paused;
        this.last = performance.now();
    }

    private resize(): void {
        const w = Math.max(1, this.host.clientWidth);
        const h = Math.max(1, this.host.clientHeight);
        this.renderer.setSize(w, h, false);
        this.renderer.domElement.style.width = '100%';
        this.renderer.domElement.style.height = '100%';
        this.camera.aspect = w / h;
        this.landscape = w > h;
        // keep the same horizontal field on every phone: narrow screens get a taller fov
        const hFov = 2 * Math.atan(Math.tan((CAM.fov * Math.PI) / 360) * (9 / 16));
        this.camera.fov = Math.max(CAM.fov, (2 * Math.atan(Math.tan(hFov / 2) / this.camera.aspect) * 180) / Math.PI);
        this.camera.updateProjectionMatrix();
        const projPx = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
        this.fx.setProjection(projPx);
    }

    /** Advance the game by `dt` seconds and draw. Exposed so tests can step without rAF. */
    step(dt: number): void {
        const realDt = Math.min(dt, MAX_DT);
        this.world.update(realDt);
        this.fx.listenerX = this.world.player.x;
        const animDt = realDt * this.world.simScale();
        const enemyAnimDt = animDt * (this.world.witching > 0 ? T.witching.enemyTimeScale : 1);

        const active = this.world.player.active;
        for (let i = 0; i < this.heroes.length; i++) {
            const hero = this.heroes[i];
            const on = i === active;
            hero.char.root.visible = on;
            if (on) {
                hero.update(this.world.player, animDt, realDt);
            } else {
                // keep the yaw tracking the shared facing so swaps look continuous
                hero.idlePose(this.world.player, realDt);
            }
        }
        this.shownHero = active;
        this.syncHunters(enemyAnimDt, realDt);
        this.bolts.sync(this.world.bolts);
        this.fx.update(this.world.witching > 0 ? animDt * 0.5 : animDt, realDt);
        this.updateCamera(realDt);
        this.updateOverlays(realDt);
        this.renderer.render(this.scene, this.camera);
    }

    private frame(now: number): void {
        const dt = (now - this.last) / 1000;
        this.last = now;
        if (this.paused) return;
        this.step(dt);
    }

    private syncHunters(animDt: number, realDt: number): void {
        const alive = new Set<number>();
        for (const h of this.world.hunters) {
            alive.add(h.id);
            let v = this.hunters.get(h.id);
            if (!v) {
                v = new HunterView(getModel(h.kind === 'boss' ? 'bossgolem' : h.kind), this.scales[h.kind], h.kind);
                this.hunters.set(h.id, v);
                this.scene.add(v.char.root, v.telegraph);
            }
            v.update(h, animDt, realDt);
        }
        for (const [id, v] of this.hunters) {
            if (!alive.has(id)) {
                v.dispose();
                this.hunters.delete(id);
            }
        }
    }

    private updateCamera(dt: number): void {
        const p = this.world.player;
        const hw = (T.arena.w / 2) * U;
        const hh = (T.arena.h / 2) * U;
        const tx = Math.max(-hw + 2, Math.min(hw - 2, p.x * U));
        const tz = Math.max(-hh + 1, Math.min(hh - 0.5, p.y * U));
        const k = Math.min(1, CAM.lerp * dt);
        this.camTarget.x += (tx - this.camTarget.x) * k;
        this.camTarget.z += (tz - this.camTarget.z) * k;

        const state = store.get();
        const s = (state.shake ? 1 : 0) * this.fx.trauma * this.fx.trauma * CAM.shake;
        const jx = (Math.random() * 2 - 1) * s;
        const jy = (Math.random() * 2 - 1) * s;
        this.camera.position.set(this.camTarget.x + CAM.offset.x + jx, CAM.offset.y + jy, this.camTarget.z + CAM.offset.z);
        this.camera.lookAt(this.camTarget.x + jx, 0, this.camTarget.z + (this.landscape ? 0.1 : CAM.lookAhead));
    }

    private updateOverlays(dt: number): void {
        if (!store.get().flash) this.flashAlpha = 0;
        this.flashAlpha = Math.max(0, this.flashAlpha - dt * 2.5);
        this.flashEl.style.opacity = String(this.flashAlpha);
        const w = this.world.witching;
        const t = w > 0 ? Math.min(1, w / 0.3, (T.witching.duration - w) / 0.1 + 0.3) : 0;
        this.witchEl.style.opacity = String(t);
    }

    destroy(): void {
        this.renderer.setAnimationLoop(null);
        this.resizeObserver.disconnect();
        for (const v of this.hunters.values()) v.dispose();
        this.hunters.clear();
        this.bolts.dispose();
        for (const h of this.heroes) h.dispose();
        this.fx.dispose();
        this.arena.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
        this.flashEl.remove();
        this.witchEl.remove();
    }
}


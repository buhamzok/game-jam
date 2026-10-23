/**
 * The health potion that may wait by a realm portal: a round red bottle with
 * a cork, glowing and bobbing over a soft red pool of light. Hidden when the
 * world has no potion.
 */
import {
    AdditiveBlending,
    CanvasTexture,
    CircleGeometry,
    CylinderGeometry,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    PointLight,
    SphereGeometry,
} from 'three';
import { U } from './fx3d.ts';

function glowTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,80,90,0.9)');
    grad.addColorStop(0.5, 'rgba(220,30,50,0.35)');
    grad.addColorStop(1, 'rgba(120,0,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
}

export class PotionView {
    readonly group = new Group();
    private readonly bottle = new Group();
    private readonly light = new PointLight(0xff3040, 3, 3.5, 1.6);
    private readonly glowTex = glowTexture();
    private readonly disposables: { dispose(): void }[] = [];
    private t = 0;

    constructor() {
        const glass = new MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xc0101e, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 });
        const neckMat = new MeshStandardMaterial({ color: 0xffd6d6, roughness: 0.3, transparent: true, opacity: 0.6 });
        const cork = new MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.9 });
        const pool = new MeshBasicMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: AdditiveBlending });
        const body = new SphereGeometry(0.17, 18, 14);
        const neck = new CylinderGeometry(0.055, 0.07, 0.14, 12);
        const top = new CylinderGeometry(0.065, 0.06, 0.07, 10);
        const ground = new CircleGeometry(0.6, 24);
        this.disposables.push(glass, neckMat, cork, pool, body, neck, top, ground, this.glowTex);

        const b = new Mesh(body, glass);
        b.position.y = 0.17;
        const n = new Mesh(neck, neckMat);
        n.position.y = 0.38;
        const c = new Mesh(top, cork);
        c.position.y = 0.48;
        this.bottle.add(b, n, c);
        const g = new Mesh(ground, pool);
        g.rotation.x = -Math.PI / 2;
        g.position.y = 0.03;
        this.light.position.y = 0.6;
        // about knee-high next to a monster, so it reads from the game camera
        this.bottle.scale.setScalar(1.7);
        this.group.add(this.bottle, g, this.light);
        this.group.visible = false;
    }

    update(potion: { x: number; y: number } | null, realDt: number): void {
        this.group.visible = !!potion;
        if (!potion) return;
        this.t += realDt;
        this.group.position.set(potion.x * U, 0, potion.y * U);
        // bob and turn so it catches the eye
        this.bottle.position.y = 0.3 + Math.sin(this.t * 3) * 0.1;
        this.bottle.rotation.y = this.t * 1.6;
        this.light.intensity = 2.6 + Math.sin(this.t * 5) * 0.6;
    }

    dispose(): void {
        this.group.removeFromParent();
        for (const d of this.disposables) d.dispose();
    }
}

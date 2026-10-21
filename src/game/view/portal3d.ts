/**
 * The realm portal: a standing ring of violet light with a swirling core, a
 * glow pool on the ground and its own light. It grows in when the portal
 * opens and spins while it waits for the player.
 */
import {
    AdditiveBlending,
    CanvasTexture,
    CircleGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    PointLight,
    TorusGeometry,
} from 'three';
import { U } from './fx3d.ts';

function swirlTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,240,255,1)');
    grad.addColorStop(0.35, 'rgba(192,132,252,0.9)');
    grad.addColorStop(0.8, 'rgba(76,29,149,0.6)');
    grad.addColorStop(1, 'rgba(20,0,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    // spiral arms
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 3;
    for (let arm = 0; arm < 4; arm++) {
        g.beginPath();
        for (let t = 0; t < 1; t += 0.02) {
            const a = arm * (Math.PI / 2) + t * 5;
            const r = 6 + t * 54;
            const x = 64 + Math.cos(a) * r;
            const y = 64 + Math.sin(a) * r;
            if (t === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.stroke();
    }
    return new CanvasTexture(c);
}

export class PortalView {
    readonly group = new Group();
    private readonly ring: Mesh;
    private readonly core: Mesh;
    private readonly pool: Mesh;
    private readonly light: PointLight;
    private readonly tex = swirlTexture();
    private grow = 0;

    constructor() {
        const ringMat = new MeshBasicMaterial({ color: 0xc084fc, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
        this.ring = new Mesh(new TorusGeometry(0.85, 0.09, 12, 48), ringMat);
        const coreMat = new MeshBasicMaterial({ map: this.tex, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
        this.core = new Mesh(new CircleGeometry(0.8, 40), coreMat);
        const poolMat = new MeshBasicMaterial({ map: this.tex, color: 0xa855f7, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });
        this.pool = new Mesh(new CircleGeometry(1.2, 40), poolMat);
        this.pool.rotation.x = -Math.PI / 2;
        this.pool.position.y = 0.03;
        const stand = new Group();
        stand.position.y = 1.05;
        // face the camera (it looks down from +z), tilted back a little
        stand.rotation.x = -0.35;
        stand.add(this.ring, this.core);
        this.light = new PointLight(0xc084fc, 0, 8, 1.4);
        this.light.position.y = 1.2;
        this.group.add(stand, this.pool, this.light);
        this.group.visible = false;
    }

    /** `at` in sim units, or null when there is no portal. */
    update(at: { x: number; y: number } | null, realDt: number): void {
        if (!at) {
            this.group.visible = false;
            this.grow = 0;
            return;
        }
        this.group.visible = true;
        this.group.position.set(at.x * U, 0, at.y * U);
        this.grow = Math.min(1, this.grow + realDt * 1.5);
        const s = 1 - (1 - this.grow) ** 3;
        const pulse = 1 + 0.05 * Math.sin(performance.now() / 180);
        this.ring.scale.setScalar(s * pulse);
        this.core.scale.setScalar(s);
        this.core.rotation.z -= realDt * 2.2;
        this.pool.scale.setScalar(s * pulse);
        this.pool.rotation.z += realDt * 0.8;
        this.light.intensity = 9 * s;
    }

    dispose(): void {
        this.group.removeFromParent();
        for (const m of [this.ring, this.core, this.pool]) {
            m.geometry.dispose();
            (m.material as MeshBasicMaterial).dispose();
        }
        this.tex.dispose();
    }
}

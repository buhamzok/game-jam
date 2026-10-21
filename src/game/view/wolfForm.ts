/**
 * Full Moon extra for the Werewolf: glowing red eyes on the head bone. They
 * ride the skeleton, so they follow every animation, and only show while the
 * transformation is up.
 *
 * Offsets are in the head bone's own units (the Meshy rig is in centimeters
 * before the model scale): +Y runs up the bone, +Z is the face.
 */
import {
    AdditiveBlending,
    CanvasTexture,
    Group,
    Mesh,
    MeshBasicMaterial,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    type Object3D,
} from 'three';

/** Tuned against close-up renders: the brow sits at head-space y 20..28, z ~35, just above the muzzle. */
export const WOLF_FORM = {
    eye: { x: 8, y: 23, z: 37, r: 3, glow: 30 },
};

function glowTexture(): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,90,90,1)');
    grad.addColorStop(0.35, 'rgba(255,30,30,0.6)');
    grad.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
}

export class WolfForm {
    private readonly parts: Object3D[] = [];
    private readonly eyeMat = new MeshBasicMaterial({ color: 0xff2a2a });
    private readonly glowTex = glowTexture();
    // the halo draws over the head so the eyes read from the top-down camera
    private readonly glowMat = new SpriteMaterial({ map: this.glowTex, color: 0xff3030, blending: AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, opacity: 0.85 });
    private readonly eyeGeo: SphereGeometry;
    private shown = -1;

    constructor(model: Object3D) {
        const f = WOLF_FORM;
        this.eyeGeo = new SphereGeometry(f.eye.r, 12, 8);

        const head = model.getObjectByName('Head');
        if (head) {
            for (const side of [-1, 1]) {
                const eye = new Group();
                eye.position.set(side * f.eye.x, f.eye.y, f.eye.z);
                eye.add(new Mesh(this.eyeGeo, this.eyeMat));
                const halo = new Sprite(this.glowMat);
                halo.scale.setScalar(f.eye.glow);
                halo.renderOrder = 10;
                eye.add(halo);
                head.add(eye);
                this.parts.push(eye);
            }
        }
        this.set(0);
    }

    /** 0..1 transformation blend: the eyes grow in with the black fur. */
    set(blend: number): void {
        const s = blend < 0.05 ? 0 : Math.min(1, blend * 1.4);
        if (s === this.shown) return;
        this.shown = s;
        for (const p of this.parts) {
            p.visible = s > 0;
            p.scale.setScalar(Math.max(0.001, s));
        }
    }

    dispose(): void {
        for (const p of this.parts) p.removeFromParent();
        this.eyeGeo.dispose();
        this.eyeMat.dispose();
        this.glowMat.dispose();
        this.glowTex.dispose();
    }
}

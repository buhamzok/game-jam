/**
 * Full Moon extras for the Werewolf: glowing red eyes on the head bone and
 * silver claws on both hand bones. They ride the skeleton, so they follow
 * every animation, and only show while the transformation is up.
 *
 * Offsets are in the bones' own units (the Meshy rig is in centimeters before
 * the model scale): +Y runs along each bone, the head's +Z is the face.
 */
import {
    AdditiveBlending,
    CanvasTexture,
    ConeGeometry,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    SphereGeometry,
    Sprite,
    SpriteMaterial,
    type Object3D,
} from 'three';

/** Tuned against close-up renders: the brow sits at head-space y 20..28, z ~35, just above the muzzle. */
export const WOLF_FORM = {
    eye: { x: 8, y: 23, z: 37, r: 3, glow: 30 },
    claw: { length: 21, radius: 2.5, along: 13, spread: 4.6, forward: 2.5, splay: 0.24, count: 3 },
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
    private readonly clawMat = new MeshStandardMaterial({ color: 0xe8ebf0, metalness: 0.55, roughness: 0.22, emissive: 0x9aa6b8, emissiveIntensity: 0.35 });
    private readonly eyeGeo: SphereGeometry;
    private readonly clawGeo: ConeGeometry;
    private shown = -1;

    constructor(model: Object3D) {
        const f = WOLF_FORM;
        this.eyeGeo = new SphereGeometry(f.eye.r, 12, 8);
        this.clawGeo = new ConeGeometry(f.claw.radius, f.claw.length, 8);
        // cone tip along +Y, base at the origin
        this.clawGeo.translate(0, f.claw.length / 2, 0);

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
        for (const name of ['LeftHand', 'RightHand']) {
            const hand = model.getObjectByName(name);
            if (!hand) continue;
            const claws = new Group();
            claws.position.set(0, f.claw.along, f.claw.forward);
            for (let i = 0; i < f.claw.count; i++) {
                const k = i - (f.claw.count - 1) / 2;
                const claw = new Mesh(this.clawGeo, this.clawMat);
                claw.position.x = k * f.claw.spread;
                // fan out a little and curl forward like hooks
                claw.rotation.z = -k * f.claw.splay;
                claw.rotation.x = 0.35;
                claws.add(claw);
            }
            hand.add(claws);
            this.parts.push(claws);
        }
        this.set(0);
    }

    /** 0..1 transformation blend: the eyes and claws grow in with the black fur. */
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
        this.clawGeo.dispose();
        this.eyeMat.dispose();
        this.glowMat.dispose();
        this.glowTex.dispose();
        this.clawMat.dispose();
    }
}

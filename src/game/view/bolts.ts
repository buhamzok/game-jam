/**
 * Crossbow bolts in flight: one glowing streak per bolt (orange for the
 * rogues', purple once a parry sends it back), mirrored from World.bolts.
 */
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { C } from '../fxTypes.ts';
import type { Bolt } from '../world.ts';
import { U } from './fx3d.ts';

/** Bolt flight height, meters (chest level of the hunters). */
const BOLT_Y = 1.0;

export class BoltsView {
    readonly group = new Group();
    private readonly glowGeo = new PlaneGeometry(1.0, 0.2);
    private readonly coreGeo = new PlaneGeometry(0.7, 0.06);
    private readonly enemyMat = new MeshBasicMaterial({ color: C.bolt, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    private readonly playerMat = new MeshBasicMaterial({ color: C.counter, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    private readonly coreMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    private readonly views = new Map<number, { root: Group; glow: Mesh }>();
    private readonly liveIds = new Set<number>();

    constructor() {
        // lie flat on the ground plane, long axis along +X
        this.glowGeo.rotateX(-Math.PI / 2);
        this.coreGeo.rotateX(-Math.PI / 2);
    }

    sync(bolts: Bolt[]): void {
        const live = this.liveIds;
        live.clear();
        for (const b of bolts) {
            live.add(b.id);
            let v = this.views.get(b.id);
            if (!v) {
                const root = new Group();
                const glow = new Mesh(this.glowGeo, this.enemyMat);
                root.add(glow, new Mesh(this.coreGeo, this.coreMat));
                this.group.add(root);
                v = { root, glow };
                this.views.set(b.id, v);
            }
            v.glow.material = b.owner === 'enemy' ? this.enemyMat : this.playerMat;
            v.root.position.set(b.x * U, BOLT_Y, b.y * U);
            v.root.rotation.y = -Math.atan2(b.vy, b.vx);
        }
        for (const [id, v] of this.views) {
            if (live.has(id)) continue;
            v.root.removeFromParent();
            this.views.delete(id);
        }
    }

    dispose(): void {
        this.group.removeFromParent();
        this.views.clear();
        this.glowGeo.dispose();
        this.coreGeo.dispose();
        this.enemyMat.dispose();
        this.playerMat.dispose();
        this.coreMat.dispose();
    }
}

/**
 * The Vampire's bat swarm: a cloud of flapping bats around the body, drawn
 * with two instanced meshes (bodies and wings), so it costs two draw calls
 * whatever the count. Used for the Swarm Slam special and the Night Swarm
 * transformation. Positions are local to the hero root (+Z is forward).
 */
import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Euler,
    Group,
    InstancedMesh,
    Matrix4,
    MeshBasicMaterial,
    Quaternion,
    SphereGeometry,
    Vector3,
} from 'three';

const COUNT = 22;

/** Where the cloud should be; the swarm eases toward these every frame. */
export interface SwarmShape {
    /** Orbit radius, meters. */
    spread: number;
    /** Average height above the ground, meters. */
    height: number;
    /** Cloud center pushed this far forward (attacks), meters. */
    forward: number;
}

interface Bat {
    phase: number;
    orbit: number;
    spin: number;
    flap: number;
    bob: number;
}

function wingGeometry(): BufferGeometry {
    // one right wing in the XZ plane: root along the body, tip out on +X, scalloped trailing edge
    const v = [0, 0, 0.05, 0.24, 0, 0.02, 0, 0, -0.05, 0, 0, -0.05, 0.24, 0, 0.02, 0.14, 0, -0.08];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
    return g;
}

export class BatSwarm {
    readonly group = new Group();
    private readonly bodies: InstancedMesh;
    private readonly wings: InstancedMesh;
    private readonly bats: Bat[] = [];
    private readonly shape: SwarmShape = { spread: 0.2, height: 1, forward: 0 };
    /** 0..1, how formed the swarm is; bats shrink into the center as it fades. */
    private presence = 0;
    private time = 0;

    private readonly m = new Matrix4();
    private readonly w = new Matrix4();
    private readonly q = new Quaternion();
    private readonly e = new Euler();
    private readonly pos = new Vector3();
    private readonly scl = new Vector3();

    constructor() {
        const bodyGeo = new SphereGeometry(0.06, 6, 4);
        bodyGeo.scale(0.8, 0.7, 1.5);
        this.bodies = new InstancedMesh(bodyGeo, new MeshBasicMaterial({ color: 0x1c0408 }), COUNT);
        this.wings = new InstancedMesh(wingGeometry(), new MeshBasicMaterial({ color: 0xbe123c, side: DoubleSide }), COUNT * 2);
        this.bodies.frustumCulled = false;
        this.wings.frustumCulled = false;
        this.group.add(this.bodies, this.wings);
        this.group.visible = false;
        for (let i = 0; i < COUNT; i++) {
            this.bats.push({
                phase: Math.random() * Math.PI * 2,
                orbit: 0.45 + Math.random() * 0.55,
                spin: (2.4 + Math.random() * 1.8) * (Math.random() < 0.5 ? -1 : 1),
                flap: 13 + Math.random() * 6,
                bob: Math.random() * Math.PI * 2,
            });
        }
    }

    /**
     * @param on whether the swarm should be formed
     * @param target cloud shape to ease toward
     * @param dt real seconds (the swarm keeps flapping through hitstop)
     */
    update(on: boolean, target: SwarmShape, dt: number): void {
        this.presence += ((on ? 1 : 0) - this.presence) * Math.min(1, dt * (on ? 10 : 6));
        this.group.visible = this.presence > 0.02;
        if (!this.group.visible) return;
        this.time += dt;
        const k = Math.min(1, dt * 8);
        this.shape.spread += (target.spread - this.shape.spread) * k;
        this.shape.height += (target.height - this.shape.height) * k;
        this.shape.forward += (target.forward - this.shape.forward) * k;

        const t = this.time;
        const size = 0.8 + this.presence * 0.9;
        for (let i = 0; i < COUNT; i++) {
            const b = this.bats[i];
            const ang = b.phase + t * b.spin;
            const r = b.orbit * this.shape.spread * this.presence;
            this.pos.set(Math.cos(ang) * r, this.shape.height + Math.sin(t * 1.9 + b.bob) * 0.22, Math.sin(ang) * r + this.shape.forward);
            // face along the orbit
            const yaw = Math.atan2(-Math.sin(ang) * Math.sign(b.spin), Math.cos(ang) * Math.sign(b.spin));
            this.e.set(0, yaw, 0);
            this.q.setFromEuler(this.e);
            this.scl.setScalar(size);
            this.m.compose(this.pos, this.q, this.scl);
            this.bodies.setMatrixAt(i, this.m);

            const flap = Math.sin(t * b.flap + b.phase) * 0.9;
            for (let s = 0; s < 2; s++) {
                const side = s === 0 ? 1 : -1;
                this.e.set(0, 0, flap * side);
                this.q.setFromEuler(this.e);
                this.w.compose(this.pos.set(0, 0, 0), this.q, this.scl.set(side, 1, 1));
                this.w.premultiply(this.m);
                this.wings.setMatrixAt(i * 2 + s, this.w);
            }
        }
        this.bodies.instanceMatrix.needsUpdate = true;
        this.wings.instanceMatrix.needsUpdate = true;
    }

    dispose(): void {
        this.bodies.geometry.dispose();
        (this.bodies.material as MeshBasicMaterial).dispose();
        this.wings.geometry.dispose();
        (this.wings.material as MeshBasicMaterial).dispose();
        this.bodies.dispose();
        this.wings.dispose();
        this.group.removeFromParent();
    }
}

/**
 * Three.js implementation of the simulation's Fx interface: particles, slash
 * arcs, shockwave rings and floating text, plus the hitstop and shake values
 * the simulation and camera read. Sim coordinates (units, y down) map to
 * world meters on the ground plane: X = x * U, Z = y * U.
 */
import {
    AdditiveBlending,
    BufferAttribute,
    BufferGeometry,
    CanvasTexture,
    Color,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    NormalBlending,
    PlaneGeometry,
    Points,
    RingGeometry,
    ShaderMaterial,
    Sprite,
    SpriteMaterial,
    type Blending,
} from 'three';
import { C, type Fx, type SoundOpts } from '../fxTypes.ts';
import { audio, type SfxName } from '../audio.ts';

/** Meters per sim unit. */
export const U = 0.01;
/** Height of hit effects above the ground (chest level), meters. */
const FX_Y = 0.75;

const MAX_PARTICLES = 600;

class ParticleLayer {
    readonly points: Points;
    private readonly pos = new Float32Array(MAX_PARTICLES * 3);
    private readonly col = new Float32Array(MAX_PARTICLES * 3);
    private readonly size = new Float32Array(MAX_PARTICLES);
    private readonly alpha = new Float32Array(MAX_PARTICLES);
    private readonly geo = new BufferGeometry();
    private readonly mat: ShaderMaterial;
    private list: { x: number; y: number; z: number; vx: number; vy: number; vz: number; drag: number; size: number; r: number; g: number; b: number; life: number; max: number; shrink: boolean; peak: number; gravity: number; land?: (x: number, z: number) => void }[] = [];

    constructor(blending: Blending) {
        this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
        this.geo.setAttribute('pcolor', new BufferAttribute(this.col, 3));
        this.geo.setAttribute('psize', new BufferAttribute(this.size, 1));
        this.geo.setAttribute('palpha', new BufferAttribute(this.alpha, 1));
        this.mat = new ShaderMaterial({
            uniforms: { uProj: { value: 800 } },
            vertexShader: /* glsl */ `
                attribute vec3 pcolor;
                attribute float psize;
                attribute float palpha;
                uniform float uProj;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    vColor = pcolor;
                    vAlpha = palpha;
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = psize * uProj / -mv.z;
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: /* glsl */ `
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    if (d > 0.5) discard;
                    gl_FragColor = vec4(vColor, vAlpha * smoothstep(0.5, 0.1, d));
                }`,
            transparent: true,
            depthWrite: false,
            blending,
        });
        this.points = new Points(this.geo, this.mat);
        this.points.frustumCulled = false;
    }

    /** Pixel scale for point sizes: viewport height / (2 tan(fov / 2)). */
    setProjection(v: number): void {
        this.mat.uniforms.uProj.value = v;
    }

    /** `land` turns the particle into a ground hit: it is called once where it touches down, and the particle ends. */
    add(x: number, y: number, z: number, vx: number, vy: number, vz: number, drag: number, size: number, color: Color, life: number, shrink: boolean, peak = 1, gravity = 3, land?: (x: number, z: number) => void): void {
        if (this.list.length >= MAX_PARTICLES) this.list.shift();
        this.list.push({ x, y, z, vx, vy, vz, drag, size, r: color.r, g: color.g, b: color.b, life, max: life, shrink, peak, gravity, land });
    }

    update(dt: number): void {
        if (dt > 0) {
            for (const p of this.list) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.z += p.vz * dt;
                const k = Math.exp(-p.drag * dt);
                p.vx *= k;
                p.vz *= k;
                p.vy = p.vy * k - p.gravity * dt;
                if (p.y < 0.05) {
                    p.y = 0.05;
                    p.vy = 0;
                    if (p.land) {
                        p.land(p.x, p.z);
                        p.land = undefined;
                        p.life = 0;
                    }
                }
                p.life -= dt;
            }
            this.list = this.list.filter((p) => p.life > 0);
        }
        const n = this.list.length;
        for (let i = 0; i < n; i++) {
            const p = this.list[i];
            const t = p.life / p.max;
            this.pos[i * 3] = p.x;
            this.pos[i * 3 + 1] = p.y;
            this.pos[i * 3 + 2] = p.z;
            this.col[i * 3] = p.r;
            this.col[i * 3 + 1] = p.g;
            this.col[i * 3 + 2] = p.b;
            this.size[i] = p.shrink ? p.size * t : p.size;
            this.alpha[i] = p.shrink ? 1 : t * p.peak;
        }
        this.geo.setDrawRange(0, n);
        for (const name of ['position', 'pcolor', 'psize', 'palpha']) (this.geo.getAttribute(name) as BufferAttribute).needsUpdate = true;
    }

    dispose(): void {
        this.geo.dispose();
        this.mat.dispose();
    }
}

/** An irregular blood splat (a blob with a few satellite drops), white so the material tints it. */
function splatTexture(seed: number): CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = '#fff';
    g.beginPath();
    const n = 14;
    for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 14 + rnd() * 9;
        const px = 32 + Math.cos(a) * r;
        const py = 32 + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
    }
    g.fill();
    for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 22 + rnd() * 8;
        g.beginPath();
        g.arc(32 + Math.cos(a) * d, 32 + Math.sin(a) * d, 1.5 + rnd() * 2.5, 0, Math.PI * 2);
        g.fill();
    }
    return new CanvasTexture(c);
}

/** How blood looks and how long it stays (meters and seconds). */
const GORE = {
    /** Splats on the ground at once; the oldest goes first. */
    maxSplats: 70,
    splatLife: 9,
    /** Splats fade out over this last part of their life. */
    splatFade: 2.5,
    splatOpacity: 0.78,
    dropLife: 0.9,
    dropGravity: 9,
};

interface Splat {
    mesh: Mesh;
    mat: MeshBasicMaterial;
    life: number;
}

interface Timed {
    obj: Mesh | Sprite;
    life: number;
    max: number;
    tick: (t: number, age: number) => void;
}

function textTexture(str: string, color: number): { tex: CanvasTexture; aspect: number } {
    const px = 96;
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    const font = `900 ${px}px system-ui, -apple-system, Segoe UI, sans-serif`;
    g.font = font;
    const w = Math.ceil(g.measureText(str).width) + px * 0.5;
    c.width = w;
    c.height = Math.ceil(px * 1.4);
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = px * 0.18;
    g.strokeStyle = '#000';
    g.strokeText(str, w / 2, c.height / 2);
    g.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    g.fillText(str, w / 2, c.height / 2);
    const tex = new CanvasTexture(c);
    return { tex, aspect: w / c.height };
}

export class Fx3D implements Fx {
    readonly group = new Group();
    hitstop = 0;
    trauma = 0;
    /** Set by the view to show full-screen flashes. */
    onFlash: (color: number, alpha: number) => void = () => {};

    private readonly glow = new ParticleLayer(AdditiveBlending);
    private readonly soft = new ParticleLayer(NormalBlending);
    private timed: Timed[] = [];
    private readonly tmpColor = new Color();
    private readonly splatTex = [splatTexture(1), splatTexture(2), splatTexture(3)];
    private readonly splatGeo = new PlaneGeometry(1, 1);
    private splats: Splat[] = [];

    constructor() {
        this.group.add(this.soft.points, this.glow.points);
        this.splatGeo.rotateX(-Math.PI / 2);
    }

    setProjection(v: number): void {
        this.glow.setProjection(v);
        this.soft.setProjection(v);
    }

    burst(x: number, y: number, color: number, count = 10, speed = 320, size = 6, life = 0.4, glow = true): void {
        this.tmpColor.setHex(color);
        const layer = glow ? this.glow : this.soft;
        for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = speed * U * (0.35 + Math.random() * 0.65);
            layer.add(x * U, FX_Y, y * U, Math.cos(a) * s, 1 + Math.random() * 2.5, Math.sin(a) * s, 5, size * U * 2.4, this.tmpColor, life, glow);
        }
    }

    spray(x: number, y: number, angle: number, spreadRad: number, color: number, count = 8, speed = 420, size = 5, life = 0.3): void {
        this.tmpColor.setHex(color);
        for (let i = 0; i < count; i++) {
            const a = angle + (Math.random() - 0.5) * spreadRad;
            const s = speed * U * (0.4 + Math.random() * 0.6);
            this.glow.add(x * U, FX_Y, y * U, Math.cos(a) * s, 0.5 + Math.random() * 2, Math.sin(a) * s, 6, size * U * 2.4, this.tmpColor, life, true);
        }
    }

    trail(x: number, y: number, color: number, size: number, life = 0.25): void {
        this.tmpColor.setHex(color);
        this.soft.add(x * U, 0.6, y * U, 0, 0, 0, 0, size * U * 3, this.tmpColor, life, false, 0.4);
    }

    blood(x: number, y: number, angle: number, amount = 1, kill = false): void {
        const drops = Math.round(Math.min(14, (kill ? 12 : 3) + amount * 4));
        const fresh = this.tmpColor.setHex(C.gore).clone();
        // a few drops turn into splats; the rest are just spray
        let splatsLeft = kill ? 5 : Math.min(3, 1 + Math.round(amount));
        for (let i = 0; i < drops; i++) {
            const a = angle + (Math.random() - 0.5) * (kill ? 2.6 : 1.3);
            const s = (kill ? 2.6 : 1.8) * (0.4 + Math.random() * 0.8);
            const land = splatsLeft-- > 0 ? (lx: number, lz: number) => this.addSplat(lx, lz, 0.1 + Math.random() * 0.12, C.gore) : undefined;
            this.soft.add(x * U, FX_Y * (0.7 + Math.random() * 0.4), y * U, Math.cos(a) * s, 0.8 + Math.random() * 1.8, Math.sin(a) * s, 1.5, (2.2 + Math.random() * 2.5) * U * 2.4, fresh, GORE.dropLife, false, 1, GORE.dropGravity, land);
        }
        if (kill) {
            // a pool under the body
            this.addSplat(x * U, y * U, 0.55 + Math.random() * 0.2, C.goreDark);
        }
    }

    private addSplat(x: number, z: number, size: number, color: number): void {
        if (this.splats.length >= GORE.maxSplats) this.removeSplat(this.splats.shift()!);
        const mat = new MeshBasicMaterial({
            map: this.splatTex[Math.floor(Math.random() * this.splatTex.length)],
            color,
            transparent: true,
            opacity: GORE.splatOpacity,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
        });
        const mesh = new Mesh(this.splatGeo, mat);
        mesh.position.set(x, 0.02 + this.splats.length * 0.0002, z);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.scale.set(size * (0.8 + Math.random() * 0.5), 1, size * (0.8 + Math.random() * 0.5));
        this.group.add(mesh);
        this.splats.push({ mesh, mat, life: GORE.splatLife });
    }

    private removeSplat(sp: Splat): void {
        sp.mesh.removeFromParent();
        sp.mat.dispose();
    }

    /** Clear the ground (a new realm). */
    clearSplats(): void {
        for (const sp of this.splats) this.removeSplat(sp);
        this.splats = [];
    }

    slash(x: number, y: number, angle: number, radius: number, spreadRad: number, color: number, width = 12, life = 0.14): void {
        const r = radius * U;
        const inner = Math.max(0.05, 1 - (width * U * 1.6) / r);
        const geo = new RingGeometry(inner, 1, 24, 1, -spreadRad / 2, spreadRad);
        const mat = new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
        const mesh = new Mesh(geo, mat);
        mesh.rotation.set(-Math.PI / 2, 0, -angle);
        mesh.position.set(x * U, FX_Y, y * U);
        this.group.add(mesh);
        this.timed.push({
            obj: mesh,
            life,
            max: life,
            tick: (t) => {
                mesh.scale.setScalar(r * (1.05 - t * 0.2));
                mat.opacity = Math.min(1, t * 1.6);
            },
        });
    }

    ring(x: number, y: number, r0: number, r1: number, color: number, width = 8, life = 0.35): void {
        const geo = new RingGeometry(0.86, 1, 48);
        const mat = new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
        const mesh = new Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x * U, 0.06, y * U);
        this.group.add(mesh);
        const thick = Math.max(1, width / 8);
        this.timed.push({
            obj: mesh,
            life,
            max: life,
            tick: (t) => {
                const rad = (r1 + (r0 - r1) * t * t) * U;
                mesh.scale.set(rad, rad, 1);
                mat.opacity = t * Math.min(1, thick);
            },
        });
    }

    crack(x: number, y: number, radius: number, color: number, life = 1.2): void {
        // jagged lines from the center outward: a dark gash with a thinner glowing seam inside
        const R = radius * U;
        const dark: number[] = [];
        const seam: number[] = [];
        const quad = (out: number[], ax: number, az: number, bx: number, bz: number, wa: number, wb: number) => {
            const dx = bx - ax;
            const dz = bz - az;
            const len = Math.hypot(dx, dz) || 1;
            const nx = -dz / len;
            const nz = dx / len;
            const p = [ax + nx * wa, az + nz * wa, ax - nx * wa, az - nz * wa, bx + nx * wb, bz + nz * wb, bx - nx * wb, bz - nz * wb];
            out.push(p[0], 0, p[1], p[2], 0, p[3], p[4], 0, p[5], p[2], 0, p[3], p[6], 0, p[7], p[4], 0, p[5]);
        };
        const n = 11;
        for (let i = 0; i < n; i++) {
            let ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
            let r = R * 0.12;
            const end = R * (0.6 + Math.random() * 0.4);
            let px = Math.cos(ang) * r;
            let pz = Math.sin(ang) * r;
            let w = 0.07;
            while (r < end) {
                r += R * (0.14 + Math.random() * 0.12);
                ang += (Math.random() - 0.5) * 0.5;
                const qx = Math.cos(ang) * Math.min(r, end);
                const qz = Math.sin(ang) * Math.min(r, end);
                const w2 = Math.max(0.01, w * 0.7);
                quad(dark, px, pz, qx, qz, w, w2);
                quad(seam, px, pz, qx, qz, w * 0.4, w2 * 0.4);
                px = qx;
                pz = qz;
                w = w2;
            }
        }
        const add = (arr: number[], col: number, blending: Blending, lift: number, fade: number) => {
            const geo = new BufferGeometry();
            geo.setAttribute('position', new BufferAttribute(new Float32Array(arr), 3));
            const mat = new MeshBasicMaterial({ color: col, transparent: true, blending, depthWrite: false, side: DoubleSide });
            const mesh = new Mesh(geo, mat);
            mesh.position.set(x * U, lift, y * U);
            this.group.add(mesh);
            // the gash holds, then fades over the last part of its life; the seam fades from the start
            this.timed.push({ obj: mesh, life, max: life, tick: (t) => (mat.opacity = Math.min(1, t / fade)) });
        };
        add(dark, 0x050505, NormalBlending, 0.03, 0.45);
        add(seam, color, AdditiveBlending, 0.035, 1);
    }

    text(x: number, y: number, str: string, color = 0xffffff, size = 34, life = 0.8): void {
        const { tex, aspect } = textTexture(str, color);
        const mat = new SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
        const sprite = new Sprite(mat);
        sprite.renderOrder = 10;
        const h = size / 110;
        // stack above any recent text nearby so "COUNTER!" and "BREAK!" don't print on top of each other
        let stack = 0;
        for (const e of this.timed) {
            if (!(e.obj instanceof Sprite) || e.max - e.life > 0.35) continue;
            if (Math.hypot(e.obj.position.x - x * U, e.obj.position.z - y * U) < 1.2) stack++;
        }
        const baseY = 2.1 + stack * 0.45;
        sprite.position.set(x * U, baseY, y * U);
        this.group.add(sprite);
        this.timed.push({
            obj: sprite,
            life,
            max: life,
            tick: (t, age) => {
                const pop = age < 0.1 ? 1.4 - (age / 0.1) * 0.4 : 1;
                sprite.scale.set(h * aspect * pop, h * pop, 1);
                sprite.position.y = baseY + age * 0.9 - age * age * 0.4;
                mat.opacity = Math.min(1, t * 3);
            },
        });
    }

    shake(amount: number): void {
        this.trauma = Math.min(1, this.trauma + amount);
    }

    freeze(seconds: number): void {
        this.hitstop = Math.max(this.hitstop, seconds);
    }

    flash(color: number, alpha: number): void {
        this.onFlash(color, alpha);
    }

    /** Sim x of the player, set by the view each frame; sounds pan relative to it. */
    listenerX = 0;

    sound(name: SfxName, opts: SoundOpts = {}): void {
        const pan = opts.x === undefined ? 0 : Math.max(-0.75, Math.min(0.75, (opts.x - this.listenerX) / 650));
        audio.play(name, { volume: opts.volume, align: opts.align, delay: opts.delay, pan });
    }

    /**
     * @param simDt simulation time (0 during hitstop) for particles
     * @param realDt real time for text, rings and shake decay
     */
    update(simDt: number, realDt: number): void {
        this.trauma = Math.max(0, this.trauma - realDt * 1.6);
        this.glow.update(simDt);
        this.soft.update(simDt);
        for (const e of this.timed) {
            e.life -= realDt;
            e.tick(Math.max(0, e.life / e.max), e.max - e.life);
        }
        for (const e of this.timed) {
            if (e.life <= 0) this.disposeTimed(e);
        }
        for (const sp of this.splats) {
            sp.life -= realDt;
            sp.mat.opacity = GORE.splatOpacity * Math.min(1, sp.life / GORE.splatFade);
        }
        while (this.splats.length && this.splats[0].life <= 0) this.removeSplat(this.splats.shift()!);
        this.timed = this.timed.filter((e) => e.life > 0);
    }

    private disposeTimed(e: Timed): void {
        e.obj.removeFromParent();
        if (e.obj instanceof Mesh) {
            e.obj.geometry.dispose();
            (e.obj.material as MeshBasicMaterial).dispose();
        } else {
            const m = e.obj.material as SpriteMaterial;
            m.map?.dispose();
            m.dispose();
        }
    }

    dispose(): void {
        for (const e of this.timed) this.disposeTimed(e);
        this.timed = [];
        this.clearSplats();
        this.splatGeo.dispose();
        for (const t of this.splatTex) t.dispose();
        this.glow.dispose();
        this.soft.dispose();
        this.group.removeFromParent();
    }
}

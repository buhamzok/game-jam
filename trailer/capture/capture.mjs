// Capture trailer footage from the running game (frame by frame, deterministic pacing).
//
//   NO_PLAYGROUND=1 npm run dev            (in the game folder, port 5173)
//   node capture/capture.mjs landscape     -> public/clips/landscape/<shot>.mp4 (1920x1080)
//   node capture/capture.mjs portrait      -> public/clips/portrait/<shot>.mp4  (1080x1920)
//   node capture/capture.mjs landscape fight,boss   (only some shots)
//
// The game UI is hidden (cinematic). An autopilot fights: it walks in, combos,
// dodges red, guards purple (counters), and fires what each shot asks for.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const ORIENT = process.argv[2] || 'landscape';
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const FPS = 30;
const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(DIR, 'public', 'clips', ORIENT);
const FRAMES = path.join(DIR, 'capture', 'frames');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const VIEW = ORIENT === 'portrait' ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// 1.5x device scale: 1280x720 CSS -> 1920x1080 pixels
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(process.env.URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForFunction(() => document.body.innerText.includes('DAILY HUNT'), null, { timeout: 120000 });
// cinematic: only the 3D canvas (menu backdrop or game view) stays visible
await page.addStyleTag({ content: '#app-frame > div > :not(:first-child), #app-frame > div > div:first-child > div:not(:first-child):not([style*="opacity"]) { display: none !important; } .pointer-events-none.absolute.inset-0.pt-safe-top{display:none!important}' });

const ev = (fn, arg) => page.evaluate(fn, arg);

// in-page helpers: autopilot and stepping (re-installed before every shot, so a page reload cannot break a run)
const installCap = () => ev(() => {
    if (window.__cap) return;
    window.__cap = {
        auto: { target: null, attackEvery: 0.13, special: false, specialAt: -1, transAt: -1, t: 0, lastAtk: 0, guardHold: 0, moveTo: null, god: true, swaps: [] },
        /** Trailer camera: about 25% closer than the game's, and snapped to the player on demand. */
        zoom(v) {
            if (v.__zoomed) return;
            v.__zoomed = true;
            const orig = v.updateCamera.bind(v);
            v.updateCamera = (dt) => {
                orig(dt);
                const k = 0.74;
                const tx = v.camTarget.x, tz = v.camTarget.z;
                v.camera.position.set(tx + (v.camera.position.x - tx) * k, v.camera.position.y * k, tz + (v.camera.position.z - tz) * k);
                v.camera.lookAt(tx, 0, tz + 0.35);
            };
        },
        snap() {
            const { view: v, world: w } = window.__ttt;
            v.camTarget.set(w.player.x * 0.01, 0, w.player.y * 0.01);
        },
        /** Move the player to the arena center and place hunters around it. */
        center(offsets) {
            const w = window.__ttt.world, p = w.player;
            p.x = 0; p.y = 0;
            w.hunters.forEach((h, i) => { const o = offsets[i % offsets.length]; h.x = o[0]; h.y = o[1]; });
            this.snap();
        },
        step(dtFrame) {
            const T = window.__ttt;
            const v = T.view, w = T.world, input = T.input, a = this.auto;
            this.zoom(v);
            const sub = 2;
            for (let s = 0; s < sub; s++) {
                const dt = dtFrame / sub;
                a.t += dt;
                this.pilot(w, input, a, dt);
                // render only on the last sub-step
                const render = v.renderer.render;
                if (s < sub - 1) v.renderer.render = () => {};
                v.step(dt);
                v.renderer.render = render;
            }
        },
        pilot(w, input, a, dt) {
            const p = w.player;
            if (a.god) for (const m of p.team) if (m.alive) m.hp = Math.max(m.hp, 25);
            if (a.transAt >= 0 && a.t >= a.transAt) { a.transAt = -1; p.unit().energy = 100; input.press('trans'); input.release('trans'); return; }
            if (a.specialAt >= 0 && a.t >= a.specialAt) { a.specialAt = -1; p.unit().specialCd = 0; input.press('special'); input.release('special'); return; }
            for (const sw of a.swaps) if (!sw.done && a.t >= sw.at) { sw.done = true; w.requestSwap(sw.to); return; }
            if (a.guardHold > 0) { a.guardHold -= dt; if (a.guardHold <= 0) input.release('guard'); return; }
            // threats: guard purple melee just before it lands (counter), dodge everything else
            for (const h of w.hunters) {
                if (h.state !== 'windup' || !h.atk) continue;
                const left = h.atk.windup - h.st;
                const d = Math.hypot(h.x - p.x, h.y - p.y);
                const style = h.atk.style || 'melee';
                if (style === 'melee' && d < h.atk.range + 80 && left < 0.16 && left > 0.02) {
                    if (h.atk.heavy) { input.press('guard'); a.guardHold = 0.25; }
                    else { input.setJoystick(-(h.x - p.x) / d, -(h.y - p.y) / d); input.press('dodge'); input.release('dodge'); }
                    return;
                }
                if ((style === 'blast' || style === 'leap') && left < 0.22 && left > 0.04 && Math.hypot(h.aimX - p.x, h.aimY - p.y) < (h.atk.radius || 120) + 40) {
                    const ax = p.x - h.aimX, ay = p.y - h.aimY, l = Math.hypot(ax, ay) || 1;
                    input.setJoystick(ax / l, ay / l); input.press('dodge'); input.release('dodge');
                    return;
                }
            }
            if (a.moveTo) {
                const dx = a.moveTo.x - p.x, dy = a.moveTo.y - p.y, d = Math.hypot(dx, dy);
                input.setJoystick(d > 20 ? dx / d : 0, d > 20 ? dy / d : 0);
                return;
            }
            const h = w.nearestHunter(p.x, p.y, 4000);
            if (!h) { input.setJoystick(0, 0); return; }
            const dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (d > h.r + 95) { input.setJoystick(dx / d, dy / d); return; }
            input.setJoystick(0, 0);
            if (a.t - a.lastAtk > a.attackEvery) { a.lastAtk = a.t; input.press('attack'); input.release('attack'); }
        },
        reset(opts) { Object.assign(this.auto, { target: null, special: false, specialAt: -1, transAt: -1, t: 0, lastAtk: 0, guardHold: 0, moveTo: null, god: true, swaps: [] }, opts || {}); },
    };
});
await installCap();

async function startRun() {
    await installCap();
    await ev(() => window.__store.patch({ phase: 'playing', gameOver: false, runId: window.__store.get().runId + 1 }));
    await page.waitForFunction(() => window.__ttt && window.__ttt.world && !window.__ttt.world.__used, null, { timeout: 60000 });
    await ev(() => { window.__ttt.world.__used = true; window.__ttt.view.setPaused(true); });
}

/** Fast-forward without rendering (setup). */
async function skip(seconds) {
    await ev((s) => {
        const { view: v, world: w } = window.__ttt;
        const n = Math.round(s * 60);
        const render = v.renderer.render;
        v.renderer.render = () => {};
        for (let i = 0; i < n; i++) { window.__cap.pilot(w, window.__ttt.input, window.__cap.auto, 1 / 60); v.step(1 / 60); }
        v.renderer.render = render;
    }, seconds);
}

async function record(name, seconds, stepFn) {
    if (ONLY && !ONLY.includes(name)) return false;
    rmSync(FRAMES, { recursive: true, force: true });
    mkdirSync(FRAMES, { recursive: true });
    const n = Math.round(seconds * FPS);
    const t0 = Date.now();
    for (let f = 0; f < n; f++) {
        await ev(stepFn, 1 / FPS);
        await page.screenshot({ path: `${FRAMES}/${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
    const out = path.join(OUT, `${name}.mp4`);
    await new Promise((res, rej) => {
        const p = spawn('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', `${FRAMES}/%04d.jpg`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', out], { stdio: 'inherit' });
        p.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res()));
    });
    console.log(`${name}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`);
    return true;
}
const gameStep = (dt) => window.__cap.step(dt);
const want = (name) => !ONLY || ONLY.includes(name);

// ---- 1. the lineup on the title screen (skins on show) ----------------------
if (want('lineup')) {
    await installCap();
    await ev(() => {
        window.__store.patch({ ownedSkins: ['vamp_bloodmoon', 'stitch_toxic'], equippedSkins: { vampire: 'vamp_bloodmoon', stitched: 'stitch_toxic' } });
    });
    await page.waitForFunction(() => window.__menu, null, { timeout: 30000 });
    await ev(() => window.__menu.renderer.setAnimationLoop(null));
    await record('lineup', 3.4, (dt) => window.__menu.step(dt));
    await ev(() => window.__store.patch({ equippedSkins: {} }));
}

// ---- 2. a fight: combos, a counter, a guard break -----------------------------
if (want('fight')) {
    await startRun();
    await ev(() => { const w = window.__ttt.world; w.wave = 2; window.__cap.reset(); });
    await skip(0.1);
    await ev(() => { const w = window.__ttt.world; for (const h of w.hunters) { h.state = 'dead'; h.removable = true; } });
    await skip(2.6);
    await ev(() => { window.__cap.center([[220, -120], [-240, -60], [60, -280], [-120, 200]]); window.__cap.reset({ specialAt: 2.6 }); });
    await skip(0.5);
    await record('fight', 4.2, gameStep);
}

// ---- 3. Full Moon transformation (red eyes, silver claws) ------------------------
if (want('transform')) {
    await startRun();
    await ev(() => { window.__ttt.world.wave = 1; window.__cap.reset(); });
    await skip(3.2);
    await ev(() => { window.__cap.center([[-170, -180], [170, -180]]); window.__cap.reset({ transAt: 0.4, attackEvery: 0.11 }); });
    await record('transform', 3.8, gameStep);
}

// ---- 4. tag swaps: Vampire Swarm Slam, Stitched Thunder Smash ----------------------
if (want('swap')) {
    await startRun();
    await ev(() => { window.__ttt.world.wave = 3; window.__cap.reset(); });
    await skip(0.1);
    await ev(() => { const w = window.__ttt.world; for (const h of w.hunters) { h.state = 'dead'; h.removable = true; } });
    await skip(2.6);
    await ev(() => { window.__cap.center([[200, -150], [-200, -150], [0, -260], [260, 60], [-260, 60]]); window.__cap.reset({ swaps: [{ at: 0.3, to: 1 }, { at: 2.3, to: 2 }], specialAt: 0.9 }); });
    await record('swap', 4.4, (dt) => {
        const c = window.__cap; c.step(dt);
        // a second special right after the Stitched arrives
        if (c.auto.t > 2.8 && !c.auto.second) { c.auto.second = true; c.auto.specialAt = c.auto.t; }
    });
}

// ---- 5. the Gravelord: enrage roar, then the Grave Leap -----------------------------
if (want('boss')) {
    await startRun();
    await ev(() => { const w = window.__ttt.world; w.wave = 4; window.__cap.reset(); });
    await skip(0.1);
    await ev(() => { const w = window.__ttt.world; for (const h of w.hunters) { h.state = 'dead'; h.removable = true; } });
    await skip(2.8);
    await ev(() => {
        const w = window.__ttt.world, p = w.player;
        for (const h of w.hunters) if (!h.def.boss) { h.state = 'dead'; h.removable = true; }
        p.x = 0; p.y = 150;
        const b = w.hunters.find((h) => h.def.boss); b.x = 40; b.y = -140; b.state = 'chase'; b.hp = b.hpMax * 0.55;
        window.__cap.snap();
        window.__cap.reset();
    });
    await skip(0.6);
    await record('boss', 4.6, (dt) => {
        const c = window.__cap, w = window.__ttt.world, p = w.player;
        const b = w.hunters.find((h) => h.def.boss);
        if (b && c.auto.t > 0.5 && b.phase === 1) b.takeHit(b.hp - b.hpMax * 0.49, 5, { angle: -Math.PI / 2, knock: 0 });
        // after the roar, back off so it leaps
        if (b && b.phase === 2 && b.state !== 'roar' && !c.auto.ran) { c.auto.ran = true; c.auto.moveTo = { x: p.x - 380, y: p.y + 260 }; }
        if (b && b.atk && b.atk.style === 'leap') c.auto.moveTo = null;
        c.step(dt);
    });
}

// ---- 6. the portal to the next realm ---------------------------------------------------
if (want('portal')) {
    await startRun();
    await ev(() => { const w = window.__ttt.world; w.wave = 4; window.__cap.reset(); });
    await skip(0.1);
    await ev(() => { const w = window.__ttt.world; for (const h of w.hunters) { h.state = 'dead'; h.removable = true; } });
    await skip(2.8);
    await ev(() => { const w = window.__ttt.world; const b = w.hunters.find((h) => h.def.boss); b.hp = 1; b.takeHit(50, 5, { angle: 0, knock: 0 }); });
    await skip(3.6);
    await ev(() => { const w = window.__ttt.world, p = w.player; p.x = w.portal.x + 120; p.y = w.portal.y + 420; window.__cap.snap(); window.__cap.reset({ moveTo: { x: w.portal.x, y: w.portal.y } }); });
    await record('portal', 4.0, (dt) => {
        const c = window.__cap, w = window.__ttt.world;
        if (!w.portal && w.realm.id !== 'graveyard') c.auto.moveTo = null;
        c.step(dt);
    });
}

// ---- 7-8. realms montage: the Pumpkin Patch and the Blood Moon Crypt ----------------------
for (const [name, realmIndex, wave] of [['patch', 2, 11], ['crypt', 3, 16]]) {
    if (!want(name)) continue;
    await startRun();
    await ev(([ri, wave]) => { const w = window.__ttt.world; w.realmIndex = ri - 1; w.enterRealm(); w.wave = wave - 1; window.__cap.reset(); }, [realmIndex, wave]);
    await skip(3.4);
    await ev(() => { const w = window.__ttt.world; w.hunters.splice(4); window.__cap.center([[-220, -200], [0, -260], [220, -200], [0, 240]]); window.__cap.reset({ specialAt: 1.2 }); });
    await record(name, 3.0, gameStep);
}

// ---- 9. PVP Arena: a rival's skinned tag team in the Blood Pit -----------------------------
if (want('pvp')) {
    await ev(() => window.__store.patch({ mode: 'pvp', bestWave: 8, rival: { name: 'Moonfang', bot: false, power: 196, units: [{ monster: 'stitched', skin: 'stitch_toxic' }, { monster: 'vampire', skin: 'vamp_bloodmoon' }, { monster: 'werewolf', skin: 'wolf_hellhound' }] } }));
    await startRun();
    await ev(() => window.__cap.reset());
    await skip(3.0);
    await ev(() => { window.__cap.center([[60, -230]]); window.__cap.reset({ specialAt: 2.4, transAt: 0.2 }); });
    await record('pvp', 4.4, gameStep);
    await ev(() => window.__store.patch({ mode: 'hunt' }));
}

await browser.close();
console.log('done', ORIENT);

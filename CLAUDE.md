# Tag Team Terror (RUN October Jam: Monster Mash)

Spec and build plan (start with the "Next session" line in its Summary; keep both copies in sync): `docs/spec-and-build-plan.md` (live version: https://claude.ai/code/artifact/ffc7bb84-0ca3-46dd-b08d-8145669470d3)

Top-down monster brawler for the RUN.world October Jam (entries close Nov 2, 12:00 PM PT). Combat is inspired by Bleach: Soul Resonance mechanics (dodge, counter, tag-team swap, transformations) with fully original monsters, names and art; never use Bleach names or terms. Built from the official 2D Pixi template; the template notes below still apply.

## Game code (src/game/)

The simulation is 2D and renderer-free (sim units, y down, 100 units = 1 m); three.js only mirrors it.

- **tuning.ts**: every combat number (damage, windows, cooldowns, speeds). Tune feel here, not in logic.
- **world.ts**: waves (roster and per-wave difficulty), hit resolution (player swings, enemy strikes, bolts, mage blasts, perfect dodge, counter, specials), transformations, HUD sync via `store.patch()` on change only.
- **player.ts**: the hero state machine (idle/move, 3-hit combo, dodge, guard, counter, special (pounce, swarm or smash), transform, entry, hurt, dead).
- **hunter.ts**: hunter AI. Melee (knight, barbarian): red jab (dodge or block), purple heavy (guard in the parry window to counter; armored windup). Ranged: rogue (crossbow bolt along a red aim line), mage (purple circle blast). Stats scale with the wave (`WaveMods`, `T.difficulty`).
- **fxTypes.ts**: the `Fx` interface the sim calls for effects, hitstop and shake.
- **realms.ts**: the four maps (size, solid obstacles, theme); world.ts opens a portal after each boss and moves the fight to the next realm.
- **skins.ts**: cosmetic skin definitions and Souls rewards (shop logic in `src/sdk/skinShop.ts`, screen in `src/ui/SkinShop.tsx`, RUN shop items in `rundot/shop.config.json`).
- **input.ts**: buffered actions shared by touch controls (`src/ui/Controls.tsx`) and keyboard (WASD, J claw, K dodge, L guard).
- **view/**: three.js. `gameView.ts` (renderer, 3/4 camera, game loop, `step(dt)`), `actors.ts` (sim state to animation clips, transformation looks, telegraph cones, aim lines and circles), `bats.ts` (instanced bat swarm), `bolts.ts` (crossbow bolts), `characterView.ts` (skinned clone, mixer, glow), `fx3d.ts` (particles, arcs, rings, text sprites), `arena3d.ts` (realm arena: ground, border, obstacles, props, lights), `portal3d.ts` (the realm portal), `assets.ts` (GLB loading via RUN CDN or local fallback).
- Time: real time for camera/text, sim time is 0 during hitstop, enemy time is slowed during Witching Hour.
- RUN features in `src/sdk/`: `dailyHunt.ts` (leaderboard, streak), `challenge.ts` (challenge links via `app.resolveLaunchIntent()`), `skinShop.ts` (Souls, entitlements, purchases).
- `NO_PLAYGROUND=1 npm run dev` skips the RUN sign-in for headless browser tests; `?beat=7&from=Jo` fakes a challenge.
- Dev only: `window.__ttt = { view, world, input, audio }`, `window.__store`. With the browser pane hidden, rAF stops, so test by calling `view.step(1/60)` from the console.

## Assets

- Models ship from `public/cdn-assets/models/` (meshopt-compressed GLB; `GLTFLoader` needs `MeshoptDecoder`).
- `tools/prep-models.mjs` builds knight, barbarian, rogue, mage, placeholder hero and props.glb from the KayKit CC0 packs in `../game-assets/`, keeping only the clips and accessories the game uses (`ONLY=rogue,mage` rebuilds just those).
- AI characters come from RUN's pipeline; source art lives in `art/`. Concept: `rundot generate image` (T-pose, plain background, ~150 credits). Mesh: `rundot game generate-3d --provider meshy --provider-option target_polycount=12000` (~1,800 credits). `tools/gen-retry.ps1` retries rundot calls through rate limits.
- Animation: the CLI's `animate-3d` only accepts four presets, so clips come from the SDK through the dev tool `src/dev/genTool.ts` (`http://localhost:5173/?tool=animate&char=<name>&go=1`, playground key via `rundot playground grant-access`; dev server must stay on localhost). Cost: ~300 rig + ~180 per clip, max 10 clips per call. Meshy action IDs: https://docs.meshy.ai/en/api/animation-library.
- `tools/merge-anims.mjs` merges per-clip GLBs into one model (color texture only, WebP 1024, meshopt, horizontal root motion stripped). All Meshy rigs share the same 24-bone skeleton, so clips bought for one character can be merged onto another rigged character.
- Credits are limited: probe prices with `--max-credits 1` first.
- Sound: `tools/sfx-kit.json` lists every sound event, its CC0 candidates (`art/sound-sources/`: Kenney, OpenGameArt, Freesound) and the picks. `python -I tools/build-sfx.py` trims each to its first frame, levels it and writes `public/cdn-assets/sfx/sounds.pack` + `loops.pack` (music, ambience) and the board pack. The owner auditions and picks at http://localhost:5173/tools/sound-board.html (saves into the kit). `src/game/audio.ts` plays them (buses, limiter, `align` so whooshes peak on the hit frame); the sim asks via `Fx.sound(name, { x, align })`. Packs, not .mp3 URLs: Internet Download Manager blanks .mp3/.wav fetches in Chrome. RUN blocks localStorage in games: use `RundotGameAPI.deviceCache`.
- If a generated character's clips look wrong, compare the files in `art/<name>-anims/` with its `result.json`: a batch can be generated but never downloaded.
- Deploy: `npm run build` then `rundot deploy` (private by default; `--public` only when the user says so).

# Template: Pixi.js v8 + React 19 + Tailwind v4

## File Structure (as-shipped)

- **src/main.tsx** — Entry point. The boot sequence, numbered 1–8; the ORDER matters (SDK init → save load → React mount → boot-cover lift → asset warm → menu → lifecycles → fire-and-forget analytics). Add work at the `ADAPT:` points; don't reorder.
- **src/sdk/runSdk.ts** — `initSdk()` (awaits `RundotGameAPI.initializeAsync()`, never throws — local dev without the host runs SDK-less) and `registerLifecycles()` for all six host hooks. `sdkReady()` tells you whether the host answered.
- **src/state/store.ts** — Tiny external store (`useSyncExternalStore`) bridging game code ↔ React. `store.patch({...})` from anywhere; `useStore(selector)` in components. Exports the `AppState` type — add game-facing UI state fields here.
- **src/assets/manifest.ts** — Asset list in two tiers: `critical` (awaited by the loading screen) and `deferred` (loads in background).
- **src/assets/preload.ts** — `warmAssets(onProgress)` via Pixi `Assets` bundles.
- **src/game/pixiApp.ts** — Pixi v8 `Application` factory: DPR cap, autoDensity, transparent canvas. Pixel-art switches are marked `ADAPT:` here.
- **src/game/stage.ts** — Design-resolution stage. Scenes position on `stage.root` in design units (`DESIGN_WIDTH` 720); `stage.designHeight()` gives current height in units (1280 at 9:16, up to ~1560 on tall phones). `stage.onResize(cb)` for re-anchoring.
- **src/game/GameCanvas.tsx** — React ↔ Pixi boundary. StrictMode-safe mount/destroy; freezes the ticker while `store.paused`.
- **src/game/demoScene.ts** — Throwaway demo (bouncing sprite → store → HUD). Replace it, but keep its `createXxxScene(app, stage) → Scene` contract (`{ destroy() }`).
- **src/ui/** — `App.tsx` (phase router: loading → menu → playing), `LoadingScreen.tsx`, `MainMenu.tsx`, `Hud.tsx` — Tailwind reference screens.
- **src/styles/app.css** — Tailwind import, `@theme` palette, device-frame CSS (`#app-frame`), safe-area utilities.
- **index.html** — Locked mobile viewport, inline boot cover with 4s safety fade (never a stuck black screen), React root `#root`.
- **public/** — Small static assets (<100KB). `public/images/placeholder.png` is the demo sprite.
- **public/cdn-assets/** — Large assets deployed to CDN. Load at runtime via `RundotGameAPI.cdn.fetchAsset('name.png')` → blob URL → `Assets.load({ src: blobUrl, loadParser: 'loadTextures' })` → revoke the blob URL.
- **public/thumbnail.jpg** — Placeholder game tile. MUST be replaced with real art (exactly 512×512 JPG) before deploying; `rundot deploy` rejects placeholders and wrong dimensions.
- **vite.config.ts** — `base: './'` (required), `rundotGameLibrariesPlugin()` + React + Tailwind plugins, esnext target (SDK and boot path use top-level await).
- **game.config.json** — Generated by `rundot init`. Do not edit manually. This template renders its own loading screen, so init without `--uses-preloader`.

## Key Patterns

- **Layering** — React owns navigation (which screen exists); Pixi owns the game. Both live inside the CSS device frame `#app-frame`, so canvas and DOM UI always align. UI overlays are `pointer-events-none`; controls opt back in.
- **Game → UI** — `store.patch()` on discrete events (score, wave, popups), never per-frame. **UI → game** — a store field the scene reads, or a direct function call into the scene module.
- **Coordinates** — Never raw pixels. Width is always 720 design units; anchor vertical layout off `stage.designHeight()` and re-anchor in `stage.onResize()`. Keep must-see content in the top 1280 units or bottom-anchor it. Landscape games invert the pattern (see `ADAPT:` in stage.ts).
- **SDK posture** — Every `RundotGameAPI` call can reject; everything is try/catch'd, and the game must boot and run in a plain browser without the host. `initSdk()` runs before any other SDK call.
- **Lifecycles** — onPause/onResume: freeze/unfreeze (store.paused → ticker). onSleep: persist progress (the reliable hook). onQuit: last-chance flush (may not fire on hard close). Never fire fresh SDK RPCs from sleep/quit handlers.
- **Assets** — Bundled assets go in `src/assets/manifest.ts` (critical vs deferred) and are warmed at boot with progress. CDN assets (`public/cdn-assets/`) load on demand via `RundotGameAPI.cdn.fetchAsset()`.
- **Embedded libraries** — `react`/`react-dom` are pinned to exactly 19.2.4 so `rundotGameLibrariesPlugin()` externalizes them at build (host/CDN serves them). Do not bump React casually: a version mismatch silently falls back to bundling. `npm run build:bundled` forces a standalone bundle. Pixi is always bundled.
- **Dependency gotchas** — `firebase` must stay in `devDependencies`: the SDK dynamically imports `firebase/app` without declaring it, and removing it breaks `vite build`. The `allowScripts` field in package.json silences npm's install-script warnings; keep entries name-only (unpinned) so dependency bumps don't re-trigger them.

## What to Modify

- **New game logic** → New scene modules in `src/game/` following the `createXxxScene(app, stage) → { destroy() }` contract; swap them in `GameCanvas.tsx`. Position everything in design units.
- **New small assets** → `public/images/`, listed in `src/assets/manifest.ts` (critical if needed before gameplay, deferred otherwise).
- **New large/CDN assets** → `public/cdn-assets/`, loaded via `RundotGameAPI.cdn.fetchAsset()` (pattern in its README).
- **UI screens / HUD** → React components in `src/ui/`, routed by phase in `App.tsx`; style with Tailwind; game-facing state through `store.patch()`.
- **Title** → `<title>` in index.html + heading strings in `LoadingScreen.tsx` / `MainMenu.tsx` + `name` in package.json.
- **Palette** → the `@theme` block in `src/styles/app.css`.
- **Orientation** → portrait is default. For landscape: `rundot init --orientation Landscape` and adjust the 9:16 media query in `app.css` (see `ADAPT:`).
- **Save/persistence** → `main.tsx` step 2 (load before first render) and step 7 (flush in `onSleep`/`onQuit`), via `RundotGameAPI.storage`.
- **Game config (resolution, DPR, pixel-art)** → `DESIGN_WIDTH` in stage.ts (keep 720 unless art dictates otherwise); DPR cap / texture settings in pixiApp.ts.

All intended edit points carry `ADAPT:` comments — search the source for `ADAPT:` for the full list.

## Verification (after scaffolding a game from this template)

- `npm install` clean; `npm run dev` boots with no console errors (black cover → loading bar → menu; no white flash, no stuck black screen).
- Play → scene runs; HUD reflects store updates; Menu round-trips destroy the Pixi app cleanly (no WebGL context warnings).
- Across device sizes in the device toolbar, content stays proportional (design-unit stage working); landscape letterboxes.
- `npm run build` passes (it type-checks first); `npm run preview` serves a working game; `dist/index.html` asset URLs start with `./`.
- Before first deploy: real 512×512 `public/thumbnail.jpg`, and `rundot init` has been run (it generates `game.config.json`).

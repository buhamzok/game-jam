import React from 'react';
import { createRoot } from 'react-dom/client';
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import App from './ui/App.tsx';
import { store } from './state/store.ts';
import { initSdk, registerLifecycles, sdkReady } from './sdk/runSdk.ts';
import { warmAssets } from './assets/preload.ts';
import './styles/app.css';

/**
 * Boot sequence. The ORDER here matters — it's the pattern production RUN
 * games use. Keep the numbered steps in this order; add your own work at the
 * marked points.
 */
async function boot() {
    // 1. SDK first. Nothing may call RundotGameAPI before this resolves.
    //    Resolves even if init fails (local dev outside the RUN host).
    await initSdk();

    // Dev-only tools (?tool=animate for clips, ?tool=thumb for the tile art): run instead of the game.
    if (import.meta.env.DEV) {
        const params = new URLSearchParams(location.search);
        if (params.get('tool') === 'animate') {
            document.getElementById('boot-cover')?.remove();
            const { runGenTool } = await import('./dev/genTool.ts');
            await runGenTool(params);
            return;
        }
        if (params.get('tool') === 'thumb') {
            document.getElementById('boot-cover')?.remove();
            const { runThumbTool } = await import('./dev/thumbTool.ts');
            await runThumbTool();
            return;
        }
    }

    // Opened from a friend's challenge link? Resolves in the background (the
    // host may still be attributing a fresh install) and patches the store.
    void import('./sdk/challenge.ts').then((c) => c.resolveChallenge()).catch(() => undefined);

    // 2. ADAPT: load persisted progress (RundotGameAPI.storage) before first
    //    render, so the first screen can reflect real progress instead of
    //    popping in after a beat. The Daily Hunt panel reads best wave,
    //    streak and device settings from the cache here.
    try {
        const { loadDailyHunt } = await import('./sdk/dailyHunt.ts');
        const { loadSkins } = await import('./sdk/skinShop.ts');
        const { loadProgress } = await import('./sdk/progress.ts');
        await Promise.all([loadDailyHunt(), loadSkins(), loadProgress()]);
    } catch (err) {
        console.warn('[Main] Daily Hunt load failed (carrying on)', err);
    }

    // 3. Mount React. `phase` starts at 'loading', so this paints the
    //    loading screen (progress bar at 0%).
    createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );

    // 4. Lift the boot cover once the loading screen has actually painted
    //    (double-rAF = after the next rendered frame). Asset warming continues
    //    behind it — the player watches the progress bar, not a black screen.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const cover = document.getElementById('boot-cover');
            if (!cover) return;
            cover.classList.add('hidden');
            setTimeout(() => cover.remove(), 400); // matches the CSS transition
        });
    });

    // 5. Warm all critical assets (see src/assets/manifest.ts). Deferred
    //    assets keep loading in the background after this resolves.
    await warmAssets((p) => store.patch({ loadProgress: p }));

    // 6. Loading done — hand over to the menu.
    store.patch({ phase: 'menu' });

    // 7. Host lifecycle hooks. Register AFTER boot so handlers never race
    //    half-initialized state.
    //    Rules: persist on onSleep, never rely on onQuit firing, and never
    //    fire fresh SDK RPCs (e.g. scheduling notifications) from
    //    onSleep/onQuit — a hard close kills the runtime before they land.
    registerLifecycles({
        onPause: () => store.patch({ paused: true }),
        onResume: () => store.patch({ paused: false }),
        onSleep: async () => {
            // Best wave and streak are written through deviceCache the moment a
            // run ends (submitRun), so no flush is needed here.
        },
        onQuit: async () => {
            // Nothing pending — submitRun already wrote the cache on game over.
        },
    });

    // 8. Post-boot, fire-and-forget work goes here — analytics boot event,
    //    server time refresh, notification re-arming, subscription status
    //    refresh. None of it should block or throw into this function.
    if (sdkReady()) {
        try {
            RundotGameAPI.analytics.recordCustomEvent('game_loaded');
            RundotGameAPI.analytics.trackFunnelStep(1, 'game_loaded', 'boot', 1);
        } catch (err) {
            console.warn('[Main] boot analytics failed', err);
        }
    }
}

if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot);

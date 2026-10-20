import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { rundotGameLibrariesPlugin, rundotGamePlaygroundPlugin } from '@series-inc/rundot-game-sdk/vite';
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Dev only: the sound board (tools/sound-board.html) saves the owner's picks
 * into tools/sfx-kit.json through POST /__sfx-picks.
 */
function soundBoardPicks(): Plugin {
    return {
        name: 'sound-board-picks',
        apply: 'serve',
        configureServer(server) {
            // served raw: the RUN playground would otherwise put its game-loading overlay over the board
            server.middlewares.use('/tools/sound-board.html', (_req, res) => {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.end(fs.readFileSync(path.resolve(server.config.root, 'tools', 'sound-board.html')));
            });
            server.middlewares.use('/__sfx-picks', (req, res) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405;
                    res.end();
                    return;
                }
                let body = '';
                req.on('data', (chunk) => (body += chunk));
                req.on('end', () => {
                    try {
                        const picks = JSON.parse(body) as { events: Record<string, string[]>; loops: Record<string, string> };
                        const file = path.resolve(server.config.root, 'tools', 'sfx-kit.json');
                        const kit = JSON.parse(fs.readFileSync(file, 'utf8'));
                        for (const [name, ids] of Object.entries(picks.events)) {
                            const ev = kit.events[name];
                            if (ev && ids.length && ids.every((id) => id in ev.candidates)) ev.pick = ids;
                        }
                        for (const [name, id] of Object.entries(picks.loops)) {
                            const lp = kit.loops[name];
                            if (lp && id in lp.candidates) lp.pick = id;
                        }
                        fs.writeFileSync(file, JSON.stringify(kit, null, 2) + '\n');
                        res.end('ok');
                    } catch (err) {
                        res.statusCode = 400;
                        res.end(String(err));
                    }
                });
            });
        },
    };
}

export default defineConfig({
    // REQUIRED for RUN: deployed builds are served from a subdirectory, so all
    // asset URLs must be relative. Do not change this.
    base: './',
    // rundotGameLibrariesPlugin: on `vite build`, libraries the RUN host embeds
    // (React 19.2.4 / react-dom 19.2.4 here — pixi.js is always bundled) are
    // externalized and served by the host on mobile / CDN on web, shrinking the
    // bundle. Externalization only engages when the installed version exactly
    // matches the host's — hence the exact react/react-dom pins in package.json.
    // `npm run build:bundled` disables it for a standalone build.
    // Playground: local dev talks to RUN's playground backend (storage, leaderboards, AI gen).
    plugins: [react(), rundotGameLibrariesPlugin(), rundotGamePlaygroundPlugin(), tailwindcss(), soundBoardPicks()],
    server: {
        allowedHosts: true,
    },
    build: {
        // Top-level await in the boot path (and in the SDK) needs a modern target.
        target: 'esnext',
    },
    optimizeDeps: {
        esbuildOptions: {
            target: 'esnext',
        },
    },
});

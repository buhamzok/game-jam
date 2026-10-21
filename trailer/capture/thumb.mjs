// Render the game tile's 3D art from the running dev server (dev-only page ?tool=thumb).
//   node capture/thumb.mjs [out.png] ['{"poses":{...}}']   -> default public/thumb-art.png
// Then: node capture/stills.mjs Thumbnail 0 out/thumb.png  (adds the title)
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(DIR, 'public', 'thumb-art.png'));
const over = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto((process.env.URL || 'http://127.0.0.1:5173/') + '?tool=thumb', { waitUntil: 'load' });
await page.waitForFunction(() => window.__thumb, null, { timeout: 180000 });
// an array of overrides renders one file per entry: out-0.png, out-1.png...
const list = Array.isArray(over) ? over : [over];
for (let i = 0; i < list.length; i++) {
    const url = await page.evaluate((o) => window.__thumb.shot(o), list[i]);
    const file = list.length > 1 ? out.replace(/\.png$/, `-${i}.png`) : out;
    writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log('art ->', file);
}
await browser.close();

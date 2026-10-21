// Contact sheet of trailer frames: node capture/stills.mjs TrailerWide 30,120,200 out/sheet.png
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const [, , id = 'TrailerWide', framesArg = '30', out = 'out/sheet.png'] = process.argv;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browserExecutable = process.env.CHROME || '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const serveUrl = await bundle({ entryPoint: path.join(root, 'src/index.ts') });
const composition = await selectComposition({ serveUrl, id, browserExecutable });
const frames = framesArg.split(',').map(Number);
const dir = path.join(root, 'out', 'stills');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
for (let i = 0; i < frames.length; i++) {
    await renderStill({ serveUrl, composition, frame: frames[i], output: `${dir}/${String(i).padStart(3, '0')}.jpeg`, imageFormat: 'jpeg', browserExecutable, scale: 0.5 });
}
const cols = Math.min(3, frames.length);
const rows = Math.ceil(frames.length / cols);
await new Promise((res, rej) => {
    const p = spawn('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', `${dir}/%03d.jpeg`, '-vf', `tile=${cols}x${rows}:padding=6:color=gray`, '-frames:v', '1', path.resolve(root, out)], { stdio: 'inherit' });
    p.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res()));
});
console.log('sheet ->', out);

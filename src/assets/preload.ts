/**
 * Asset warming during the loading screen: every 3D model the game needs.
 *
 * Failure posture: a missing asset must never brick boot. Errors are logged
 * and boot continues; the scene will report what is missing.
 */
import { loadModels } from '../game/view/assets.ts';
import { audio } from '../game/audio.ts';

/**
 * @param onProgress 0..1, called as models load; always ends with a final call at 1.
 */
export async function warmAssets(onProgress: (progress: number) => void = () => {}): Promise<void> {
    // sounds load alongside the models but never hold up the menu
    void audio.load();
    try {
        await loadModels(onProgress);
    } catch (err) {
        console.warn('[preload] model loading failed — continuing without', err);
    }
    try { await document.fonts.ready; } catch { /* older engines */ }
    onProgress(1);
}

/**
 * Screen router. One phase visible at a time; the 'playing' phase stacks the
 * React HUD and touch controls above the Pixi canvas.
 *
 * #app-frame (styled in styles/app.css) is the device frame: a centered
 * portrait column that fills phones edge-to-edge and letterboxes on desktop.
 * Everything — canvas and DOM UI — lives inside it, so they always align.
 */
import { useStore } from '../state/store.ts';
import LoadingScreen from './LoadingScreen.tsx';
import MainMenu from './MainMenu.tsx';
import Hud from './Hud.tsx';
import Controls from './Controls.tsx';
import GameCanvas from '../game/GameCanvas.tsx';

export default function App() {
    const phase = useStore((s) => s.phase);
    const runId = useStore((s) => s.runId);
    return (
        <div id="app-frame" className="bg-surface text-white">
            {phase === 'loading' && <LoadingScreen />}
            {phase === 'menu' && <MainMenu />}
            {phase === 'playing' && (
                <div className="absolute inset-0">
                    {/* key: a new runId remounts the canvas, which restarts the run */}
                    <GameCanvas key={runId} />
                    <Controls />
                    <Hud />
                </div>
            )}
        </div>
    );
}

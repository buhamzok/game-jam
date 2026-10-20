/**
 * Dev-only asset tool: rigs and animates a generated character through the
 * RUN SDK (the CLI only offers four preset clips; the SDK accepts any Meshy
 * action ID). Runs in the local playground, spends real credits.
 *
 * Open: http://localhost:5173/?tool=animate&char=werewolf&go=1
 * Without `go=1` it only prints what it would request.
 * The result (clip URLs) is printed on the page and stored on window.__genResult.
 */
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';

interface CharJob {
    modelUrl: string;
    heightMeters: number;
    /** Game clip name to Meshy action ID (https://docs.meshy.ai/en/api/animation-library). */
    clips: Record<string, number>;
}

const JOBS: Record<string, CharJob> = {
    bossgolem: {
        modelUrl:
            'https://storage.googleapis.com/venus-app-a037a.firebasestorage.app/threedgen/Zo8tRIGBpGhAGb0XCXoI/31ca562d-8c6c-4485-95a6-5b2e37bd7dc3/model.compressed.glb',
        heightMeters: 3.2,
        clips: {
            idle: 12, // Idle_03
            run: 112, // Monster_Walk (played faster)
            hook: 214, // Punch_Forward_with_Both_Fists
            uppercut: 128, // Heavy_Hammer_Swing
            slam: 127, // Charged_Ground_Slam (boss shockwave)
            roll: 156, // Stand_Dodge (boss sidestep step)
            guard: 138, // Block1 (armored windups)
            counter: 220, // Shield_Push_Left (shove)
            pounce: 382, // Jump_and_Slam_Back_Down (leap slam)
            cast: 125, // Charged_Spell_Cast (summon quake)
            hit: 171, // Hit_Reaction_to_Waist (rare: armored)
            dead: 187, // Knock_Down (boss fall)
            trans: 255, // Angry_Ground_Stomp (enrage)
        },
    },
    stitched: {
        modelUrl:
            'https://storage.googleapis.com/venus-app-a037a.firebasestorage.app/threedgen/Zo8tRIGBpGhAGb0XCXoI/0ca3e4d1-d0b0-4216-bb37-e91691b16824/model.compressed.glb',
        heightMeters: 2.3,
        clips: {
            idle: 12, // Idle_03
            run: 112, // Monster_Walk (played faster)
            hook: 214, // Punch_Forward_with_Both_Fists
            uppercut: 128, // Heavy_Hammer_Swing
            slam: 127, // Charged_Ground_Slam (finisher)
            roll: 156, // Stand_Dodge (sidestep)
            guard: 138, // Block1 (loops, hold-to-block)
            counter: 220, // Shield_Push_Left (shove)
            pounce: 382, // Jump_and_Slam_Back_Down (Thunder Slam)
            hit: 171, // Hit_Reaction_to_Waist
            dead: 187, // Knock_Down
            trans: 255, // Angry_Ground_Stomp (Overcharge)
        },
    },
    vampire: {
        modelUrl:
            'https://storage.googleapis.com/venus-app-a037a.firebasestorage.app/threedgen/Zo8tRIGBpGhAGb0XCXoI/a0922327-8d5f-4246-ba05-cc93c06311e9/model.compressed.glb',
        heightMeters: 1.85,
        clips: {
            idle: 11, // Idle_02
            run: 15, // Run_03
            hook: 97, // Left_Slash
            uppercut: 219, // Right_Hand_Sword_Slash
            slam: 221, // Charged_Upward_Slash (finisher)
            roll: 452, // Backflip
            guard: 147, // Sword_Parry (loops, hold-to-block)
            counter: 90, // Counterstrike
            cast: 125, // Charged_Spell_Cast (Bat Swarm)
            hit: 179, // Hit_Reaction_1
            dead: 185, // Shot_and_Slow_Fall_Backward
            trans: 397, // 360_Power_Spin_Jump (Blood Frenzy)
        },
    },
    werewolf: {
        modelUrl:
            'https://storage.googleapis.com/venus-app-a037a.firebasestorage.app/threedgen/Zo8tRIGBpGhAGb0XCXoI/c6ce3dc3-84d1-4c35-b640-0a3e85d06d7c/model.compressed.glb',
        heightMeters: 1.9,
        clips: {
            idle: 89, // Combat_Stance
            run: 509, // Lean_Forward_Sprint
            hook: 193, // Left_Hook_from_Guard
            uppercut: 195, // Right_Upper_Hook_from_Guard
            slam: 457, // Jumping_Punch (finisher)
            roll: 384, // Quick_Step_and_Spin_Dodge
            guard: 139, // Block2 (loops, hold-to-block)
            counter: 93, // Dodge_and_Counter
            pounce: 382, // Jump_and_Slam_Back_Down (Moon Pounce)
            hit: 178, // Hit_Reaction
            dead: 189, // dying_backwards
            trans: 88, // Chest_Pound_Taunt (Full Moon roar)
        },
    },
};

function show(text: string): void {
    let pre = document.getElementById('gen-tool-out');
    if (!pre) {
        pre = document.createElement('pre');
        pre.id = 'gen-tool-out';
        pre.style.cssText = 'position:fixed;inset:0;z-index:99999;margin:0;padding:12px;overflow:auto;background:#0b0b10;color:#d4d4d8;font:12px/1.4 monospace;white-space:pre-wrap;';
        document.body.appendChild(pre);
    }
    pre.textContent = text;
}

export async function runGenTool(params: URLSearchParams): Promise<void> {
    const name = params.get('char') ?? '';
    const job = JOBS[name];
    if (!job) {
        show(`Unknown char "${name}". Known: ${Object.keys(JOBS).join(', ')}`);
        return;
    }
    const ids = Object.values(job.clips);
    const entries = Object.entries(job.clips) as [string, number][];
    // The SDK takes at most 10 clips per call; batch 2 re-runs on the already-rigged model.
    const first = entries.slice(0, 10);
    const second = entries.slice(10);
    const plan = `${name}: rig + ${ids.length} clips (2 calls: ${first.length} then ${second.length})\n${JSON.stringify(job.clips, null, 2)}`;
    if (params.get('go') !== '1') {
        show(`DRY RUN (add &go=1 to spend credits)\n\n${plan}`);
        return;
    }
    show(`Requesting... this can take several minutes.\n\n${plan}`);
    const started = performance.now();
    try {
        const call = (modelUrl: string, list: [string, number][]) =>
            RundotGameAPI.threeDGen.animate({
                modelUrl,
                heightMeters: job.heightMeters,
                animations: list.map(([, v]) => v),
            }).then((r) => ({ r, list }));
        const firstRes = await call(job.modelUrl, first);
        const dict = new Map<string, { name: string; animation: number; url: string }>();
        const ingest = (res: { r: { riggedModelUrl?: string; clips: { animation: string | number; modelUrl: string }[] }; list: [string, number][] }) => {
            const byId = new Map(res.list.map(([k, v]) => [String(v), k]));
            for (const c of res.r.clips) dict.set(String(c.animation), { name: byId.get(String(c.animation)) ?? String(c.animation), animation: Number(c.animation), url: c.modelUrl });
            return res.r.riggedModelUrl ?? '';
        };
        const riggedUrl = ingest(firstRes);
        let finalUrl = riggedUrl;
        if (second.length) {
            const secondRes = await call(riggedUrl, second);
            finalUrl = ingest(secondRes);
        }
        const out = {
            char: name,
            seconds: Math.round((performance.now() - started) / 1000),
            riggedModelUrl: finalUrl,
            clips: [...dict.values()],
        };
        (window as unknown as { __genResult?: unknown }).__genResult = out;
        console.log('[genTool]', JSON.stringify(out));
        show(`DONE\n\n${JSON.stringify(out, null, 2)}`);
    } catch (err) {
        console.error('[genTool] failed', err);
        show(`FAILED\n\n${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    }
}

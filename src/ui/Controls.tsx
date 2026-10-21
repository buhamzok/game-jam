/**
 * Controls layer. Touch mode: floating joystick on the left half and action
 * buttons on the right; they write straight into the shared `input` object
 * (no store patches), so pressing a button never re-renders React.
 * Keyboard mode: a small key-hint panel instead of the touch buttons.
 *
 * Sized with --u (the width of a 9:16 column), so the layout is the same on
 * every phone and stays sane on a landscape PC screen.
 */
import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { input, KEY_HINTS, type Action } from '../game/input.ts';
import { useStore, store } from '../state/store.ts';
import { T } from '../game/tuning.ts';

const JOY_RADIUS = 'calc(var(--u) * 0.13)';

function Joystick() {
    const zoneRef = useRef<HTMLDivElement | null>(null);
    const baseRef = useRef<HTMLDivElement | null>(null);
    const knobRef = useRef<HTMLDivElement | null>(null);
    const origin = useRef<{ x: number; y: number; id: number } | null>(null);

    const radiusPx = () => (zoneRef.current?.parentElement?.clientWidth ?? 400) * 0.13;

    const place = (x: number, y: number, kx: number, ky: number, active: boolean) => {
        const base = baseRef.current;
        const knob = knobRef.current;
        if (!base || !knob) return;
        base.style.left = `${x}px`;
        base.style.top = `${y}px`;
        base.style.opacity = active ? '1' : '0.45';
        knob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
    };

    const rest = () => {
        const zone = zoneRef.current;
        if (!zone) return;
        place(zone.clientWidth * 0.45, zone.clientHeight * 0.6, 0, 0, false);
    };

    const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
        if (origin.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        origin.current = { x, y, id: e.pointerId };
        e.currentTarget.setPointerCapture(e.pointerId);
        place(x, y, 0, 0, true);
    };

    const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
        const o = origin.current;
        if (!o || o.id !== e.pointerId) return;
        const rect = e.currentTarget.getBoundingClientRect();
        let dx = e.clientX - rect.left - o.x;
        let dy = e.clientY - rect.top - o.y;
        const r = radiusPx();
        const len = Math.hypot(dx, dy);
        if (len > r) {
            dx = (dx / len) * r;
            dy = (dy / len) * r;
        }
        input.setJoystick(dx / r, dy / r);
        place(o.x, o.y, dx, dy, true);
    };

    const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
        const o = origin.current;
        if (!o || o.id !== e.pointerId) return;
        origin.current = null;
        input.setJoystick(0, 0);
        rest();
    };

    return (
        <div
            ref={(el) => {
                zoneRef.current = el;
                if (el) requestAnimationFrame(rest);
            }}
            className="pointer-events-auto absolute bottom-0 left-0 h-full w-1/2 touch-none"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
        >
            <div
                ref={baseRef}
                className="absolute rounded-full border-2 border-white/30 bg-white/10 transition-opacity"
                style={{ width: `calc(${JOY_RADIUS} * 2)`, height: `calc(${JOY_RADIUS} * 2)`, transform: 'translate(-50%, -50%)' }}
            >
                <div
                    ref={knobRef}
                    className="absolute left-1/2 top-1/2 rounded-full bg-white/60 shadow-lg"
                    style={{ width: `calc(${JOY_RADIUS} * 0.9)`, height: `calc(${JOY_RADIUS} * 0.9)`, transform: 'translate(-50%, -50%)' }}
                />
            </div>
        </div>
    );
}

interface ButtonProps {
    action: Action;
    label: string;
    size: number;
    right: number;
    bottom: number;
    color: string;
    glow?: string | null;
    /** Seconds left on a cooldown: dims the button and sweeps a ring while > 0. */
    cooldown?: number;
    /** Full length of that cooldown (for the ring). */
    cooldownMax?: number;
}

function ActionButton({ action, label, size, right, bottom, color, glow, cooldown = 0, cooldownMax = T.guard.breakCooldown }: ButtonProps) {
    const onCd = cooldown > 0;
    return (
        <button
            type="button"
            className={`pointer-events-auto absolute flex touch-none select-none items-center justify-center rounded-full border-2 font-black tracking-wide text-white transition-transform active:scale-90 ${onCd ? 'grayscale-[0.7] saturate-50' : ''}`}
            style={{
                width: `calc(var(--u) * ${size})`,
                height: `calc(var(--u) * ${size})`,
                right: `calc(var(--u) * ${right})`,
                bottom: `calc(var(--u) * ${bottom})`,
                fontSize: `calc(var(--u) * ${size * 0.17})`,
                background: `${color}55`,
                borderColor: `${color}cc`,
                boxShadow: glow ? `0 0 calc(var(--u) * 0.05) ${glow}` : 'none',
                backgroundImage: onCd
                    ? `conic-gradient(rgba(0,0,0,0) ${(1 - cooldown / cooldownMax) * 360}deg, rgba(0,0,0,0.55) 0deg)`
                    : undefined,
            }}
            onPointerDown={(e) => {
                e.preventDefault();
                input.press(action);
            }}
            onPointerUp={() => input.release(action)}
            onPointerCancel={() => input.release(action)}
            onPointerLeave={() => input.release(action)}
            onContextMenu={(e) => e.preventDefault()}
        >
            {label}
        </button>
    );
}

function KeyHint({ label, text, glow }: { label: string; text: string; glow?: string | null }) {
    return (
        <div className="pointer-events-none flex items-center gap-[calc(var(--u)*0.02)] whitespace-nowrap">
            <span
                className="rounded-md border-2 px-[calc(var(--u)*0.02)] py-[calc(var(--u)*0.008)] text-center font-black text-white"
                style={{
                    fontSize: 'calc(var(--u) * 0.032)',
                    borderColor: '#ffffff55',
                    background: '#ffffff18',
                    boxShadow: glow ? `0 0 calc(var(--u) * 0.04) ${glow}` : 'none',
                }}
            >
                {label}
            </span>
            <span style={{ fontSize: 'calc(var(--u) * 0.03)' }} className="font-bold text-white/70">
                {text}
            </span>
        </div>
    );
}

/** The active monster's special name, for the SPECIAL button and key hint. */
function useSpecialName(): string {
    const team = useStore((s) => s.team);
    const active = useStore((s) => s.activeMonster);
    const kind = team[active]?.kind;
    return kind ? T.monsters[kind].specialButton : 'SPECIAL';
}

function KeyHints() {
    const transReady = useStore((s) => s.transReady);
    const specialCd = useStore((s) => s.specialCd);
    const specialName = useSpecialName();
    const trans = useStore((s) => s.trans);
    return (
        <div className="pointer-events-none absolute bottom-[calc(var(--u)*0.05)] right-[calc(var(--u)*0.05)] flex flex-col items-end gap-[calc(var(--u)*0.025)]">
            <KeyHint label="J" text="Claw" />
            <KeyHint label="E" text={specialCd > 0 ? `${specialName} ${Math.ceil(specialCd)}s` : specialName} glow={specialCd > 0 ? null : '#f59e0b'} />
            <KeyHint label="Space" text="Dodge" glow={store.get().perfectReady ? '#2dd4bf88' : null} />
            <KeyHint label="L" text="Guard / Counter" />
            <KeyHint label="Q" text={transReady ? 'TRANSFORM' : 'Transform (full bar)'} glow={transReady && !trans ? '#e879f988' : null} />
            <KeyHint label="1 / 2 / 3" text="Swap" />
            <KeyHint label="M" text="Sound" />
        </div>
    );
}

export default function Controls() {
    const transReady = useStore((s) => s.transReady);
    const specialCd = useStore((s) => s.specialCd);
    const specialCdMax = useStore((s) => s.specialCdMax);
    const perfectReady = useStore((s) => s.perfectReady);
    const gameOver = useStore((s) => s.gameOver);
    const inputMode = useStore((s) => s.inputMode);
    const guardCd = useStore((s) => s.guardCd);
    const trans = useStore((s) => s.trans);
    const specialName = useSpecialName();
    if (gameOver) return null;
    if (inputMode === 'keyboard') return <KeyHints />;
    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-safe-bottom" style={{ height: '36%' }}>
            <Joystick />
            <ActionButton action="attack" label="CLAW" size={0.24} right={0.05} bottom={0.09} color="#f59e0b" glow={null} />
            <ActionButton
                action="special"
                label={specialCd > 0 ? String(Math.ceil(specialCd)) : specialName}
                size={0.15}
                right={0.31}
                bottom={0.27}
                color="#fb923c"
                glow={specialCd > 0 ? null : '#fb923c'}
                cooldown={specialCd}
                cooldownMax={specialCdMax}
            />
            <ActionButton
                action="dodge"
                label="DODGE"
                size={0.17}
                right={0.08}
                bottom={0.36}
                color="#2dd4bf"
                glow={perfectReady ? '#2dd4bf88' : null}
            />
            <ActionButton
                action="guard"
                label={guardCd > 0 ? guardCd.toFixed(1) : 'GUARD'}
                size={0.17}
                right={0.31}
                bottom={0.06}
                color="#a855f7"
                glow={null}
                cooldown={guardCd}
            />
            <ActionButton
                action="trans"
                label={trans ? '·····' : 'TRNS'}
                size={0.13}
                right={0.5}
                bottom={0.03}
                color="#e879f9"
                glow={transReady && !trans ? '#e879f9' : null}
            />
        </div>
    );
}

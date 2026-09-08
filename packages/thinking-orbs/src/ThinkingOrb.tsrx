// Ported from thinking-orbs@0.2.0 src/ThinkingOrb.tsx
// (https://github.com/Jakubantalik/thinking-orbs).
import { useEffect, useRef } from 'octane';
import { MODE_DRAWS } from './engine/registry';
import { resolvePreset } from './presets';
import { useReducedMotion, useResolvedDark } from './theme';
import type { ThinkingOrbProps } from './types';

const LABELS: Record<string, string> = {
	working: 'Working…',
	searching: 'Searching…',
	solving: 'Solving…',
	listening: 'Listening…',
	connecting: 'Connecting…',
	weaving: 'Weaving…',
	composing: 'Composing…',
	breathing: 'Thinking…',
	shaping: 'Shaping…',
};

export function ThinkingOrb({
	state = 'working',
	size = 64,
	theme = 'auto',
	speed = 1,
	paused = false,
	style,
	'aria-label': ariaLabel,
	...rest
}: ThinkingOrbProps) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	const dark = useResolvedDark(theme, ref);
	const reduced = useReducedMotion();

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const dpr = Math.min(2, typeof devicePixelRatio !== 'undefined' && devicePixelRatio || 1);
		canvas.width = Math.round(size * dpr);
		canvas.height = Math.round(size * dpr);
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const context = ctx;

		const { mode, speed: baseSpeed, opts } = resolvePreset(state, size);
		const draw = MODE_DRAWS[mode];
		const effSpeed = baseSpeed * speed;

		function frame(tSec: number): void {
			context.setTransform(dpr, 0, 0, dpr, 0, 0);
			context.clearRect(0, 0, size, size);
			draw(context, size, tSec, dark, opts);
		}

		if (reduced) {
			frame(0.6);
			return;
		}

		let raf = 0;
		let running = false;
		function loop(): void {
			frame((performance.now() / 1000) * effSpeed);
			if (running) raf = requestAnimationFrame(loop);
		}
		function start(): void {
			if (running || paused) return;
			running = true;
			raf = requestAnimationFrame(loop);
		}
		function stop(): void {
			running = false;
			cancelAnimationFrame(raf);
		}

		frame((performance.now() / 1000) * effSpeed);

		let visible = true;
		const io =
			typeof IntersectionObserver !== 'undefined'
				? new IntersectionObserver(([entry]) => {
						visible = entry.isIntersecting;
						if (visible && document.visibilityState !== 'hidden') start();
						else stop();
					})
				: null;
		io?.observe(canvas);
		function onVis(): void {
			if (document.visibilityState === 'hidden') stop();
			else if (visible) start();
		}
		document.addEventListener('visibilitychange', onVis);
		if (!io) start();

		return () => {
			stop();
			io?.disconnect();
			document.removeEventListener('visibilitychange', onVis);
		};
	}, [state, size, dark, speed, paused, reduced]);

	return <canvas
		ref={ref}
		role="img"
		aria-label={ariaLabel ?? LABELS[state]}
		style={{ width: size, height: size, display: 'block', ...style }}
		{...rest}
	/>;
}

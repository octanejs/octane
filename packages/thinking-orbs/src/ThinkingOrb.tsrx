import { useEffect, useRef, useState, type OctaneNode } from 'octane';
import { MODE_DRAWS } from './engine/registry';
import { resolvePreset } from './presets';
import type { OrbTheme, ThinkingOrbProps } from './types';

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

function ancestorTheme(element: Element | null): boolean | null {
	let node = element;
	while (node) {
		const attribute = node.getAttribute('data-theme');
		if (attribute === 'dark') return true;
		if (attribute === 'light') return false;
		if (node.classList.contains('dark')) return true;
		if (node.classList.contains('light')) return false;
		node = node.parentElement;
	}
	return null;
}

function systemDark(): boolean {
	return typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThinkingOrb({
	state = 'working',
	size = 64,
	theme = 'auto',
	speed = 1,
	paused = false,
	style,
	'aria-label': ariaLabel,
	...rest
}: ThinkingOrbProps): OctaneNode {
	const ref = useRef<HTMLCanvasElement | null>(null);
	const [dark, setDark] = useState(true);
	const [reduced, setReduced] = useState(false);

	useEffect(() => {
		if (theme === 'dark') {
			setDark(true);
			return;
		}
		if (theme === 'light') {
			setDark(false);
			return;
		}

		const resolve = () => setDark(ancestorTheme(ref.current) ?? systemDark());
		resolve();
		const media =
			typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');
		media?.addEventListener('change', resolve);

		const observer =
			typeof MutationObserver !== 'undefined' && ref.current ? new MutationObserver(resolve) : null;
		observer?.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'data-theme'],
			subtree: true,
		});

		return () => {
			media?.removeEventListener('change', resolve);
			observer?.disconnect();
		};
	}, [theme]);

	useEffect(() => {
		if (typeof matchMedia === 'undefined') return;
		const media = matchMedia('(prefers-reduced-motion: reduce)');
		setReduced(media.matches);
		const update = (event: MediaQueryListEvent) => setReduced(event.matches);
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	}, []);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const pixelRatio = Math.min(
			2,
			typeof devicePixelRatio !== 'undefined' && devicePixelRatio || 1,
		);
		canvas.width = Math.round(size * pixelRatio);
		canvas.height = Math.round(size * pixelRatio);
		const context = canvas.getContext('2d');
		if (!context) return;

		const { mode, speed: baseSpeed, opts } = resolvePreset(state, size);
		const draw = MODE_DRAWS[mode];
		const effectiveSpeed = baseSpeed * speed;
		const frame = (seconds: number) => {
			context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
			context.clearRect(0, 0, size, size);
			draw(context, size, seconds, dark, opts);
		};

		if (reduced) {
			frame(0.6);
			return;
		}

		let animationFrame = 0;
		let running = false;
		const loop = () => {
			frame((performance.now() / 1000) * effectiveSpeed);
			if (running) animationFrame = requestAnimationFrame(loop);
		};
		const start = () => {
			if (running || paused) return;
			running = true;
			animationFrame = requestAnimationFrame(loop);
		};
		const stop = () => {
			running = false;
			cancelAnimationFrame(animationFrame);
		};

		frame((performance.now() / 1000) * effectiveSpeed);

		let visible = true;
		const observer =
			typeof IntersectionObserver === 'undefined'
				? null
				: new IntersectionObserver(([entry]) => {
						visible = entry.isIntersecting;
						if (visible && document.visibilityState !== 'hidden') start();
						else stop();
					});
		observer?.observe(canvas);
		const onVisibilityChange = () => {
			if (document.visibilityState === 'hidden') stop();
			else if (visible) start();
		};
		document.addEventListener('visibilitychange', onVisibilityChange);
		if (!observer) start();

		return () => {
			stop();
			observer?.disconnect();
			document.removeEventListener('visibilitychange', onVisibilityChange);
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

import { useCallback, useEffect, useRef, useState } from 'octane';

export type RectReadOnly = {
	x: number;
	y: number;
	width: number;
	height: number;
	top: number;
	right: number;
	bottom: number;
	left: number;
};

export type ResizeObserverConstructor =
	new (callback: ResizeObserverCallback) => Pick<ResizeObserver, | 'observe'
	| 'unobserve'
	| 'disconnect'>;

export type Options = {
	debounce?: number | { scroll?: number; resize?: number };
	scroll?: boolean;
	polyfill?: ResizeObserverConstructor;
	offsetSize?: boolean;
};

const ZERO_RECT: RectReadOnly = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	top: 0,
	right: 0,
	bottom: 0,
	left: 0,
};

function sameRect(a: RectReadOnly, b: RectReadOnly): boolean {
	return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
		a.top === b.top &&
		a.right === b.right &&
		a.bottom === b.bottom &&
		a.left === b.left;
}

export default function useMeasure(options: Options = {}) {
	const elementRef = useRef<HTMLElement | SVGElement | null>(null);
	const frameRef = useRef<number | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [bounds, setBounds] = useState<RectReadOnly>(ZERO_RECT);

	const refresh = useCallback(() => {
		const element = elementRef.current;
		if (!element || typeof element.getBoundingClientRect !== 'function') return;
		const rect = element.getBoundingClientRect();
		const width =
			options.offsetSize && 'offsetWidth' in element
				? (element as HTMLElement).offsetWidth
				: rect.width;
		const height =
			options.offsetSize && 'offsetHeight' in element
				? (element as HTMLElement).offsetHeight
				: rect.height;
		const next: RectReadOnly = {
			x: rect.x,
			y: rect.y,
			width,
			height,
			top: rect.top,
			right: rect.left + width,
			bottom: rect.top + height,
			left: rect.left,
		};
		setBounds((previous) => (sameRect(previous, next) ? previous : next));
	}, [options.offsetSize]);

	const scheduleRefresh = useCallback(() => {
		if (typeof requestAnimationFrame === 'undefined') {
			refresh();
			return;
		}
		if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null;
			refresh();
		});
	}, [refresh]);

	const detach = useCallback(() => {
		cleanupRef.current?.();
		cleanupRef.current = null;
	}, []);

	const ref = useCallback((element: HTMLElement | SVGElement | null) => {
		detach();
		elementRef.current = element;
		if (!element || typeof window === 'undefined') return;

		const ResizeObserverImpl = options.polyfill ?? window.ResizeObserver;
		const observer = ResizeObserverImpl ? new ResizeObserverImpl(scheduleRefresh) : null;
		observer?.observe(element);
		window.addEventListener('resize', scheduleRefresh);
		if (options.scroll) window.addEventListener('scroll', scheduleRefresh, true);
		scheduleRefresh();

		cleanupRef.current = () => {
			observer?.disconnect();
			window.removeEventListener('resize', scheduleRefresh);
			if (options.scroll) window.removeEventListener('scroll', scheduleRefresh, true);
			if (frameRef.current != null) {
				cancelAnimationFrame(frameRef.current);
				frameRef.current = null;
			}
			if (elementRef.current === element) elementRef.current = null;
		};
	}, [detach, options.polyfill, options.scroll, scheduleRefresh]);

	useEffect(() => () => detach(), [detach]);

	return [ref, bounds, refresh] as const;
}

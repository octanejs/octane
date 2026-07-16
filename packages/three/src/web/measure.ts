import type { Size } from '../core/store.js';

export interface ResizeOptions {
	debounce?: number | { resize: number; scroll: number };
	scroll?: boolean;
	polyfill?: ResizeObserverConstructor;
	offsetSize?: boolean;
}

export interface ResizeObserverConstructor {
	new (callback: ResizeObserverCallback): ResizeObserver;
}

function debounceDelay(options: ResizeOptions, kind: 'resize' | 'scroll'): number {
	const configured = options.debounce;
	if (typeof configured === 'number') return configured;
	return configured?.[kind] ?? 0;
}

function measuredSize(
	element: HTMLElement,
	entry: ResizeObserverEntry | undefined,
	offsetSize: boolean,
): Size {
	const bounds = element.getBoundingClientRect();
	let width = bounds.width;
	let height = bounds.height;
	if (offsetSize) {
		width = element.offsetWidth;
		height = element.offsetHeight;
	} else if (entry !== undefined) {
		// ResizeObserver callbacks can arrive before layout APIs expose their new
		// values (and controlled test/browser shims commonly behave this way).
		// Prefer the element rect, but retain the observer's positive dimensions.
		if (width <= 0 && entry.contentRect.width > 0) width = entry.contentRect.width;
		if (height <= 0 && entry.contentRect.height > 0) height = entry.contentRect.height;
	}
	return { width, height, top: bounds.top, left: bounds.left };
}

/**
 * Observe the DOM box used to configure a Three root.
 *
 * The first rect is delivered synchronously; a zero-sized shell remains
 * dormant until ResizeObserver reports a positive layout.
 */
export function observeCanvasSize(
	element: HTMLElement,
	options: ResizeOptions,
	onSize: (size: Size) => void,
): () => void {
	let disposed = false;
	let resizeTimer: ReturnType<typeof setTimeout> | undefined;
	let scrollTimer: ReturnType<typeof setTimeout> | undefined;
	const deliver = (entry?: ResizeObserverEntry) => {
		if (!disposed) onSize(measuredSize(element, entry, options.offsetSize === true));
	};
	const schedule = (kind: 'resize' | 'scroll', entry?: ResizeObserverEntry) => {
		const delay = debounceDelay(options, kind);
		if (delay <= 0) {
			deliver(entry);
			return;
		}
		if (kind === 'resize') {
			if (resizeTimer !== undefined) clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => deliver(entry), delay);
		} else {
			if (scrollTimer !== undefined) clearTimeout(scrollTimer);
			scrollTimer = setTimeout(() => deliver(entry), delay);
		}
	};

	const Observer = options.polyfill ?? globalThis.ResizeObserver;
	const observer =
		typeof Observer === 'function'
			? new Observer((entries) => schedule('resize', entries[0]))
			: undefined;
	observer?.observe(element);

	const handleScroll = () => schedule('scroll');
	if (options.scroll === true && typeof window !== 'undefined') {
		window.addEventListener('scroll', handleScroll, true);
	}
	deliver();

	return () => {
		if (disposed) return;
		disposed = true;
		if (resizeTimer !== undefined) clearTimeout(resizeTimer);
		if (scrollTimer !== undefined) clearTimeout(scrollTimer);
		observer?.disconnect();
		if (options.scroll === true && typeof window !== 'undefined') {
			window.removeEventListener('scroll', handleScroll, true);
		}
	};
}

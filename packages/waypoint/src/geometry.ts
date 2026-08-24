import { ABOVE, BELOW, INSIDE, INVISIBLE, type WaypointBounds } from './types';

export function parseOffset(value: string | number | undefined, contextSize: number) {
	if (value === undefined) return 0;
	if (typeof value === 'number') return value;
	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed)) return 0;
	return value.trim().endsWith('%') ? (parsed / 100) * contextSize : parsed;
}

export function resolveScrollableAncestorProp(
	scrollableAncestor: Window | Element | 'window',
): Window | Element {
	// Upstream accepts the string form so SSR can force the window without
	// referencing `window` during render. Resolve through `globalThis.window`
	// (same as upstream `global.window`) so node tests can stub it.
	if (scrollableAncestor === 'window') {
		return globalThis.window;
	}
	return scrollableAncestor;
}

export function findScrollableAncestor(node: Element, horizontal = false): Element | Window {
	let ancestor = node.parentElement;
	const overflowProperty = horizontal ? 'overflowX' : 'overflowY';
	while (ancestor) {
		if (ancestor === document.body || ancestor === document.documentElement) return window;
		const overflow = window.getComputedStyle(ancestor)[overflowProperty];
		if (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') return ancestor;
		ancestor = ancestor.parentElement;
	}
	return window;
}

export function getBounds(
	node: Element,
	ancestor: Element | Window,
	options: { horizontal?: boolean; topOffset?: string | number; bottomOffset?: string | number },
): WaypointBounds {
	const horizontal = Boolean(options.horizontal);
	const nodeRect = node.getBoundingClientRect();
	const isWindow = ancestor === window;
	// Upstream sizes a non-window scroll parent with offsetWidth/offsetHeight
	// (border-box layout size), not getBoundingClientRect width/height.
	const ancestorElement = isWindow ? null : (ancestor as HTMLElement);
	const ancestorRect = ancestorElement ? ancestorElement.getBoundingClientRect() : null;
	const contextSize = isWindow
		? horizontal
			? window.innerWidth
			: window.innerHeight
		: horizontal
			? ancestorElement!.offsetWidth
			: ancestorElement!.offsetHeight;
	const contextStart = isWindow ? 0 : horizontal ? ancestorRect!.left : ancestorRect!.top;
	const contextEnd = contextStart + contextSize;
	const topOffset = parseOffset(options.topOffset, contextSize);
	const bottomOffset = parseOffset(options.bottomOffset, contextSize);
	const waypointTop = horizontal ? nodeRect.left : nodeRect.top;
	const waypointBottom = horizontal ? nodeRect.right : nodeRect.bottom;
	return {
		waypointTop,
		waypointBottom,
		viewportTop: contextStart + topOffset,
		viewportBottom: contextEnd - bottomOffset,
	};
}

export function getCurrentPosition(bounds: WaypointBounds | null) {
	if (!bounds) return INVISIBLE;
	// Per upstream getCurrentPosition.js: a zero-height scrollable parent
	// (e.g. display:none) is invisible, not inside.
	if (bounds.viewportBottom - bounds.viewportTop === 0) return INVISIBLE;
	if (bounds.viewportTop <= bounds.waypointTop && bounds.waypointTop <= bounds.viewportBottom) {
		return INSIDE;
	}
	if (
		bounds.viewportTop <= bounds.waypointBottom &&
		bounds.waypointBottom <= bounds.viewportBottom
	) {
		return INSIDE;
	}
	if (bounds.waypointTop <= bounds.viewportTop && bounds.viewportBottom <= bounds.waypointBottom) {
		return INSIDE;
	}
	if (bounds.viewportBottom < bounds.waypointTop) return BELOW;
	if (bounds.waypointTop < bounds.viewportTop) return ABOVE;
	return INVISIBLE;
}

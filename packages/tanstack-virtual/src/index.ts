// @octanejs/tanstack-virtual — TanStack Virtual for the octane renderer.
//
// TanStack Virtual separates a framework-agnostic core (`@tanstack/virtual-core`:
// the Virtualizer class + scroll/rect observers + windowing math) from a small
// React adapter (`useVirtualizer`, `useWindowVirtualizer`). This package reuses
// the core UNCHANGED (re-exported verbatim) and transcribes only the adapter
// onto octane's hooks, preserving upstream's exact shape — a force-update
// useReducer wired into the instance's onChange (flushSync for sync scroll
// notifies), a create-once Virtualizer in useState, setOptions re-composed
// every render, and three layout effects (_didMount once, _willUpdate every
// render, direct-DOM style application every render). The public surface
// matches @tanstack/react-virtual 1:1 — existing code works by changing the
// import.
//
// The one octane-specific detail is hook slots: octane keys hooks by a
// compiler-injected per-call-site Symbol, appended as the LAST argument of
// every `use*` call. The hooks here forward that slot into their composed base
// hooks (deriving a stable sub-slot each), so two virtualizers in one
// component stay independent, just like in React.
//
// Note on flushSync: octane's flushSync called while a flush is already on the
// stack degrades to a plain fn() and lets the ambient flush drain the work
// (runtime.ts re-entrancy guard) — consumer-invisible at flush boundaries;
// pinned by a conformance test.
import { flushSync, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'octane';
import {
	Virtualizer,
	elementScroll,
	observeElementOffset,
	observeElementRect,
	observeWindowOffset,
	observeWindowRect,
	windowScroll,
} from '@tanstack/virtual-core';
import type { PartialKeys, VirtualizerOptions } from '@tanstack/virtual-core';
import { splitSlot, subSlot } from './internal';

export * from '@tanstack/virtual-core';

export type ReactVirtualizer<
	TScrollElement extends Element | Window,
	TItemElement extends Element,
> = Virtualizer<TScrollElement, TItemElement> & {
	/**
	 * Ref callback for the inner size container element. Only meaningful when
	 * `directDomUpdates: true` — the virtualizer writes the container's
	 * main-axis size (`height` or `width`) directly to skip re-renders.
	 */
	containerRef: (node: HTMLElement | null) => void;
};

export type ReactVirtualizerOptions<
	TScrollElement extends Element | Window,
	TItemElement extends Element,
> = VirtualizerOptions<TScrollElement, TItemElement> & {
	useFlushSync?: boolean;
	/**
	 * Skip re-renders for scroll-only updates: the virtualizer writes item
	 * positions and the container size directly to the DOM, and only
	 * re-renders when the visible index range or `isScrolling` changes. See
	 * upstream @tanstack/react-virtual docs for the layout requirements.
	 */
	directDomUpdates?: boolean;
	/** How `directDomUpdates` positions items: `'transform'` (default) or `'position'`. */
	directDomUpdatesMode?: 'position' | 'transform';
};

interface DirectDomState {
	enabled: boolean;
	mode: 'position' | 'transform';
	container: HTMLElement | null;
	lastSize: number | null;
	// Keyed by the element itself so a remounted node (same key, new DOM
	// node — e.g. when `enabled` is toggled off then on) is treated as fresh
	// and gets its style written.
	lastPositions: WeakMap<Element, number>;
	prevRange: { startIndex: number; endIndex: number; isScrolling: boolean } | null;
}

function useVirtualizerBase<TScrollElement extends Element | Window, TItemElement extends Element>(
	{
		useFlushSync = true,
		directDomUpdates = false,
		directDomUpdatesMode = 'transform',
		...options
	}: VirtualizerOptions<TScrollElement, TItemElement> & {
		useFlushSync?: boolean;
		directDomUpdates?: boolean;
		directDomUpdatesMode?: 'position' | 'transform';
	},
	slot: symbol | undefined,
): ReactVirtualizer<TScrollElement, TItemElement> {
	const rerender = useReducer<number, void, number>((x) => x + 1, 0, subSlot(slot, 'uvb:r'))[1];

	const directRef = useRef<DirectDomState>(
		{
			enabled: directDomUpdates,
			mode: directDomUpdatesMode,
			container: null,
			lastSize: null,
			lastPositions: new WeakMap(),
			prevRange: null,
		},
		subSlot(slot, 'uvb:d'),
	);
	directRef.current.enabled = directDomUpdates;
	directRef.current.mode = directDomUpdatesMode;

	const applyDirectStyles = (instance: Virtualizer<TScrollElement, TItemElement>) => {
		const state = directRef.current;
		if (!state.enabled || !state.container) return;
		const totalSize = instance.getTotalSize();
		if (totalSize !== state.lastSize) {
			state.lastSize = totalSize;
			const sizeAxis = instance.options.horizontal ? 'width' : 'height';
			state.container.style[sizeAxis] = `${totalSize}px`;
		}
		const horizontal = !!instance.options.horizontal;
		const useTransform = state.mode === 'transform';
		const posAxis = horizontal ? 'left' : 'top';
		const scrollMargin = instance.options.scrollMargin;
		const items = instance.getVirtualItems();
		for (const item of items) {
			const next = item.start - scrollMargin;
			const el = instance.elementsCache.get(item.key) as HTMLElement | undefined;
			if (!el) continue;
			if (state.lastPositions.get(el) === next) continue;
			state.lastPositions.set(el, next);
			if (useTransform) {
				el.style.transform = horizontal
					? `translate3d(${next}px, 0, 0)`
					: `translate3d(0, ${next}px, 0)`;
			} else {
				el.style[posAxis] = `${next}px`;
			}
		}
	};

	const resolvedOptions: VirtualizerOptions<TScrollElement, TItemElement> = {
		...options,
		onChange: (instance, sync) => {
			const state = directRef.current;
			let shouldRerender = true;
			if (state.enabled) {
				applyDirectStyles(instance);
				const range = instance.range;
				const prev = state.prevRange;
				shouldRerender =
					!prev ||
					prev.isScrolling !== instance.isScrolling ||
					prev.startIndex !== range?.startIndex ||
					prev.endIndex !== range?.endIndex;
				if (shouldRerender) {
					state.prevRange = range
						? {
								startIndex: range.startIndex,
								endIndex: range.endIndex,
								isScrolling: instance.isScrolling,
							}
						: null;
				}
			}
			if (shouldRerender) {
				if (useFlushSync && sync) {
					flushSync(rerender);
				} else {
					rerender();
				}
			}
			options.onChange?.(instance, sync);
		},
	};

	const [instance] = useState(
		() => {
			const v = new Virtualizer<TScrollElement, TItemElement>(resolvedOptions);
			return Object.assign(v, {
				containerRef: (node: HTMLElement | null) => {
					const state = directRef.current;
					state.container = node;
					state.lastSize = null;
					if (node && state.enabled) {
						const total = v.getTotalSize();
						state.lastSize = total;
						const axis = v.options.horizontal ? 'width' : 'height';
						node.style[axis] = `${total}px`;
					}
				},
			});
		},
		subSlot(slot, 'uvb:i'),
	);

	instance.setOptions(resolvedOptions);

	useIsomorphicLayoutEffect(() => instance._didMount(), [], subSlot(slot, 'uvb:m'));
	useIsomorphicLayoutEffect(() => instance._willUpdate(), undefined, subSlot(slot, 'uvb:w'));
	useIsomorphicLayoutEffect(
		() => {
			applyDirectStyles(instance);
		},
		undefined,
		subSlot(slot, 'uvb:s'),
	);

	return instance;
}

// SSR guard, ported as-is: on the server the layout-effect work (observer
// wiring) is skipped and the first paint windows from initialRect/initialOffset.
function useIsomorphicLayoutEffect(
	fn: () => void | (() => void),
	deps: unknown[] | undefined,
	slot: symbol,
): void {
	if (typeof document !== 'undefined') {
		useLayoutEffect(fn, deps, slot);
	} else {
		useEffect(fn, deps, slot);
	}
}

export function useVirtualizer<TScrollElement extends Element, TItemElement extends Element>(
	options: PartialKeys<
		ReactVirtualizerOptions<TScrollElement, TItemElement>,
		'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
	>,
	...rest: unknown[]
): ReactVirtualizer<TScrollElement, TItemElement> {
	const [, slot] = splitSlot(rest);
	return useVirtualizerBase<TScrollElement, TItemElement>(
		{
			observeElementRect,
			observeElementOffset,
			scrollToFn: elementScroll,
			...options,
		},
		slot,
	);
}

export function useWindowVirtualizer<TItemElement extends Element>(
	options: PartialKeys<
		ReactVirtualizerOptions<Window, TItemElement>,
		'getScrollElement' | 'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
	>,
	...rest: unknown[]
): ReactVirtualizer<Window, TItemElement> {
	const [, slot] = splitSlot(rest);
	return useVirtualizerBase<Window, TItemElement>(
		{
			getScrollElement: () => (typeof document !== 'undefined' ? window : null),
			observeElementRect: observeWindowRect,
			observeElementOffset: observeWindowOffset,
			scrollToFn: windowScroll,
			initialOffset: () => (typeof document !== 'undefined' ? window.scrollY : 0),
			...options,
		},
		slot,
	);
}

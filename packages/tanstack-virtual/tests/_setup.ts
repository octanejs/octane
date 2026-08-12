/**
 * Per-test setup for the `tanstack-virtual` project (vitest `setupFiles`) —
 * the jsdom affordances virtual-core needs, applied identically to BOTH sides
 * of the differential rig (one jsdom process):
 *
 * 1. Guarded no-op ResizeObserver (radix differential precedent): virtual-core
 *    constructs one in observeElementRect / per-item measurement; the stub
 *    keeps both runtimes on the same do-nothing path. Rect data comes from
 *    fixtures' `initialRect` + custom `observeElementRect` options instead
 *    (jsdom offsetWidth/offsetHeight are 0 — the default observer would
 *    clobber initialRect with a 0×0 rect).
 *
 * 2. `Element.prototype.scrollTo` shim: jsdom doesn't implement it (virtual
 *    core's elementScroll scrollToFn calls it). The shim applies the offset to
 *    scrollTop/scrollLeft and fires a native `scroll` event — which is exactly
 *    what a real browser's instant scroll does — so `scrollToOffset` /
 *    `scrollToIndex` genuinely work. `behavior: 'smooth'` is treated as
 *    instant (the smooth path is an rAF reconcile loop — nondeterministic in
 *    tests; fixtures never request it).
 *
 * 3. `scrollHeight`/`scrollWidth` prototype getters → MAX_SAFE_INTEGER
 *    (mirrors upstream react-virtual's own test beforeEach): virtual-core
 *    clamps scroll targets against the scroll dimensions, and jsdom's native 0
 *    would clamp every scrollToOffset to 0.
 */

if (!('ResizeObserver' in globalThis)) {
	(globalThis as any).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

if (typeof Element !== 'undefined') {
	const proto = Element.prototype as any;
	proto.scrollTo = function scrollTo(optionsOrX?: ScrollToOptions | number, y?: number) {
		let left: number | undefined;
		let top: number | undefined;
		if (typeof optionsOrX === 'object' && optionsOrX !== null) {
			left = optionsOrX.left;
			top = optionsOrX.top;
		} else {
			left = optionsOrX;
			top = y;
		}
		if (left !== undefined) this.scrollLeft = left;
		if (top !== undefined) this.scrollTop = top;
		this.dispatchEvent(new Event('scroll'));
	};

	Object.defineProperties(HTMLElement.prototype, {
		scrollHeight: { configurable: true, get: () => Number.MAX_SAFE_INTEGER },
		scrollWidth: { configurable: true, get: () => Number.MAX_SAFE_INTEGER },
	});
}

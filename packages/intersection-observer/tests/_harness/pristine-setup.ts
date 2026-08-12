/**
 * Ensure jsdom exposes a non-mock IntersectionObserver before upstream
 * test-utils captures `originalIntersectionObserver` at module load.
 */
class NativeIntersectionObserverStub {
	readonly root: Element | Document | null = null;
	readonly rootMargin = '0px';
	readonly thresholds: ReadonlyArray<number> = [0];
	constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
	observe() {}
	unobserve() {}
	disconnect() {}
	takeRecords(): IntersectionObserverEntry[] {
		return [];
	}
}

if (typeof window !== 'undefined' && typeof window.IntersectionObserver !== 'function') {
	Object.defineProperty(window, 'IntersectionObserver', {
		configurable: true,
		writable: true,
		value: NativeIntersectionObserverStub,
	});
}

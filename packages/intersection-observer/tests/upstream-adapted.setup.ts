import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Install a non-mock IntersectionObserver before test-utils captures
 * `originalIntersectionObserver` at module load.
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

if (typeof window !== 'undefined') {
	Object.defineProperty(window, 'IntersectionObserver', {
		configurable: true,
		writable: true,
		value: NativeIntersectionObserverStub,
	});
}

// Expose vitest's `vi` for setup.test.ts and test-utils mocking detection.
(globalThis as { vi?: typeof vi }).vi = vi;

const { cleanup } = await import('@octanejs/testing-library');
const { destroyIntersectionMocking, setupIntersectionMocking } = await import('../src/test-utils');
const { defaultFallbackInView } = await import('../src/observe');

// Upstream's test-utils auto-registers its mocking beforeEach when test
// globals exist; the Octane port intentionally does not (documented
// divergence), so the adapted suite installs the same baseline here instead of
// editing every regenerated upstream file.
beforeEach(function installMocks() {
	setupIntersectionMocking(vi.fn);
});

afterEach(function teardownMocks() {
	destroyIntersectionMocking();
	defaultFallbackInView(undefined);
	cleanup();
	document.body.replaceChildren();
	// Reinstall the native stub so the next file's beforeEach mocks a real baseline.
	Object.defineProperty(window, 'IntersectionObserver', {
		configurable: true,
		writable: true,
		value: NativeIntersectionObserverStub,
	});
});

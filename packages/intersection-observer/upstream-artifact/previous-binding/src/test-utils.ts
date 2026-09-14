import { act } from 'octane';

type MockFn = <T extends (...args: any[]) => any>(
	implementation?: T,
) => T & {
	mock: { calls: Parameters<T>[] };
	mockClear(): void;
	mockRestore?(): void;
};

interface ObserverRecord {
	callback: IntersectionObserverCallback;
	elements: Set<Element>;
	instance: IntersectionObserver;
}

const observers = new Map<IntersectionObserver, ObserverRecord>();
// Snapshot at module load so repeated setup/destroy cycles restore the native
// constructor instead of the mock installed by a prior setup call.
const originalIntersectionObserver =
	typeof window !== 'undefined' ? window.IntersectionObserver : undefined;

function testLibraryUtil(): { fn: MockFn; isMockFunction?(value: unknown): boolean } | undefined {
	const globalVi = (globalThis as { vi?: { fn: MockFn; isMockFunction?(value: unknown): boolean } })
		.vi;
	if (globalVi) return globalVi;
	return undefined;
}

function isMocking() {
	const util = testLibraryUtil();
	if (util && typeof util.isMockFunction === 'function') {
		return util.isMockFunction(window.IntersectionObserver);
	}
	if (
		typeof window !== 'undefined' &&
		window.IntersectionObserver &&
		'mockClear' in window.IntersectionObserver
	) {
		return true;
	}
	return false;
}

function warnOnMissingSetup() {
	if (isMocking()) return;
	console.error(
		`@octanejs/intersection-observer was not configured to handle mocking.
Unlike upstream react-intersection-observer, this binding does not auto-register Vitest/Jest beforeEach/afterEach. Call setupIntersectionMocking() and resetIntersectionMocking() in your test setup file (including under Vitest and Jest).

// test-setup.js
import { resetIntersectionMocking, setupIntersectionMocking } from '@octanejs/intersection-observer/test-utils';

beforeEach(() => {
  setupIntersectionMocking(vi.fn);
});

afterEach(() => {
  resetIntersectionMocking();
});`,
	);
}

function entryFor(element: Element, isIntersecting: boolean, ratio: number) {
	const rect = element.getBoundingClientRect();
	return {
		boundingClientRect: rect,
		intersectionRatio: ratio,
		intersectionRect: isIntersecting ? rect : DOMRectReadOnly.fromRect(),
		isIntersecting,
		rootBounds: DOMRectReadOnly.fromRect(),
		target: element,
		time: Date.now(),
	} satisfies IntersectionObserverEntry;
}

function intersectionState(observer: IntersectionObserver, trigger: boolean | number) {
	if (typeof trigger === 'boolean') {
		return { isIntersecting: trigger, ratio: trigger ? 1 : 0 };
	}
	const intersectedThresholds = observer.thresholds.filter(function keep(threshold) {
		return trigger >= threshold;
	});
	return {
		isIntersecting: intersectedThresholds.length > 0,
		ratio: intersectedThresholds.at(-1) ?? 0,
	};
}

export function setupIntersectionMocking(mockFn: MockFn) {
	window.IntersectionObserver = mockFn(function IntersectionObserverMock(
		callback: IntersectionObserverCallback,
		options: IntersectionObserverInit = {},
	) {
		const elements = new Set<Element>();
		const instance = {
			thresholds: Array.isArray(options.threshold) ? options.threshold : [options.threshold ?? 0],
			root: options.root ?? null,
			rootMargin: options.rootMargin ?? '',
			scrollMargin: (options as { scrollMargin?: string }).scrollMargin ?? '',
			observe: mockFn(function observe(element: Element) {
				elements.add(element);
			}),
			unobserve: mockFn(function unobserve(element: Element) {
				elements.delete(element);
			}),
			disconnect: mockFn(function disconnect() {
				observers.delete(instance);
				elements.clear();
			}),
			takeRecords: mockFn(function takeRecords() {
				return [];
			}),
		} as unknown as IntersectionObserver;
		observers.set(instance, { callback, elements, instance });
		return instance;
	}) as unknown as typeof IntersectionObserver;
}

export function resetIntersectionMocking() {
	observers.clear();
	(window.IntersectionObserver as unknown as { mockClear?: () => void } | undefined)?.mockClear?.();
}

export function destroyIntersectionMocking() {
	resetIntersectionMocking();
	if (originalIntersectionObserver) window.IntersectionObserver = originalIntersectionObserver;
	else
		delete (window as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
}

export function mockAllIsIntersecting(isIntersecting: boolean | number) {
	warnOnMissingSetup();
	act(function notifyAll() {
		observers.forEach(function notify({ callback, elements, instance }) {
			const state = intersectionState(instance, isIntersecting);
			callback(
				[...elements].map(function toEntry(element) {
					return entryFor(element, state.isIntersecting, state.ratio);
				}),
				instance,
			);
		});
	});
}

export function mockIsIntersecting(element: Element, isIntersecting: boolean | number) {
	warnOnMissingSetup();
	const matching = [...observers.values()].filter(function hasElement({ elements }) {
		return elements.has(element);
	});
	if (matching.length === 0) {
		throw new Error('Failed to find IntersectionObserver for element. Is it being observed?');
	}
	act(function notifyMatching() {
		for (const observer of matching) {
			const state = intersectionState(observer.instance, isIntersecting);
			observer.callback([entryFor(element, state.isIntersecting, state.ratio)], observer.instance);
		}
	});
}

export function intersectionMockInstance(element: Element) {
	warnOnMissingSetup();
	const observer = [...observers.values()].find(function hasElement({ elements }) {
		return elements.has(element);
	});
	if (!observer) {
		throw new Error('Failed to find IntersectionObserver for element. Is it being observed?');
	}
	return observer.instance;
}

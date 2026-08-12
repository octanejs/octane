import { describe, expect, it, vi } from 'vitest';
import { act, flushEffects, mount } from '../../../octane/tests/_helpers';
import { Globals } from '../../src/index';
import { BrowserHooksFixture } from '../_fixtures/browser-hooks.tsrx';

describe('React Spring browser hooks', () => {
	// Per packages/shared/src/dom-events/resize/resizeElement.test.ts:16
	it('stops resize springs when ResizeObserver is unavailable', () => {
		vi.stubGlobal('ResizeObserver', undefined);
		const target = document.createElement('div');
		vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
			width: 320,
			height: 180,
		} as DOMRect);
		let latest: any;
		const result = mount(BrowserHooksFixture, {
			container: { current: target },
			onReady: (value: any) => (latest = value),
		});
		flushEffects();
		const stopWidth = vi.spyOn(latest.resize.width, 'stop');
		const stopHeight = vi.spyOn(latest.resize.height, 'stop');

		result.unmount();

		expect(stopWidth).toHaveBeenCalledWith(true);
		expect(stopHeight).toHaveBeenCalledWith(true);
	});

	// Per packages/shared/src/hooks/useReducedMotion.test.ts:29
	it('reports scroll, resize, intersection, and reduced motion and cleans up', async () => {
		const listeners = new Map<string, EventListener>();
		const target = document.createElement('div');
		Object.defineProperties(target, {
			scrollLeft: { value: 25, writable: true },
			scrollTop: { value: 50, writable: true },
			scrollWidth: { value: 200 },
			scrollHeight: { value: 300 },
			clientWidth: { value: 100 },
			clientHeight: { value: 100 },
		});
		vi.spyOn(target, 'addEventListener').mockImplementation((type, listener) => {
			listeners.set(type, listener as EventListener);
		});
		const remove = vi.spyOn(target, 'removeEventListener');
		const container = { current: target };

		let resizeCallback!: ResizeObserverCallback;
		const disconnectResize = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: ResizeObserverCallback) {
					resizeCallback = callback;
				}
				observe() {}
				disconnect() {
					disconnectResize();
				}
			},
		);
		let intersectionCallback!: IntersectionObserverCallback;
		const disconnectIntersection = vi.fn();
		vi.stubGlobal(
			'IntersectionObserver',
			class {
				constructor(callback: IntersectionObserverCallback) {
					intersectionCallback = callback;
				}
				observe() {}
				disconnect() {
					disconnectIntersection();
				}
			},
		);
		let mediaListener!: () => void;
		const removeMedia = vi.fn();
		const media = {
			matches: false,
			addEventListener: (_type: string, listener: () => void) => (mediaListener = listener),
			removeEventListener: removeMedia,
		};
		vi.stubGlobal('matchMedia', () => media as MediaQueryList);

		let latest: any;
		const result = mount(BrowserHooksFixture, {
			container,
			once: true,
			onReady: (value: any) => (latest = value),
		});
		flushEffects();
		expect(latest.scroll.scrollY.get()).toBe(50);
		expect(latest.scroll.scrollYProgress.get()).toBe(0.25);

		resizeCallback(
			[{ contentRect: { width: 320, height: 180 } } as ResizeObserverEntry],
			{} as ResizeObserver,
		);
		expect(latest.resize.width.get()).toBe(320);

		await act(() =>
			intersectionCallback(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				{} as IntersectionObserver,
			),
		);
		flushEffects();
		expect(latest.inView).toBe(true);
		media.matches = true;
		await act(() => mediaListener());
		flushEffects();
		expect(latest.reducedMotion).toBe(true);
		expect(Globals.skipAnimation).toBe(true);

		result.unmount();
		expect(remove).toHaveBeenCalledWith('scroll', listeners.get('scroll'));
		expect(disconnectResize).toHaveBeenCalled();
		expect(disconnectIntersection).toHaveBeenCalled();
		expect(removeMedia).toHaveBeenCalledWith('change', mediaListener);
		Globals.assign({ skipAnimation: false });
	});
});

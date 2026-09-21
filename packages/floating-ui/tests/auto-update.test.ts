import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoUpdate } from '@octanejs/floating-ui';

class TestResizeObserver implements ResizeObserver {
	static instances: TestResizeObserver[] = [];
	readonly targets = new Set<Element>();
	constructor(private readonly callback: ResizeObserverCallback) {
		TestResizeObserver.instances.push(this);
	}
	observe(target: Element): void {
		this.targets.add(target);
	}
	unobserve(target: Element): void {
		this.targets.delete(target);
	}
	disconnect(): void {
		this.targets.clear();
	}
	deliver(...targets: Element[]): void {
		const entries = targets
			.filter((target) => this.targets.has(target))
			.map((target) => ({
				target,
				contentRect: target.getBoundingClientRect(),
				borderBoxSize: [],
				contentBoxSize: [],
				devicePixelContentBoxSize: [],
			}));
		if (entries.length > 0) this.callback.call(this, entries, this);
	}
}

const cleanups: Array<() => void> = [];
const resizeOnly = { ancestorScroll: false, ancestorResize: false, layoutShift: false };

function elements() {
	const reference = document.createElement('div');
	const floating = document.createElement('div');
	reference.style.width = '100px';
	document.body.append(reference, floating);
	return {
		reference,
		floating,
		update: () => {
			floating.dataset.width = reference.style.width;
		},
	};
}

beforeEach(() => {
	TestResizeObserver.instances = [];
	vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe('@octanejs/floating-ui autoUpdate', () => {
	it('positions immediately and publishes the latest resize outside the native callback', async () => {
		const { reference, floating, update } = elements();
		cleanups.push(autoUpdate(reference, floating, update, resizeOnly));
		expect(floating.dataset.width).toBe('100px');
		const observer = TestResizeObserver.instances[0];
		reference.style.width = '180px';
		observer.deliver(reference);
		reference.style.width = '220px';
		observer.deliver(reference);
		expect(floating.dataset.width).toBe('100px');
		await Promise.resolve();
		expect(floating.dataset.width).toBe('100px');
		await vi.waitFor(() => expect(floating.dataset.width).toBe('220px'));
	});

	it('cancels a pending resize publication when positioning is cleaned up', async () => {
		const { reference, floating, update } = elements();
		const cleanup = autoUpdate(reference, floating, update, resizeOnly);
		cleanups.push(cleanup);
		reference.style.width = '180px';
		TestResizeObserver.instances[0].deliver(reference);
		cleanup();
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(floating.dataset.width).toBe('100px');
	});

	it('observes a virtual reference context element without requiring a floating element', async () => {
		const { reference, floating, update } = elements();
		const virtual = {
			contextElement: reference,
			getBoundingClientRect: () => reference.getBoundingClientRect(),
		};
		cleanups.push(autoUpdate(virtual, null, update, resizeOnly));
		reference.style.width = '180px';
		TestResizeObserver.instances[0].deliver(reference);
		expect(floating.dataset.width).toBe('100px');
		await vi.waitFor(() => expect(floating.dataset.width).toBe('180px'));
	});

	it('retains ancestor resize updates when element observation is disabled', () => {
		const { reference, floating, update } = elements();
		const cleanup = autoUpdate(reference, floating, update, {
			ancestorScroll: false,
			layoutShift: false,
			elementResize: false,
		});
		cleanups.push(cleanup);
		expect(TestResizeObserver.instances).toEqual([]);
		reference.style.width = '180px';
		window.dispatchEvent(new Event('resize'));
		expect(floating.dataset.width).toBe('180px');
		cleanup();
		reference.style.width = '220px';
		window.dispatchEvent(new Event('resize'));
		expect(floating.dataset.width).toBe('180px');
	});

	it('retains ordinary positioning when ResizeObserver is unavailable', () => {
		vi.stubGlobal('ResizeObserver', undefined);
		vi.stubGlobal('cancelAnimationFrame', undefined);
		const { reference, floating, update } = elements();
		const cleanup = autoUpdate(reference, floating, update, {
			ancestorScroll: false,
			layoutShift: false,
		});
		cleanups.push(cleanup);
		reference.style.width = '180px';
		window.dispatchEvent(new Event('resize'));
		expect(floating.dataset.width).toBe('180px');
		cleanup();
	});

	it('respects disabled ancestor events while retaining element resize updates', async () => {
		const { reference, floating, update } = elements();
		cleanups.push(autoUpdate(reference, floating, update, resizeOnly));
		reference.style.width = '180px';
		window.dispatchEvent(new Event('resize'));
		window.dispatchEvent(new Event('scroll'));
		expect(floating.dataset.width).toBe('100px');
		TestResizeObserver.instances[0].deliver(reference);
		await vi.waitFor(() => expect(floating.dataset.width).toBe('180px'));
	});

	it('tracks animated references by frame while observing the floating element', () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextFrame = 0;
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.set(++nextFrame, callback);
			return nextFrame;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => {
			frames.delete(id);
		});
		const { reference, floating, update } = elements();
		reference.getBoundingClientRect = () =>
			new DOMRect(0, 0, Number.parseFloat(reference.style.width), 30);
		const cleanup = autoUpdate(reference, floating, update, {
			...resizeOnly,
			animationFrame: true,
		});
		cleanups.push(cleanup);
		const observer = TestResizeObserver.instances[0];
		expect(observer.targets.has(reference)).toBe(false);
		expect(observer.targets.has(floating)).toBe(true);
		reference.style.width = '180px';
		observer.deliver(reference);
		expect(floating.dataset.width).toBe('100px');
		const [id, callback] = frames.entries().next().value!;
		frames.delete(id);
		callback(0);
		expect(floating.dataset.width).toBe('180px');
		cleanup();
		expect(frames.size).toBe(0);
	});
});

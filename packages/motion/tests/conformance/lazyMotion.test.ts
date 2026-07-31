import { flushSync } from 'octane';
import { describe, expect, it, vi } from 'vitest';

const { animateMock } = vi.hoisted(() => ({
	animateMock: vi.fn(() => ({ stop: vi.fn() })),
}));
vi.mock('motion', () => ({
	animate: animateMock,
	hover: vi.fn(() => vi.fn()),
	press: vi.fn(() => vi.fn()),
	inView: vi.fn(() => vi.fn()),
}));

import { mount, nextPaint } from '../_helpers';
import {
	AsyncLazyMotionSurface,
	FeatureBundleSurface,
	LazyMotionErrorSurface,
	LazyMotionSurface,
	StrictLazyMotionSurface,
	UnloadedMotionSurface,
} from '../_fixtures/lazy-motion.tsrx';
import { domAnimation, domMax } from '../../src/index';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, reject, resolve };
}

async function settleAsyncFeatures(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
	flushSync(() => {});
	await nextPaint();
}

function pointer(type: string, target: EventTarget, clientX: number, clientY: number): void {
	target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, clientY }));
}

describe('LazyMotion and motion/react-m compatibility', () => {
	it('exports named host components that activate from domMax', async () => {
		const result = mount(LazyMotionSurface);
		await nextPaint();

		expect(result.find('#lazy-div').tagName).toBe('DIV');
		expect(result.find('#lazy-span').tagName).toBe('SPAN');
		expect(result.find('#lazy-div').textContent).toBe('lazy');
		expect(animateMock).toHaveBeenCalledWith(result.find('#lazy-div'), { opacity: 1 }, undefined);
		result.unmount();
	});

	it('keeps m hosts inert until a LazyMotion feature bundle is present', async () => {
		animateMock.mockClear();
		const result = mount(UnloadedMotionSurface);
		await nextPaint();

		expect(result.find('#unloaded-div').textContent).toBe('unloaded');
		expect(animateMock).not.toHaveBeenCalled();
		result.unmount();
	});

	it('enforces strict mode for preloaded motion hosts', () => {
		expect(() => mount(StrictLazyMotionSurface)).toThrow(
			'You have rendered a `motion` component within a strict `LazyMotion` component',
		);
	});

	it('updates drag behavior when the feature bundle changes', async () => {
		const onDrag = vi.fn();
		const result = mount(FeatureBundleSurface, { features: domAnimation, onDrag });
		await nextPaint();
		const node = result.find('#feature-bundle-div') as HTMLElement;

		expect(animateMock).toHaveBeenCalledWith(node, { opacity: 1 }, undefined);
		pointer('pointerdown', node, 0, 0);
		pointer('pointermove', window, 20, 10);
		expect(node.style.transform).toBe('');
		expect(onDrag).not.toHaveBeenCalled();

		result.update(FeatureBundleSurface, { features: domMax, onDrag });
		await nextPaint();
		pointer('pointerdown', node, 0, 0);
		pointer('pointermove', window, 20, 10);
		expect(node.style.transform).toBe('translateX(20px) translateY(10px)');
		expect(onDrag).toHaveBeenCalledTimes(1);
		pointer('pointerup', window, 20, 10);
		result.unmount();
	});

	it('keeps async features active when an inline loader is recreated', async () => {
		const load = deferred<typeof domMax>();
		const replacement = deferred<typeof domMax>();
		const firstLoader = vi.fn(() => load.promise);
		const replacementLoader = vi.fn(() => replacement.promise);
		const onDrag = vi.fn();
		const result = mount(FeatureBundleSurface, { features: firstLoader, onDrag });
		await nextPaint();

		load.resolve(domMax);
		await settleAsyncFeatures();

		const node = result.find('#feature-bundle-div') as HTMLElement;
		result.update(FeatureBundleSurface, { features: replacementLoader, onDrag });
		await nextPaint();

		pointer('pointerdown', node, 0, 0);
		pointer('pointermove', window, 20, 10);
		expect(node.style.transform).toBe('translateX(20px) translateY(10px)');
		expect(onDrag).toHaveBeenCalledTimes(1);
		expect(replacementLoader).not.toHaveBeenCalled();
		pointer('pointerup', window, 20, 10);
		result.unmount();
	});

	it('does not reapply initial when async features arrive after mount', async () => {
		const load = deferred<typeof domMax>();
		const result = mount(AsyncLazyMotionSurface, {
			features: () => load.promise,
			initial: { opacity: 0 },
		});
		await nextPaint();
		animateMock.mockClear();

		load.resolve(domMax);
		await settleAsyncFeatures();

		expect(animateMock).toHaveBeenCalledOnce();
		expect(animateMock).toHaveBeenCalledWith(
			result.find('#async-lazy-div'),
			{ opacity: 1 },
			undefined,
		);
		result.unmount();
	});

	it('routes async feature load failures through the nearest error boundary', async () => {
		const load = deferred<typeof domMax>();
		const result = mount(LazyMotionErrorSurface, { features: () => load.promise });
		await nextPaint();

		load.reject(new Error('feature load failed'));
		await settleAsyncFeatures();

		expect(result.find('#lazy-motion-error').textContent).toBe('feature load failed');
		result.unmount();
	});
});

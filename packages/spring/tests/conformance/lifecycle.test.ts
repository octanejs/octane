import { raf } from '@react-spring/rafz';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controller, SpringValue } from '../../src/core/index';

// Additional upstream provenance for shared adapted evidence:
// Per packages/core/src/AnimationConfig.test.ts:6
// Per packages/core/src/hooks/useSpringValue.test.ts:6

afterEach(() => {
	raf.frameLoop = 'always';
	vi.useRealTimers();
});

function advance(frames = 20): void {
	const now = raf.now;
	let time = now();
	raf.now = () => (time += 10);
	try {
		for (let index = 0; index < frames; index++) raf.advance();
	} finally {
		raf.now = now;
	}
}

describe('upstream lifecycle parity', () => {
	// Per packages/core/src/SpringValue.test.ts:63
	it('freezes duration progress while paused and resumes the same start', async () => {
		raf.frameLoop = 'demand';
		const spring = new SpringValue(0);
		const result = spring.start({ to: 1, config: { duration: 100 } });
		advance(3);
		const pausedAt = spring.get();
		spring.pause();
		advance(10);
		expect(spring.get()).toBe(pausedAt);
		spring.resume();
		advance(20);
		expect(await result).toMatchObject({ value: 1, finished: true, cancelled: false });
	});

	// Per packages/core/src/SpringValue.test.ts:84
	it('cancels a delayed update without firing lifecycle callbacks', async () => {
		vi.useFakeTimers();
		const onStart = vi.fn();
		const onRest = vi.fn();
		const spring = new SpringValue(0);
		const result = spring.start({ to: 1, delay: 100, onStart, onRest });
		spring.stop(true);
		await vi.advanceTimersByTimeAsync(100);
		expect(await result).toMatchObject({ finished: false, cancelled: true });
		expect(onStart).not.toHaveBeenCalled();
		expect(onRest).not.toHaveBeenCalled();
	});

	// Per packages/core/src/Controller.test.ts:43
	it('runs an async controller script in sequence', async () => {
		const controller = new Controller({ from: { x: 0 } });
		const result = await controller.start({
			immediate: true,
			to: async (next) => {
				await next({ x: 1 });
				await next({ x: 2 });
			},
		});
		expect(result).toMatchObject({ value: { x: 2 }, finished: true, cancelled: false });
	});

	// Per packages/core/src/SpringValue.test.ts:109
	it('loops while the loop function returns an update', async () => {
		const spring = new SpringValue(0);
		let loops = 0;
		const result = await spring.start({
			from: 0,
			to: 1,
			immediate: true,
			loop: () => (++loops < 2 ? { reset: true } : false),
		});
		expect(result.finished).toBe(true);
		expect(loops).toBe(2);
	});

	// Per packages/core/src/SpringValue.test.ts:154
	it('fires immediate lifecycle callbacks in resolution order', async () => {
		const calls: string[] = [];
		const spring = new SpringValue(0);
		const result = await spring.start({
			to: 1,
			immediate: true,
			onStart: () => calls.push('start'),
			onChange: () => calls.push('change'),
			onRest: () => calls.push('rest'),
			onResolve: () => calls.push('resolve'),
		});
		expect(result).toMatchObject({ value: 1, finished: true, cancelled: false });
		expect(calls).toEqual(['start', 'change', 'rest', 'resolve']);
	});

	// Per packages/core/src/hooks/useSpringValue.test.ts:64
	it('applies constructor default config and onChange to later start calls', async () => {
		raf.frameLoop = 'demand';
		const onChange = vi.fn();
		const spring = new SpringValue(0, {
			onChange,
			config: { tension: 250 },
		});
		expect(spring.get()).toBe(0);
		const result = spring.start(1);
		advance(40);
		expect(await result).toMatchObject({ value: 1, finished: true, cancelled: false });
		expect(onChange.mock.calls.length).toBeGreaterThan(0);
		expect(spring.defaultProps.config).toMatchObject({ tension: 250 });
	});

	it('does not sticky-capture immediate/cancel/pause from default: true', () => {
		const spring = new SpringValue(0, {
			immediate: true,
			config: { tension: 200 },
		});
		expect(spring.defaultProps.immediate).toBeUndefined();
		expect(spring.defaultProps.cancel).toBeUndefined();
		expect(spring.defaultProps.pause).toBeUndefined();
		expect(spring.defaultProps.config).toMatchObject({ tension: 200 });

		const sticky = new SpringValue(0, {
			default: { immediate: true, cancel: true },
		});
		// Object-form default may include one-shot flags intentionally.
		expect(sticky.defaultProps.immediate).toBe(true);
		expect(sticky.defaultProps.cancel).toBe(true);
	});
});

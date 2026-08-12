import { raf } from '@react-spring/rafz';
import { afterEach, describe, expect, it } from 'vitest';
import { Controller, SpringValue } from '../../src/core/index';

// Additional upstream provenance for shared adapted evidence:
// Per packages/core/src/helpers.test.ts:5
// Per packages/shared/src/stringInterpolation.test.ts:10

afterEach(() => (raf.frameLoop = 'always'));

function advance(frames = 120): void {
	const now = raf.now;
	let time = now();
	raf.now = () => (time += 16.667);
	try {
		for (let index = 0; index < frames; index++) raf.advance();
	} finally {
		raf.now = now;
	}
}

describe('advanced upstream engine parity', () => {
	it.each([
		['10px', '30px'],
		['#ff0000', '#0000ff'],
		[
			[0, 10],
			[10, 30],
		],
	] as const)('animates shaped value %j', async (from, to) => {
		raf.frameLoop = 'demand';
		const spring = new SpringValue<any>(from);
		const result = spring.start({ to, config: { duration: 100 } });
		advance(2);
		expect(spring.get()).not.toEqual(from);
		expect(spring.get()).not.toEqual(to);
		advance(10);
		expect((await result).value).toEqual(to);
	});

	// Per packages/core/src/AnimationConfig.test.ts:73
	it('supports frequency physics, frame rounding, and decay', async () => {
		raf.frameLoop = 'demand';
		const rounded = new SpringValue(0);
		const roundedResult = rounded.start({
			to: 10,
			config: { frequency: 0.2, damping: 1, round: 2 },
		});
		advance(240);
		expect((await roundedResult).value).toBe(10);

		const decay = new SpringValue(0);
		const decayResult = decay.start({ to: 999, config: { decay: 0.9, velocity: 2 } });
		advance(240);
		expect((await decayResult).value).toBeGreaterThan(0);
		expect(decay.get()).not.toBe(999);
	});

	// Per packages/core/src/SpringValue.test.ts:185
	it('tracks a dynamic SpringValue target while animating', async () => {
		raf.frameLoop = 'demand';
		const target = new SpringValue(10);
		const spring = new SpringValue(0);
		const result = spring.start({ to: target, config: { duration: 100 } });
		advance(2);
		target.set(20);
		advance(10);
		expect((await result).value).toBe(20);
	});

	// Per packages/core/src/Controller.test.ts:63
	it('inherits explicit controller defaults across replacement updates', async () => {
		const controller = new Controller<{ x: number }>({
			from: { x: 0 },
			default: { immediate: true },
		});
		expect((await controller.start({ to: { x: 1 } })).value).toEqual({ x: 1 });
		expect((await controller.start({ to: { x: 2 } })).value).toEqual({ x: 2 });
	});

	// Per packages/core/src/SpringValue.test.ts:194
	it('applies bounce at overshoot instead of escaping the goal', async () => {
		raf.frameLoop = 'demand';
		const spring = new SpringValue(0);
		const seen: number[] = [];
		spring.onChange((value) => seen.push(value));
		const result = spring.start({
			to: 10,
			config: { tension: 300, friction: 0, bounce: 1, precision: 0.1 },
		});
		advance(240);
		expect((await result).value).toBe(10);
		expect(Math.max(...seen)).toBeLessThanOrEqual(10);
	});
});

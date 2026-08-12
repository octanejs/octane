import { describe, expect, it } from 'vitest';
import { AnimatedArray, AnimatedValue } from '../../src/animated/index';

describe('upstream animated graph parity', () => {
	// Per packages/core/src/Interpolation.test.ts:35
	it('retains leaf identity when array values change', () => {
		const value = new AnimatedArray([1, 2]);
		const payload = value.getPayload();
		expect(value.setValue([1, 3])).toBe(true);
		expect(value.getPayload()[0]).toBe(payload[0]);
		expect(value.getValue()).toEqual([1, 3]);
	});

	// Per packages/core/src/Interpolation.test.ts:49
	it('reports whether an animated leaf actually changed', () => {
		const value = new AnimatedValue('ready');
		expect(value.setValue('ready')).toBe(false);
		expect(value.setValue('done')).toBe(true);
	});
});

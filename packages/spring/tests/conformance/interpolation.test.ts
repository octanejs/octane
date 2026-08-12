import { describe, expect, it } from 'vitest';
import { createInterpolator as createPublicInterpolator } from '../../src/index';
import { createInterpolator, createStringInterpolator } from '../../src/shared/index';

// Additional upstream provenance for shared adapted evidence:
// Per packages/core/src/Interpolation.test.ts:6
// Per packages/core/src/helpers.test.ts:5
// Per packages/core/src/interpolate.test.ts:17

describe('upstream interpolation parity', () => {
	// Per packages/shared/src/createInterpolator.test.ts:55
	it('selects ranges and applies per-side extrapolation', () => {
		const interpolate = createInterpolator({
			range: [0, 0.5, 1],
			output: [0, 10, 30],
			extrapolateLeft: 'identity',
			extrapolateRight: 'clamp',
		});

		expect(interpolate(-1)).toBe(-1);
		expect(interpolate(0.25)).toBe(5);
		expect(interpolate(0.75)).toBe(20);
		expect(interpolate(2)).toBe(30);
	});

	// Per packages/shared/src/createInterpolator.test.ts:77
	it('public createInterpolator blends string outputs instead of snapping', () => {
		const interpolate = createPublicInterpolator({
			range: [0, 1],
			output: ['0px', '10px'],
		});
		expect(interpolate(0.5)).toBe('5px');
	});

	// Per packages/shared/src/createInterpolator.test.ts:77
	it('interpolates compound strings and preserves exact keyframes', () => {
		const interpolate = createStringInterpolator({
			output: ['translate(0.00px, 20px)', 'translate(10.00px, 40px)'],
		});

		expect(interpolate(0)).toBe('translate(0.00px, 20px)');
		expect(interpolate(0.5)).toBe('translate(5.00px, 30px)');
		expect(interpolate(1)).toBe('translate(10.00px, 40px)');
	});

	// Per packages/shared/src/stringInterpolation.test.ts:10
	it('rejects output strings with mismatched numeric arity', () => {
		expect(() =>
			createStringInterpolator({ output: ['translate(0px, 10px)', 'translate(20px)'] }),
		).toThrow('The arity of each "output" value must be equal');
	});
});

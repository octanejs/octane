// Per packages/shared/src/stringInterpolation.test.ts:1
import { expect, it } from 'vitest';
import { createStringInterpolator } from '../../src/shared/stringInterpolation.ts';

// https://github.com/pmndrs/react-spring/issues/2327
it('interpolates a number-less output value instead of throwing on a null match', function interpolatesNumberLessOutput() {
	const interpolate = createStringInterpolator({
		range: [0, 1],
		output: ['none', '0px 4px 8px rgba(0, 0, 0, 0.5)'],
	});

	expect(interpolate(0)).toBe('none');
	expect(interpolate(0.5)).toBe('none');
});

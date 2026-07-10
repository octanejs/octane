// Ported from react-hook-form@7.81.0 src/__tests__/utils/compact.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import filterOutFalsy from '../../../src/utils/compact';

describe('filterOutFalsy', () => {
	it('should return filtered array when array value is falsy ', () => {
		expect(filterOutFalsy([1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
		expect(filterOutFalsy([1, 2, false, 4])).toEqual([1, 2, 4]);
		expect(filterOutFalsy([1, 2, '', 4])).toEqual([1, 2, 4]);
		expect(filterOutFalsy([1, 2, undefined, 4])).toEqual([1, 2, 4]);
		expect(filterOutFalsy([0, 1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
	});
});

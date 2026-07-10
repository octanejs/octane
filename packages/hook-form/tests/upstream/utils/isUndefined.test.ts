// Ported from react-hook-form@7.81.0 src/__tests__/utils/isUndefined.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import isUndefined from '../../../src/utils/isUndefined';

describe('isUndefined', () => {
	it('should return true when it is an undefined value', () => {
		expect(isUndefined(undefined)).toBeTruthy();
	});

	it('should return false when it is not an undefined value', () => {
		expect(isUndefined(null)).toBeFalsy();
		expect(isUndefined('')).toBeFalsy();
		expect(isUndefined('undefined')).toBeFalsy();
		expect(isUndefined(0)).toBeFalsy();
		expect(isUndefined([])).toBeFalsy();
		expect(isUndefined({})).toBeFalsy();
	});
});

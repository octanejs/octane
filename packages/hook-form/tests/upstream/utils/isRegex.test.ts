// Ported from react-hook-form@7.81.0 src/__tests__/utils/isRegex.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import isRegex from '../../../src/utils/isRegex';

describe('isRegex', () => {
	it('should return true when it is a regex', () => {
		expect(isRegex(new RegExp('[a-z]'))).toBeTruthy();
	});
});

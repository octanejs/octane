// Ported from react-hook-form@7.81.0 src/__tests__/utils/isKey.test.ts (jest → vitest, octane runtime).
import { describe, expect, it, test } from 'vitest';
import isKey from '../../../src/utils/isKey';

describe('isKey', () => {
	it('should return true when it is not a deep key', () => {
		expect(isKey('test')).toBeTruthy();
		expect(isKey('fooBar')).toBeTruthy();
	});

	it('should return false when it is a deep key', () => {
		expect(isKey('test.foo')).toBeFalsy();
		expect(isKey('test.foo[0]')).toBeFalsy();
		expect(isKey('test[1]')).toBeFalsy();
		expect(isKey('test.foo[0].bar')).toBeFalsy();
	});
});

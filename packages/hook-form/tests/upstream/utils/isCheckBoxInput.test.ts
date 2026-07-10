// Ported from react-hook-form@7.81.0 src/__tests__/utils/isCheckBoxInput.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import isCheckBoxInput from '../../../src/utils/isCheckBoxInput';

describe('isCheckBoxInput', () => {
	it('should return true when type is checkbox', () => {
		expect(isCheckBoxInput({ name: 'test', type: 'checkbox' })).toBeTruthy();
	});
});

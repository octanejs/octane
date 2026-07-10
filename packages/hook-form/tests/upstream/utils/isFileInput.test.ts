// Ported from react-hook-form@7.81.0 src/__tests__/utils/isFileInput.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import isFileInput from '../../../src/utils/isFileInput';

describe('isFileInput', () => {
	it('should return true when type is file', () => {
		expect(isFileInput({ name: 'test', type: 'file' })).toBeTruthy();
	});
});

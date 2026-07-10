// Ported from react-hook-form@7.81.0 src/__tests__/utils/isRadioInput.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import isRadioInput from '../../../src/utils/isRadioInput';

describe('isRadioInput', () => {
	it('should return true when type is radio', () => {
		expect(isRadioInput({ name: 'test', type: 'radio' })).toBeTruthy();
	});
});

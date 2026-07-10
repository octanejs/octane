// Ported from react-hook-form@7.81.0 src/__tests__/utils/isMultipleSelect.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import isMultipleSelect from '../../../src/utils/isMultipleSelect';

describe('isMultipleSelect', () => {
	it('should return true when type is select-multiple', () => {
		expect(isMultipleSelect({ name: 'test', type: 'select-multiple' })).toBeTruthy();
	});
});

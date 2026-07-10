// Ported from react-hook-form@7.81.0 src/__tests__/utils/validationModeChecker.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import { VALIDATION_MODE } from '../../../src/constants';
import validationModeChecker from '../../../src/logic/getValidationModes';

describe('validationModeChecker', () => {
	it('should return correct mode', () => {
		expect(validationModeChecker(VALIDATION_MODE.onBlur)).toEqual({
			isOnSubmit: false,
			isOnBlur: true,
			isOnChange: false,
			isOnAll: false,
			isOnTouch: false,
		});

		expect(validationModeChecker(VALIDATION_MODE.onChange)).toEqual({
			isOnSubmit: false,
			isOnBlur: false,
			isOnChange: true,
			isOnAll: false,
			isOnTouch: false,
		});

		expect(validationModeChecker(VALIDATION_MODE.onSubmit)).toEqual({
			isOnSubmit: true,
			isOnBlur: false,
			isOnChange: false,
			isOnAll: false,
			isOnTouch: false,
		});

		expect(validationModeChecker(undefined)).toEqual({
			isOnSubmit: true,
			isOnBlur: false,
			isOnChange: false,
			isOnAll: false,
			isOnTouch: false,
		});

		expect(validationModeChecker(VALIDATION_MODE.all)).toEqual({
			isOnSubmit: false,
			isOnBlur: false,
			isOnChange: false,
			isOnAll: true,
			isOnTouch: false,
		});

		expect(validationModeChecker(VALIDATION_MODE.onTouched)).toEqual({
			isOnSubmit: false,
			isOnBlur: false,
			isOnChange: false,
			isOnAll: false,
			isOnTouch: true,
		});
	});
});

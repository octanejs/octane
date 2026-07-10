// Ported from react-hook-form@7.81.0 src/__tests__/logic/getValidateError.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import getValidateError from '../../../src/logic/getValidateError';
import noop from '../../../src/utils/noop';

describe('getValidateError', () => {
	it('should return field error in correct format', () => {
		expect(
			getValidateError(
				'This is a required field',
				{
					name: 'test1',
					value: '',
				},
				'required',
			),
		).toEqual({
			type: 'required',
			message: 'This is a required field',
			ref: {
				name: 'test1',
				value: '',
			},
		});

		expect(
			getValidateError(
				false,
				{
					name: 'test1',
					value: '',
				},
				'required',
			),
		).toEqual({
			type: 'required',
			message: '',
			ref: {
				name: 'test1',
				value: '',
			},
		});
	});

	it('should return undefined when called with non string result', () => {
		expect(getValidateError(undefined, noop)).toBeUndefined();
	});
});

// Ported from react-hook-form@7.81.0 src/__tests__/utils/extractFormValues.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import extractFormValues from '../../../src/utils/extractFormValues';

describe('extractFormValues', () => {
	it('should return extracted form values based on form state', () => {
		const formData = {
			test: {
				test: 'test',
				test1: 'test1',
				test2: 'test2',
				test3: 'test3',
				test4: {
					test: 'test',
					test1: 'test1',
					test2: 'test2',
					test3: 'test3',
				},
			},
		};

		const touchedFields = {
			test: {
				test: true,
				test4: {
					test3: true,
				},
			},
		};

		expect(extractFormValues(touchedFields, formData)).toEqual({
			test: {
				test: 'test',
				test4: {
					test3: 'test3',
				},
			},
		});
	});
});

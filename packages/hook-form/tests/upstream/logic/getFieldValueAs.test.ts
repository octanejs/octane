// Ported from react-hook-form@7.81.0 src/__tests__/logic/getFieldValueAs.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import getFieldValueAs from '../../../src/logic/getFieldValueAs';

describe('getFieldValueAs', () => {
	it('should return undefined when value is undefined', () => {
		expect(
			getFieldValueAs(undefined, {
				ref: {
					name: 'test',
				},
				name: 'test',
				valueAsNumber: true,
				valueAsDate: false,
			}),
		).toBeUndefined();
	});
});

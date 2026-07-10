// Ported from react-hook-form@7.81.0 src/__tests__/utils/objectHasFunction.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import noop from '../../../src/utils/noop';
import objectHasFunction from '../../../src/utils/objectHasFunction';

describe('objectHasFunction', () => {
	it('should detect if any object has function', () => {
		expect(objectHasFunction({})).toBeFalsy();
		expect(
			objectHasFunction({
				test: '',
			}),
		).toBeFalsy();

		expect(
			objectHasFunction({
				test: noop,
			}),
		).toBeTruthy();
	});
});

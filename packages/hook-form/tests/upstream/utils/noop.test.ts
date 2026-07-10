// Ported from react-hook-form@7.81.0 src/__tests__/utils/noop.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import noop from '../../../src/utils/noop';

describe('noop', () => {
	it('should be a function', () => {
		expect(noop instanceof Function).toBeTruthy();
	});

	it('should return undefined', () => {
		const result = noop();

		expect(result).toBeUndefined();
	});
});

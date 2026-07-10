// Ported from react-hook-form@7.81.0 src/__tests__/utils/stringToPath.test.ts (jest → vitest, octane runtime).
import { describe, expect, it, test } from 'vitest';
import stringToPath from '../../../src/utils/stringToPath';

describe('stringToPath', () => {
	it('should convert string to path', () => {
		expect(stringToPath('test')).toEqual(['test']);

		expect(stringToPath('[test]]')).toEqual(['test']);

		expect(stringToPath('test.test[2].data')).toEqual(['test', 'test', '2', 'data']);

		expect(stringToPath('test.test["2"].data')).toEqual(['test', 'test', '2', 'data']);

		expect(stringToPath("test.test['test'].data")).toEqual(['test', 'test', 'test', 'data']);

		expect(stringToPath('test.test.2.data')).toEqual(['test', 'test', '2', 'data']);
	});
});

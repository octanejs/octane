// Ported from react-hook-form@7.81.0 src/__tests__/logic/unsetEmptyArray.test.ts (jest → vitest, octane runtime).
import { beforeAll, describe, expect, it, vi, type MockedFunction } from 'vitest';
import unsetEmptyArray from '../../../src/logic/unsetEmptyArray';
import unset from '../../../src/utils/unset';

vi.mock('../../../src/utils/unset', () => ({
	__esModule: true,
	default: vi.fn(),
}));

describe('unsetEmptyArray', () => {
	const mockedUnset = unset as MockedFunction<typeof unset>;

	beforeAll(() => {
		mockedUnset.mockClear();
	});

	it('should call unset when the array is empty', () => {
		const ref = { foo: [] as unknown[] };

		unsetEmptyArray(ref, 'foo');

		expect(mockedUnset).toHaveBeenCalledWith(ref, 'foo');
	});

	it('should not call unset when the array is not empty', () => {
		const ref = { foo: ['data'] };

		unsetEmptyArray(ref, 'foo');

		expect(mockedUnset).not.toHaveBeenCalled();
	});
});

// Ported from react-hook-form@7.81.0 src/__tests__/logic/createFormControl.test.ts (jest → vitest, octane runtime).
import { describe, expect, it, vi } from 'vitest';
import { createFormControl } from '../../../src/logic/createFormControl';
import isEmptyObject from '../../../src/utils/isEmptyObject';

vi.mock('../../../src/utils/isEmptyObject', async () => {
	const original = await vi.importActual<{ default: (value: unknown) => boolean }>(
		'../../../src/utils/isEmptyObject',
	);
	return {
		__esModule: true,
		default: vi.fn(original.default),
	};
});

describe('createFormControl', () => {
	it('should call `executeBuiltInValidation` once for a single field', async () => {
		const { register, control } = createFormControl({
			defaultValues: {
				foo: 'foo',
			},
		});

		register('foo', {});

		await control._setValid(true);

		expect(isEmptyObject).toHaveBeenCalledTimes(1);
	});

	it('should call `executeBuiltInValidation` twice for a field as an object with a single sub-field', async () => {
		const { register, control } = createFormControl({
			defaultValues: {
				foo: {
					bar: 'bar',
				},
			},
		});

		register('foo.bar', {});

		await control._setValid(true);

		expect(isEmptyObject).toHaveBeenCalledTimes(2);
	});

	it('should call executeBuiltInValidation the correct number of times in case the field is an array', async () => {
		const { register, control } = createFormControl({
			defaultValues: {
				foo: [
					{
						bar: 'bar',
						baz: 'baz',
					},
					{
						bar: 'bar',
						baz: 'baz',
					},
				],
			},
		});

		register('foo.1.bar', {});

		await control._setValid(true);

		expect(isEmptyObject).toHaveBeenCalledTimes(3);
	});
});

// Ported from react-hook-form@7.81.0 src/__tests__/logic/getEventValue.test.ts (jest → vitest, octane runtime).
import { expect, test } from 'vitest';
import getEventValue from '../../../src/logic/getEventValue';

test('getEventValue should return correct value', () => {
	expect(
		getEventValue({
			target: { checked: true, type: 'checkbox' },
		}),
	).toEqual(true);
	expect(
		getEventValue({
			target: { checked: true, type: 'checkbox', value: 'test' },
		}),
	).toEqual(true);
	expect(getEventValue({ target: { value: 'test' }, type: 'test' })).toEqual('test');
	expect(getEventValue({ data: 'test' })).toEqual({ data: 'test' });
	expect(getEventValue('test')).toEqual('test');
	expect(getEventValue(undefined)).toEqual(undefined);
	expect(getEventValue(null)).toEqual(null);
});

// Ported from react-hook-form@7.81.0 src/__tests__/logic/getValueAndMessage.test.ts (jest → vitest, octane runtime).
import { describe, expect, it } from 'vitest';
import getValueAndMessage from '../../../src/logic/getValueAndMessage';

describe('getValueAndMessage', () => {
	it('should return message and value correctly', () => {
		expect(getValueAndMessage(0).value).toEqual(0);
		expect(getValueAndMessage(3).value).toEqual(3);
		expect(getValueAndMessage({ value: 0, message: 'what' }).value).toEqual(0);
		expect(getValueAndMessage({ value: 2, message: 'what' }).value).toEqual(2);
		expect(getValueAndMessage({ value: 1, message: 'test' }).message).toEqual('test');
	});
});

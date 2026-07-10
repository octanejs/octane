// Ported from react-hook-form@7.81.0 src/__tests__/logic/getFocusFieldName.test.ts (jest → vitest, octane runtime).
import { describe, expect, it, test } from 'vitest';
import getFocusFieldName from '../../../src/logic/getFocusFieldName';

describe('getFocusFieldName', () => {
	it('should return expected focus name', () => {
		expect(getFocusFieldName('test', 0, { shouldFocus: false })).toEqual('');
		expect(getFocusFieldName('test', 0, { shouldFocus: true, focusName: 'test' })).toEqual('test');
		expect(getFocusFieldName('test', 0, { shouldFocus: true, focusIndex: 1 })).toEqual('test.1.');
		expect(getFocusFieldName('test', 0)).toEqual('test.0.');
	});
});

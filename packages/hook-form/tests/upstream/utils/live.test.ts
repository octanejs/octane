// Ported from react-hook-form@7.81.0 src/__tests__/utils/live.test.ts (jest → vitest, octane runtime).
import { afterEach, describe, expect, it, vi, type MockedFunction } from 'vitest';
import type { Ref } from '../../../src/types';
import isHTMLElement from '../../../src/utils/isHTMLElement';
import live from '../../../src/utils/live';

vi.mock('../../../src/utils/isHTMLElement');

const mockIsHTMLElement = isHTMLElement as MockedFunction<typeof isHTMLElement>;

describe('live', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should return true when ref is HTMLElement and connected', () => {
		mockIsHTMLElement.mockReturnValue(true);
		const ref: Ref = { isConnected: true, name: 'mock' };
		expect(live(ref)).toBe(true);
	});

	it('should return false when ref is not connected', () => {
		mockIsHTMLElement.mockReturnValue(true);
		const ref: Ref = { isConnected: false, name: 'mock' };
		expect(live(ref)).toBe(false);
	});

	it('should return false when ref is not an HTMLElement', () => {
		mockIsHTMLElement.mockReturnValue(false);
		const ref: Ref = { isConnected: false, name: 'mock' };
		expect(live(ref)).toBe(false);
	});
});

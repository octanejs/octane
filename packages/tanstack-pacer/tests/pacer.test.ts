import { describe, expect, it } from 'vitest';
import {
	Batcher as CoreBatcher,
	Debouncer as CoreDebouncer,
	Throttler as CoreThrottler,
} from '@tanstack/pacer';
import { Batcher, Debouncer, Throttler } from '@octanejs/tanstack-pacer';

describe('@octanejs/tanstack-pacer', () => {
	it('re-exports the real framework-independent TanStack Pacer core', function () {
		expect(Batcher).toBe(CoreBatcher);
		expect(Debouncer).toBe(CoreDebouncer);
		expect(Throttler).toBe(CoreThrottler);
	});
});

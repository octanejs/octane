/**
 * Ordinary module-identity check: store-core re-exports must be the same
 * module instance the differential oracle uses. The experimental `_useStore`
 * omission lives in experimental-use-store.parity.test.ts.
 */
import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/tanstack-store';

describe('export surface', () => {
	it('re-exports the same @tanstack/store module instance', async () => {
		const core = await import('@tanstack/store');
		expect(binding.createAsyncAtom).toBe(core.createAsyncAtom);
		expect(binding.createAtom).toBe(core.createAtom);
		expect(binding.createStore).toBe(core.createStore);
	});
});

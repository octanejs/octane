/**
 * @octanejs/tanstack-store parity — the port must provide every supported
 * runtime export of real @tanstack/react-store, and its store-core re-export
 * must be the SAME module instance the differential oracle uses.
 */
import { describe, expect, it } from 'vitest';
import * as binding from '@octanejs/tanstack-store';

describe('export surface', () => {
	it('matches the supported @tanstack/react-store runtime exports', async () => {
		const real = await import('@tanstack/react-store');
		const expected = Object.keys(real)
			.filter((name) => name !== '_useStore')
			.sort();
		expect(Object.keys(binding).sort()).toEqual(expected);
	});

	it('re-exports the same @tanstack/store module instance', async () => {
		const core = await import('@tanstack/store');
		expect(binding.createAsyncAtom).toBe(core.createAsyncAtom);
		expect(binding.createAtom).toBe(core.createAtom);
		expect(binding.createStore).toBe(core.createStore);
	});
});

/**
 * @octanejs/tanstack-virtual parity — the port must provide every runtime
 * export of real @tanstack/react-virtual, and its virtual-core re-export must
 * be the SAME module instance the differential oracle uses.
 */
import { describe, it, expect } from 'vitest';
import * as binding from '@octanejs/tanstack-virtual';

describe('export surface', () => {
	it('provides every runtime export of real @tanstack/react-virtual', async () => {
		const real = await import('@tanstack/react-virtual');
		const upstream = Object.keys(real).sort();
		const port = new Set(Object.keys(binding));
		const missing = upstream.filter((name) => !port.has(name));
		expect(missing).toEqual([]);
	});

	it('re-exports the same @tanstack/virtual-core module instance', async () => {
		const core = await import('@tanstack/virtual-core');
		expect(binding.Virtualizer).toBe(core.Virtualizer);
		expect(binding.elementScroll).toBe(core.elementScroll);
		expect(binding.observeElementRect).toBe(core.observeElementRect);
		expect(binding.defaultRangeExtractor).toBe(core.defaultRangeExtractor);
	});
});

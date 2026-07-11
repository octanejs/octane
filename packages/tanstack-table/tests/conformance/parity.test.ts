/**
 * @octanejs/tanstack-table parity — the port must provide every runtime export
 * of real @tanstack/react-table, and its table-core re-export must be the SAME
 * module instance the differential oracle uses (shared sorting/filter fns).
 */
import { describe, it, expect } from 'vitest';
import * as binding from '@octanejs/tanstack-table';

describe('export surface', () => {
	it('provides every runtime export of real @tanstack/react-table', async () => {
		const real = await import('@tanstack/react-table');
		const upstream = Object.keys(real).sort();
		const port = new Set(Object.keys(binding));
		const missing = upstream.filter((name) => !port.has(name));
		expect(missing).toEqual([]);
	});

	it('re-exports the same @tanstack/table-core module instance', async () => {
		const core = await import('@tanstack/table-core');
		expect(binding.createColumnHelper).toBe(core.createColumnHelper);
		expect(binding.createTable).toBe(core.createTable);
		expect(binding.getCoreRowModel).toBe(core.getCoreRowModel);
		expect(binding.getSortedRowModel).toBe(core.getSortedRowModel);
	});
});

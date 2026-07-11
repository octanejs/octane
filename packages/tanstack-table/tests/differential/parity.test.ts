/**
 * Differential parity: the SAME `.tsrx` fixture runs through
 * @octanejs/tanstack-table (octane) AND real @tanstack/react-table (React) —
 * the setup rewrites `@octanejs/tanstack-table` → `@tanstack/react-table` and
 * `octane` → `react` for the React side, and both adapters drive the SAME
 * @tanstack/table-core instance. octane's `mountDifferential` mounts both,
 * drives identical events, and asserts byte-identical innerHTML after each
 * step. This is the gold-standard proof that the ~100-line adapter port
 * behaves like react-table — not just "passes my tests".
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const BASIC = resolve(__dirname, '../_fixtures/basic-table-diff.tsrx');
const SORTING = resolve(__dirname, '../_fixtures/sorting-diff.tsrx');
const FILTER_PAGINATE = resolve(__dirname, '../_fixtures/filter-paginate-diff.tsrx');
const SELECTION = resolve(__dirname, '../_fixtures/selection-diff.tsrx');
const VIS_EXPAND = resolve(__dirname, '../_fixtures/visibility-expand-diff.tsrx');
// React fixtures are precompiled into THIS package's cache (see differential
// _setup.ts) so the React side resolves @tanstack/react-table from here.
const CACHE = resolve(__dirname, '.react-cache');

// Both runtimes queue follow-up state updates (e.g. pageIndex auto-reset)
// in microtasks; give them a beat before the byte-compare.
const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('differential: @octanejs/tanstack-table vs real @tanstack/react-table', () => {
	it('BasicTable: flexRender shapes + data swap, byte-identical', async () => {
		const d = await mountDifferential(BASIC, 'BasicTable', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('swap data', async (i, r) => {
			await i.click('#swap-data');
			await r.click('#swap-data');
		});
		await d.step('swap back', async (i, r) => {
			await i.click('#swap-data');
			await r.click('#swap-data');
		});
		d.unmount();
	});

	it('SortingTable: asc → desc → cleared → replace, byte-identical', async () => {
		const d = await mountDifferential(SORTING, 'SortingTable', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('age asc', async (i, r) => {
			await i.click('#th-age');
			await r.click('#th-age');
			await settle();
		});
		await d.step('age desc', async (i, r) => {
			await i.click('#th-age');
			await r.click('#th-age');
			await settle();
		});
		await d.step('age cleared (sortRemoval)', async (i, r) => {
			await i.click('#th-age');
			await r.click('#th-age');
			await settle();
		});
		await d.step('name replaces (single-sort)', async (i, r) => {
			await i.click('#th-firstName');
			await r.click('#th-firstName');
			await settle();
		});
		d.unmount();
	});

	it('FilterPaginate: filter input + pagination buttons, byte-identical', async () => {
		const d = await mountDifferential(FILTER_PAGINATE, 'FilterPaginate', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('filter "a"', async (i, r) => {
			await i.input('#flt', 'a');
			await r.input('#flt', 'a');
			await settle();
		});
		await d.step('clear filter', async (i, r) => {
			await i.input('#flt', '');
			await r.input('#flt', '');
			await settle();
		});
		await d.step('next', async (i, r) => {
			await i.click('#next');
			await r.click('#next');
		});
		await d.step('next again (last page)', async (i, r) => {
			await i.click('#next');
			await r.click('#next');
		});
		await d.step('prev', async (i, r) => {
			await i.click('#prev');
			await r.click('#prev');
		});
		await d.step('pageSize 5 (pageIndex reset parity)', async (i, r) => {
			await i.click('#ps-5');
			await r.click('#ps-5');
			await settle();
		});
		await d.step('next at pageSize 5', async (i, r) => {
			await i.click('#next');
			await r.click('#next');
		});
		d.unmount();
	});

	it('SelectionTable: predicate select-all + row toggles, byte-identical', async () => {
		const d = await mountDifferential(SELECTION, 'SelectionTable', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('select row 1', async (i, r) => {
			await i.click('#sel-1');
			await r.click('#sel-1');
		});
		await d.step('select all (predicate-limited)', async (i, r) => {
			await i.click('#sel-all');
			await r.click('#sel-all');
		});
		await d.step('clear all', async (i, r) => {
			await i.click('#sel-all');
			await r.click('#sel-all');
		});
		await d.step('select row 0', async (i, r) => {
			await i.click('#sel-0');
			await r.click('#sel-0');
		});
		await d.step('deselect row 0', async (i, r) => {
			await i.click('#sel-0');
			await r.click('#sel-0');
		});
		d.unmount();
	});

	it('VisExpand: visibility toggles + nested expanding, byte-identical', async () => {
		const d = await mountDifferential(VIS_EXPAND, 'VisExpand', undefined, CACHE);
		await d.step('mount', () => {});
		await d.step('hide size column', async (i, r) => {
			await i.click('#vis-size');
			await r.click('#vis-size');
		});
		await d.step('show size column', async (i, r) => {
			await i.click('#vis-size');
			await r.click('#vis-size');
		});
		await d.step('expand root-a', async (i, r) => {
			await i.click('[data-for="0"]');
			await r.click('[data-for="0"]');
		});
		await d.step('expand nested a-2', async (i, r) => {
			await i.click('[data-for="0.1"]');
			await r.click('[data-for="0.1"]');
		});
		await d.step('collapse root-a (child expansion retained)', async (i, r) => {
			await i.click('[data-for="0"]');
			await r.click('[data-for="0"]');
		});
		d.unmount();
	});
});

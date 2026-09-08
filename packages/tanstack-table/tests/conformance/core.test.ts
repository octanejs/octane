/**
 * @octanejs/tanstack-table core conformance — `useTable`'s state wiring through
 * octane's render path, against the REAL @tanstack/table-core.
 * Ports the behaviors of upstream react-table's tests/core/core.test.tsx
 * (markup render, stable api, rowModel) and adds the state-wiring matrix the
 * upstream suite doesn't cover.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import * as OctaneRuntime from 'octane';
import { compile } from 'octane/compiler';
import * as InternalClientRuntime from 'octane/internal/client';
import * as TanStackTable from '../../src/index.js';
import { mount, nextPaint } from '../_helpers';
import {
	BasicTable,
	SwapApp,
	SortingTable,
	ControlledSortingTable,
	SelectorTable,
	renders,
	captured,
	defaultData,
	altData,
} from '../_fixtures/table-basic.tsrx';
import { StrongTableBoundaries } from '../_fixtures/strong-table-boundaries.tsrx';

const STRONG_BOUNDARY_FIXTURE =
	'packages/tanstack-table/tests/_fixtures/strong-table-boundaries.tsrx';
const STRONG_SNAPSHOT_FIXTURE =
	'packages/tanstack-table/tests/_fixtures/strong-table-snapshot.tsrx';

type FixtureModule = Record<string, any>;

// This evaluator is deliberately client-only and accepts only the named-import
// and export shapes used by these two fixtures. Keeping the production compile
// here avoids coupling this package's typecheck to Octane's broader SSR fixture
// harness.
function loadProductionFixture<T extends FixtureModule>(
	path: string,
	runtimeModules: Readonly<Record<string, FixtureModule>> = {},
): T {
	let { code } = compile(readFileSync(path, 'utf8'), path, {
		mode: 'client',
		hmr: false,
		dev: false,
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane['"];?/g,
		(_match: string, names: string) =>
			`const {${names.replace(/\s+as\s+/g, ': ')}} = __octaneRuntime;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/internal\/client['"];?/g,
		(_match: string, names: string) =>
			`const {${names.replace(/\s+as\s+/g, ': ')}} = __internalClientRuntime;`,
	);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/g,
		(match: string, names: string, request: string) =>
			Object.hasOwn(runtimeModules, request)
				? `const {${names.replace(/\s+as\s+/g, ': ')}} = __runtimeModules[${JSON.stringify(request)}];`
				: match,
	);
	code = code.replace(
		/export\s+(const|let|var)\s+(\w+)\s*=/g,
		(_match: string, kind: string, name: string) => `${kind} ${name} = __exports.${name} =`,
	);
	if (/^\s*(?:import|export)\s/m.test(code)) {
		throw new Error(`Production fixture ${path} contains an unsupported module shape.`);
	}
	const evaluate = new Function(
		'__octaneRuntime',
		'__internalClientRuntime',
		'__runtimeModules',
		'__exports',
		`'use strict';\n${code}\n//# sourceURL=${path}?production-fixture\nreturn __exports;`,
	);
	return evaluate(OctaneRuntime, InternalClientRuntime, runtimeModules, {}) as T;
}

function productionStrongTableBoundaries() {
	const snapshot = loadProductionFixture(STRONG_SNAPSHOT_FIXTURE);
	return loadProductionFixture(STRONG_BOUNDARY_FIXTURE, {
		'@octanejs/tanstack-table': TanStackTable,
		'./strong-table-snapshot.tsrx': snapshot,
	}).StrongTableBoundaries;
}

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	renders.basic = 0;
	renders.sorting = 0;
	renders.controlled = 0;
	renders.selected = 0;
	captured.table = undefined;
	captured.tables.length = 0;
	captured.sortingStates.length = 0;
	captured.selectedStates.length = 0;
});

describe('core (ports of upstream core.test.tsx)', () => {
	it('renders a table with markup (thead/tbody/tfoot via flexRender)', async () => {
		// Per react-table tests/core/core.test.tsx "renders a table with markup".
		const r = mount(BasicTable, {});
		await flush();
		const headers = r.findAll('thead th');
		expect(headers.map((h) => h.textContent)).toEqual(['First Name', 'Last Name', 'Age']);
		expect(r.findAll('tbody tr').length).toBe(3);
		const firstRow = r.findAll('tbody tr')[0];
		expect(Array.from(firstRow.querySelectorAll('td')).map((c) => c.textContent)).toEqual([
			'tanner',
			'linsley',
			'29',
		]);
		expect(r.findAll('tfoot th')[0].textContent).toBe('fn-footer');
		r.unmount();
	});

	it('keeps one underlying table instance across re-renders', async () => {
		// Per react-table tests/core/core.test.tsx "has a stable api", adapted to
		// v9: `useTable` returns a FRESH wrapper object each render (it re-binds
		// `state` and `options` to the values read during that render), so the
		// stable thing is the underlying instance — its store and its state atoms,
		// which is what actually must survive for state to persist.
		const r = mount(SwapApp, {});
		await flush();
		expect(captured.tables.length).toBeGreaterThan(0);
		const first = captured.tables[0] as any;

		r.click('#bump'); // unrelated parent state
		await flush();
		expect(captured.tables.length).toBeGreaterThan(1);
		for (const t of captured.tables as Array<any>) {
			expect(t.store).toBe(first.store);
			expect(t.baseAtoms).toBe(first.baseAtoms);
		}
		r.unmount();
	});

	it('can return the rowModel', async () => {
		// Per react-table tests/core/core.test.tsx "can return the rowModel".
		const r = mount(BasicTable, {});
		await flush();
		const table = captured.table as any;
		const model = table.getRowModel();
		expect(model.rows.length).toBe(3);
		expect(model.flatRows.length).toBe(3);
		expect(model.rowsById['0'].original).toBe(defaultData[0]);
		r.unmount();
	});

	it('propagates a data swap through the render-phase setOptions', async () => {
		const r = mount(SwapApp, {});
		await flush();

		r.click('#swap-data');
		await flush();
		expect(r.findAll('tbody tr').length).toBe(2);
		expect(r.findAll('tbody td')[0].textContent).toBe('kevin');
		expect((captured.table as any).getRowModel().rows[0].original).toBe(altData[0]);

		r.click('#swap-data');
		await flush();
		expect(r.findAll('tbody tr').length).toBe(3);
		r.unmount();
	});

	it('propagates a columns swap', async () => {
		const r = mount(SwapApp, {});
		await flush();

		r.click('#swap-cols');
		await flush();
		const headers = r.findAll('thead th');
		expect(headers.map((h) => h.textContent)).toEqual(['Only Age']);
		expect(r.findAll('tbody tr')[0].querySelectorAll('td').length).toBe(1);
		r.unmount();
	});
});

describe('state wiring', () => {
	const firstNames = (r: ReturnType<typeof mount>) =>
		r.findAll('tbody tr').map((tr) => tr.querySelector('td')!.textContent);

	it('uncontrolled sorting toggles asc → desc → cleared', async () => {
		const r = mount(SortingTable, {});
		await flush();
		expect(firstNames(r)).toEqual(['tanner', 'derek', 'joe']); // natural order

		r.click('#s-th-firstName');
		await flush();
		expect(firstNames(r)).toEqual(['derek', 'joe', 'tanner']); // asc
		expect(r.find('#s-th-firstName').textContent).toBe('First Name A');

		r.click('#s-th-firstName');
		await flush();
		expect(firstNames(r)).toEqual(['tanner', 'joe', 'derek']); // desc
		expect(r.find('#s-th-firstName').textContent).toBe('First Name D');

		r.click('#s-th-firstName');
		await flush();
		expect(firstNames(r)).toEqual(['tanner', 'derek', 'joe']); // cleared (sortRemoval)
		expect(r.find('#s-th-firstName').textContent).toBe('First Name');
		r.unmount();
	});

	it('partially-controlled sorting flows through the parent state', async () => {
		const r = mount(ControlledSortingTable, {});
		await flush();

		r.click('#c-th-firstName');
		await flush();
		const last = captured.sortingStates[captured.sortingStates.length - 1];
		expect(last).toEqual([{ id: 'firstName', desc: false }]);
		expect(r.findAll('.c-cell')[0].textContent).toBe('derek'); // DOM reordered too
		r.unmount();
	});

	it('exposes only the selected projection on table.state', async () => {
		// v9's `useTable` takes a selector as its 2nd argument; `table.state` is
		// that projection, not the full TableState. Re-renders are driven by the
		// selected value (shallow-compared), so sorting must move it.
		const r = mount(SelectorTable, {});
		await flush();
		expect(r.find('#sel-state').textContent).toBe('n=0');
		expect(Object.keys(captured.selectedStates[0] as object)).toEqual(['sortCount']);

		r.click('#sel-sort');
		await flush();
		expect(r.find('#sel-state').textContent).toBe('n=1');
		r.unmount();
	});

	it('one state update re-renders exactly once (render-phase setOptions is loop-free)', async () => {
		const r = mount(SortingTable, {});
		await flush();
		const base = renders.sorting;

		r.click('#s-th-firstName');
		await flush();
		expect(renders.sorting).toBe(base + 1);
		r.unmount();
	});
});

describe('Strong snapshot boundaries for the pinned TanStack Table v9 adapter', () => {
	it.each([
		['development', StrongTableBoundaries],
		['production', productionStrongTableBoundaries()],
	])('updates inline map, keyed @for, and extracted consumers in %s', async (_mode, Component) => {
		const r = mount(Component, {});
		await flush();
		const lists = ['strong-table-inline', 'strong-table-for', 'strong-table-extracted'];
		const rows = (list: string) => r.findAll(`#${list} > .strong-table-snapshot`);
		const rowIds = (list: string) => rows(list).map((row) => row.getAttribute('data-row'));
		const selectedRow = (list: string) => {
			const row = rows(list).find((candidate) => candidate.getAttribute('data-row') === '0');
			if (row === undefined) throw new Error(`missing row 0 in ${list}`);
			return row;
		};
		const original = lists.map(selectedRow);

		for (const list of lists) {
			expect(rowIds(list)).toEqual(['0', '1', '2']);
			expect(selectedRow(list).getAttribute('data-selected')).toBe('0');
			expect(selectedRow(list).getAttribute('data-sort')).toBe('none');
		}

		r.click('#strong-table-select');
		await flush();
		for (let index = 0; index < lists.length; index++) {
			const row = selectedRow(lists[index]!);
			expect(row).toBe(original[index]);
			expect(row.getAttribute('data-selected')).toBe('1');
			expect(row.textContent).toContain(':selected:none');
		}

		r.click('#strong-table-sort');
		await flush();
		for (let index = 0; index < lists.length; index++) {
			const list = lists[index]!;
			const row = selectedRow(list);
			expect(rowIds(list)).toEqual(['1', '2', '0']);
			expect(row).toBe(original[index]);
			expect(row.getAttribute('data-selected')).toBe('1');
			expect(row.getAttribute('data-sort')).toBe('desc');
		}
		r.unmount();
	});
});

import { describe, expect, it } from 'vitest';
import { compile } from '../src/compiler/index.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	flushUniversalSync,
	type ObjectHostInstance,
} from '../src/universal.js';
import {
	IndexRows,
	MemoRows,
	MethodRows,
	ModuleLetRows,
	setModuleSuffix,
} from './_fixtures/universal-for-row-memo.object.tsrx';

// Row memo is a production compile optimization, like the DOM target's DEP-PURE
// rows; dev and HMR compiles re-render every row.
const MEMO = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function hosts(container: { children: readonly ObjectHostInstance[] }) {
	return [...container.children[0].children];
}

// A row whose `label` getter counts how often a row body read it.
function countedRow(id: string, label: string, reads: Map<string, number>, on = false) {
	return {
		id,
		on,
		get label() {
			reads.set(id, (reads.get(id) ?? 0) + 1);
			return label;
		},
	};
}

describe('universal @for row memo', () => {
	it('keeps unchanged rows when unrelated parent state changes', () => {
		const reads = new Map<string, number>();
		const rows = ['a', 'b', 'c'].map((id) => countedRow(id, id.toUpperCase(), reads));
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		let api!: { tick(): void; setRows(rows: unknown[]): void };
		const props = { rows, prefix: 'p:', select() {}, expose: (value: typeof api) => (api = value) };
		root.render(MemoRows, props);
		const before = hosts(container);
		expect(Object.fromEntries(reads)).toEqual({ a: 1, b: 1, c: 1 });

		flushUniversalSync(() => api.tick());
		expect(container.children[0].props.ticks).toBe(1);
		if (MEMO) expect(Object.fromEntries(reads)).toEqual({ a: 1, b: 1, c: 1 });
		expect(hosts(container)).toEqual(before);
		expect(hosts(container)[1]).toBe(before[1]);

		// A new item identity re-renders that row only.
		const next = [rows[0], countedRow('b', 'B2', reads, true), rows[2]];
		flushUniversalSync(() => api.setRows(next));
		if (MEMO) expect(Object.fromEntries(reads)).toEqual({ a: 1, b: 2, c: 1 });
		expect(hosts(container)[1]).toBe(before[1]);
		expect(hosts(container)[1].props.class).toBe('row on');
		expect(hosts(container)[1].children.map((child) => child.type)).toEqual([
			'row-label',
			'row-flag',
		]);
		expect(hosts(container)[1].children[0].props.value).toBe('B2');

		// A new props object is a new captured value: every row re-renders.
		root.render(MemoRows, { ...props });
		if (MEMO) expect(Object.fromEntries(reads)).toEqual({ a: 2, b: 3, c: 2 });
		root.unmount();
	});

	it('re-renders rows when a captured value changes so handlers read it', () => {
		const reads = new Map<string, number>();
		const rows = ['a', 'b'].map((id) => countedRow(id, id, reads));
		const selected: string[] = [];
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		const select = (value: string) => selected.push(value);
		const props = { rows, prefix: 'one:', select, expose() {} };
		root.render(MemoRows, props);
		container.dispatchEvent(hosts(container)[0], 'tap', undefined);

		root.render(MemoRows, { ...props, prefix: 'two:' });
		expect(Object.fromEntries(reads)).toEqual({ a: 2, b: 2 });
		container.dispatchEvent(hosts(container)[0], 'tap', undefined);
		container.dispatchEvent(hosts(container)[1], 'tap', undefined);
		expect(selected).toEqual(['one:a', 'two:a', 'two:b']);
		root.unmount();
	});

	it('moves retained rows on a reorder and re-renders rows that read their index', () => {
		const reads = new Map<string, number>();
		const rows = ['a', 'b', 'c'].map((id) => countedRow(id, id, reads));
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		root.render(MemoRows, { rows, prefix: '', select() {}, expose() {} });
		const before = hosts(container);
		let api!: { setRows(rows: unknown[]): void };
		root.render(MemoRows, { rows, prefix: '', select() {}, expose: (value: typeof api) => (api = value) });
		const mounted = hosts(container);
		flushUniversalSync(() => api.setRows([rows[2], rows[0], rows[1]]));
		// Retained rows move; none re-renders.
		if (MEMO) expect(Object.fromEntries(reads)).toEqual({ a: 2, b: 2, c: 2 });
		expect(hosts(container).map((host) => host.props.id)).toEqual(['c', 'a', 'b']);
		expect(hosts(container)[0]).toBe(mounted[2]);
		expect(hosts(container)[1]).toBe(mounted[0]);
		expect(before[0]).toBe(mounted[0]);

		const indexReads = new Map<string, number>();
		const indexed = ['a', 'b', 'c'].map((id) => countedRow(id, id, indexReads));
		const indexContainer = createObjectContainer();
		const indexRoot = createUniversalRoot(indexContainer, createObjectDriver());
		let setIndexed!: (rows: unknown[]) => void;
		indexRoot.render(IndexRows, { rows: indexed, expose: (set: typeof setIndexed) => (setIndexed = set) });
		flushUniversalSync(() => setIndexed([indexed[0], indexed[2], indexed[1]]));
		if (MEMO) expect(Object.fromEntries(indexReads)).toEqual({ a: 1, b: 2, c: 2 });
		expect(hosts(indexContainer).map((host) => [host.props.id, host.props.position])).toEqual([
			['a', 0],
			['c', 1],
			['b', 2],
		]);
		root.unmount();
		indexRoot.unmount();
	});

	it('keeps rows with render-time calls or mutable module reads on the full path', () => {
		const reads = new Map<string, number>();
		const rows = ['a'].map((id) => countedRow(id, id, reads));
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		root.render(MethodRows, { rows, tick: 0 });
		root.render(MethodRows, { rows, tick: 1 });
		expect(reads.get('a')).toBe(2);
		root.unmount();

		const moduleContainer = createObjectContainer();
		const moduleRoot = createUniversalRoot(moduleContainer, createObjectDriver());
		const plain = [{ id: 'a', label: 'A' }];
		moduleRoot.render(ModuleLetRows, { rows: plain, tick: 0 });
		setModuleSuffix('!');
		moduleRoot.render(ModuleLetRows, { rows: plain, tick: 1 });
		expect(hosts(moduleContainer)[0].props.label).toBe('A!');
		setModuleSuffix('');
		moduleRoot.unmount();
	});

	it('emits row inputs only for bodies proven to render from them', () => {
		const renderer = { id: 'object', module: 'octane/universal', target: 'universal' } as const;
		const emit = (body: string, header = '') =>
			compile(
				`${header}export function Rows(props) @{ <row-list>@for (const row of props.rows; key row.id) { ${body} }</row-list> }`,
				'/src/Rows.object.tsrx',
				{ renderer, hmr: false },
			).code;
		const memo = /,\s*\[([^\]]*)\],\s*(true|false)\s*\)/;
		expect(emit('<row-host label={row.label} onTap={() => props.pick(row.id)} />')).toMatch(memo);
		expect(emit('<row-host label={row.label} onTap={() => props.pick(row.id)} />').match(memo)![1]).toBe(
			'props',
		);
		expect(emit('<row-host label={String(row.n)} />')).toMatch(memo);
		for (const body of [
			'<row-host label={row.label.trim()} />',
			'<row-host label={format(row.label)} />',
			'<Row row={row} />',
			'<row-host ref={props.ref} />',
			'<row-host label={location.href} />',
			'<row-host label={row.label + suffix} />',
			'<row-host label={(row.n += 1)} />',
		]) {
			expect(emit(body, 'let suffix = ""; const format = (v) => v;\n')).not.toMatch(memo);
		}
		expect(
			compile(
				`export function Rows(props) @{ <row-list>@for (const row of props.rows; key row.id) { <row-host label={row.label} /> }</row-list> }`,
				'/src/Rows.object.tsrx',
				{ renderer, hmr: true },
			).code,
		).not.toMatch(memo);
	});
});

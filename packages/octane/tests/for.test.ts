import { describe, it, expect } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { flushSync, hydrateRoot } from '../src/index.js';
import { act, mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import {
	List,
	MutableList,
	ListWithEmpty,
	ToggleableEmpty,
	DepPureList,
	CallBodyList,
	PlainCalleeList,
	KeyedSelectionList,
	KeyedSelectionTransition,
	KeyedSelectionUuidList,
	MismatchedKeyedSelectionList,
	SharedKeyedSelectionList,
	setExternal,
} from './_fixtures/for.tsrx';

const labels = (r: ReturnType<typeof mount>) => r.findAll('li').map((li) => li.textContent);

describe('forBlock — mount', () => {
	it('mounts an empty list', () => {
		const r = mount(List, { items: [] });
		expect(r.findAll('li')).toHaveLength(0);
		r.unmount();
	});

	it('mounts items in order', () => {
		const r = mount(List, {
			items: [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
				{ id: 3, label: 'c' },
			],
		});
		expect(labels(r)).toEqual(['a', 'b', 'c']);
		r.unmount();
	});
});

describe('forBlock — reconciliation', () => {
	it('reverse — keeps DOM nodes, reorders', () => {
		const r = mount(MutableList);
		const before = r.findAll('li');
		r.click('#reverse');
		expect(labels(r)).toEqual(['c', 'b', 'a']);
		// Same DOM nodes, just reordered (LIS-keyed reconciliation).
		const after = r.findAll('li');
		expect(after[0]).toBe(before[2]);
		expect(after[1]).toBe(before[1]);
		expect(after[2]).toBe(before[0]);
		r.unmount();
	});

	it('swap first + last', () => {
		const r = mount(MutableList);
		r.click('#swap');
		expect(labels(r)).toEqual(['c', 'b', 'a']);
		r.unmount();
	});

	it('append at end keeps existing nodes', () => {
		const r = mount(MutableList);
		const before = r.findAll('li');
		r.click('#add');
		expect(labels(r)).toEqual(['a', 'b', 'c', 'd']);
		const after = r.findAll('li');
		expect(after[0]).toBe(before[0]);
		expect(after[2]).toBe(before[2]);
		r.unmount();
	});

	it('remove-first', () => {
		const r = mount(MutableList);
		r.click('#remove-first');
		expect(labels(r)).toEqual(['b', 'c']);
		r.unmount();
	});

	it('remove-middle', () => {
		const r = mount(MutableList);
		r.click('#remove-middle');
		expect(labels(r)).toEqual(['a', 'c']);
		r.unmount();
	});

	it('clear all', () => {
		const r = mount(MutableList);
		r.click('#clear');
		expect(labels(r)).toEqual([]);
		r.unmount();
	});

	it('add → reverse → remove permutation', () => {
		const r = mount(MutableList);
		r.click('#add'); // a b c d
		r.click('#reverse'); // d c b a
		r.click('#remove-middle'); // d c a
		expect(labels(r)).toEqual(['d', 'c', 'a']);
		r.unmount();
	});
});

describe('forBlock — @empty branch', () => {
	it('mounts the empty branch when items is empty', () => {
		const r = mount(ListWithEmpty, { items: [] });
		expect(r.findAll('.row')).toHaveLength(0);
		expect(r.findAll('.empty')).toHaveLength(1);
		expect(r.find('.empty').textContent).toBe('No items');
		r.unmount();
	});

	it('mounts items when items is non-empty (no empty branch shown)', () => {
		const r = mount(ListWithEmpty, {
			items: [
				{ id: 1, label: 'a' },
				{ id: 2, label: 'b' },
			],
		});
		expect(r.findAll('.row').map((li) => li.textContent)).toEqual(['a', 'b']);
		expect(r.findAll('.empty')).toHaveLength(0);
		r.unmount();
	});

	it('transitions empty → items → empty cleanly via state', () => {
		const r = mount(ToggleableEmpty);
		// initial state: 2 items
		expect(r.findAll('.row').map((li) => li.textContent)).toEqual(['a', 'b']);
		expect(r.findAll('.empty')).toHaveLength(0);
		// → empty
		r.click('#clear');
		expect(r.findAll('.row')).toHaveLength(0);
		expect(r.findAll('.empty')).toHaveLength(1);
		expect(r.find('.empty').textContent).toBe('No items');
		// → items again
		r.click('#restore');
		expect(r.findAll('.row').map((li) => li.textContent)).toEqual(['a', 'b']);
		expect(r.findAll('.empty')).toHaveLength(0);
		// → empty once more
		r.click('#clear');
		expect(r.findAll('.empty')).toHaveLength(1);
		r.unmount();
	});

	it('handles initial-empty → items transition (first render is empty)', () => {
		const r = mount(ListWithEmpty, { items: [] });
		expect(r.findAll('.empty')).toHaveLength(1);
		r.update(ListWithEmpty, {
			items: [
				{ id: 1, label: 'x' },
				{ id: 2, label: 'y' },
			],
		});
		expect(r.findAll('.empty')).toHaveLength(0);
		expect(r.findAll('.row').map((li) => li.textContent)).toEqual(['x', 'y']);
		r.unmount();
	});
});

describe('forBlock — a plain-callee projection stays reactive to its real inputs', () => {
	it('a body calling a module helper still renders a changed item value', () => {
		// `{fmtRow(item)}` is the shape of every `{formatPrice(cents)}` in real code.
		// Unlike an item METHOD call, its receiver cannot hide mutable state behind a
		// stable ref, so it does not disqualify the region from memoization. What must
		// hold regardless is the ordinary contract: an unrelated parent re-render keeps
		// the rendered text, and a real item change reaches the DOM.
		const r = mount(PlainCalleeList);
		expect(r.findAll('.pc-row').map((li) => li.textContent)).toEqual(['p1:0', 'p2:0']);

		r.click('#pc-rerender');
		expect(r.findAll('.pc-row').map((li) => li.textContent)).toEqual(['p1:0', 'p2:0']);

		r.click('#pc-bump');
		expect(r.findAll('.pc-row').map((li) => li.textContent)).toEqual(['p1:1', 'p2:0']);

		r.click('#pc-bump');
		expect(r.findAll('.pc-row').map((li) => li.textContent)).toEqual(['p1:2', 'p2:0']);
		r.unmount();
	});
});

describe('forBlock — render-time calls defeat the survivor short-circuit', () => {
	it('a body calling an item method re-runs on every parent render (React parity)', () => {
		// The TanStack Table header pattern: stable item refs whose methods read
		// mutable state (`header.column.getIsSorted()`). Neither the item ref nor
		// any dep changes, so a PURE/DEP-PURE skip would freeze the output — the
		// compiler must classify call-bearing bodies as NORMAL.
		const r = mount(CallBodyList);
		expect(r.findAll('.cb-row').map((li) => li.textContent)).toEqual(['r1:tick0', 'r2:tick0']);

		setExternal('tick1');
		r.click('#cb-rerender');
		expect(r.findAll('.cb-row').map((li) => li.textContent)).toEqual(['r1:tick1', 'r2:tick1']);
		r.unmount();
		setExternal('tick0'); // reset the module-level fixture state
	});
});

describe('forBlock — DEP-PURE promotion compares deps with Object.is', () => {
	it('a NaN dep still promotes stable survivors to pure (bodies skipped)', () => {
		const r = mount(DepPureList);
		expect(r.findAll('.dp-row').map((li) => li.textContent)).toEqual(['row1:tick0', 'row2:tick0']);

		// Make the captured dep NaN (deps changed → this render's bodies re-run).
		r.click('#nanify');
		// Mutate the non-dep external, then re-render with UNCHANGED deps ([NaN]).
		setExternal('tick1');
		r.click('#rerender');
		// Object.is(NaN, NaN) → the pure promotion holds: survivor bodies are SKIPPED,
		// so the changed external is NOT re-read — identical to any other stable dep.
		// (Under a `!==` compare, a NaN dep permanently defeated the promotion and the
		// re-run bodies would show tick1.)
		expect(r.findAll('.dp-row').map((li) => li.textContent)).toEqual(['row1:tick0', 'row2:tick0']);
		r.unmount();
		setExternal('tick0'); // reset the module-level fixture state
	});
});

describe('keyed list selection', () => {
	const makeRows = () => [
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
		{ id: 3, label: 'third' },
	];

	it('updates the previous and next selected rows without replacing their DOM nodes', () => {
		const items = makeRows();
		const r = mount(KeyedSelectionList, { items, selected: 1 });
		const originalRows = r.findAll('li');

		r.update(KeyedSelectionList, { items, selected: 3 });
		expect(r.findAll('li.selected').map((row) => row.textContent)).toEqual(['third']);
		expect(r.findAll('li')).toEqual(originalRows);

		r.update(KeyedSelectionList, { items, selected: 2 });
		expect(r.findAll('li.selected').map((row) => row.textContent)).toEqual(['second']);
		expect(r.findAll('li')).toEqual(originalRows);
		r.unmount();
	});

	it('handles missing, cleared, and repeated selections', () => {
		const items = makeRows();
		const r = mount(KeyedSelectionList, { items, selected: null });
		expect(r.findAll('li.selected')).toHaveLength(0);

		r.update(KeyedSelectionList, { items, selected: 99 });
		expect(r.findAll('li.selected')).toHaveLength(0);

		r.update(KeyedSelectionList, { items, selected: 2 });
		expect(r.find('.selected').textContent).toBe('second');

		r.update(KeyedSelectionList, { items, selected: 2 });
		expect(r.findAll('.selected')).toHaveLength(1);
		expect(r.find('.selected').textContent).toBe('second');

		r.update(KeyedSelectionList, { items, selected: null });
		expect(r.findAll('li.selected')).toHaveLength(0);
		r.unmount();
	});

	it('matches selection against the authored custom key property', () => {
		const items = [
			{ uuid: 'a-1', label: 'first' },
			{ uuid: 'b-2', label: 'second' },
			{ uuid: 'c-3', label: 'third' },
		];
		const r = mount(KeyedSelectionUuidList, { items, selected: 'a-1' });
		const originalRows = r.findAll('li');

		r.update(KeyedSelectionUuidList, { items, selected: 'c-3' });
		expect(r.find('.selected').textContent).toBe('third');
		expect(r.findAll('li')).toEqual(originalRows);

		r.update(KeyedSelectionUuidList, { items, selected: 'missing' });
		expect(r.findAll('.selected')).toHaveLength(0);
		r.unmount();
	});

	it('updates every matching row when the selection property differs from the key', () => {
		const items = [
			{ uuid: 'a-1', id: 'shared', label: 'first' },
			{ uuid: 'b-2', id: 'other', label: 'second' },
			{ uuid: 'c-3', id: 'shared', label: 'third' },
		];
		const r = mount(MismatchedKeyedSelectionList, { items, selected: 'other' });

		r.update(MismatchedKeyedSelectionList, { items, selected: 'shared' });
		expect(r.findAll('.selected').map((row) => row.textContent)).toEqual(['first', 'third']);
		r.unmount();
	});

	it('updates every row when the selected value also drives another binding', () => {
		const items = makeRows();
		const r = mount(SharedKeyedSelectionList, { items, selected: 1 });

		r.update(SharedKeyedSelectionList, { items, selected: 3 });
		expect(r.findAll('li').map((row) => row.getAttribute('data-selected'))).toEqual([
			'3',
			'3',
			'3',
		]);
		expect(r.find('.selected').textContent).toBe('third');
		r.unmount();
	});

	it('updates every row when another captured parent value changes', () => {
		const items = makeRows();
		const r = mount(KeyedSelectionList, { items, selected: 1, prefix: 'before' });

		r.update(KeyedSelectionList, { items, selected: 3, prefix: 'after' });
		expect(r.findAll('li').map((row) => row.getAttribute('data-prefix'))).toEqual([
			'after',
			'after',
			'after',
		]);
		expect(r.find('.selected').textContent).toBe('third');

		r.update(KeyedSelectionList, { items, selected: 2, prefix: 'after' });
		expect(r.find('.selected').textContent).toBe('second');
		r.unmount();
	});

	it('preserves immutable keyed-row updates when the selection changes together', () => {
		const initialItems = makeRows();
		const r = mount(KeyedSelectionList, { items: initialItems, selected: 1 });
		const originalRows = r.findAll('li');
		const updatedItems = [
			initialItems[0]!,
			{ ...initialItems[1]!, label: 'updated second' },
			initialItems[2]!,
		];

		r.update(KeyedSelectionList, { items: updatedItems, selected: 2 });
		expect(labels(r)).toEqual(['first', 'updated second', 'third']);
		expect(r.find('.selected').textContent).toBe('updated second');
		expect(r.findAll('li')).toEqual(originalRows);

		r.update(KeyedSelectionList, { items: updatedItems, selected: 3 });
		expect(r.find('.selected').textContent).toBe('third');
		expect(labels(r)).toEqual(['first', 'updated second', 'third']);
		r.unmount();
	});

	it('keeps selection correct across reordering, removal, clearing, and refill', () => {
		const initialItems = makeRows();
		const r = mount(KeyedSelectionList, { items: initialItems, selected: 2 });
		const selectedRow = r.find('.selected');
		const reordered = [initialItems[2]!, initialItems[1]!, initialItems[0]!];

		r.update(KeyedSelectionList, { items: reordered, selected: 2 });
		expect(labels(r)).toEqual(['third', 'second', 'first']);
		expect(r.find('.selected')).toBe(selectedRow);

		const withoutSelected = [reordered[0]!, reordered[2]!];
		r.update(KeyedSelectionList, { items: withoutSelected, selected: 2 });
		expect(labels(r)).toEqual(['third', 'first']);
		expect(r.findAll('.selected')).toHaveLength(0);

		r.update(KeyedSelectionList, { items: [], selected: null });
		expect(r.findAll('li')).toHaveLength(0);

		r.update(KeyedSelectionList, { items: initialItems, selected: 3 });
		expect(labels(r)).toEqual(['first', 'second', 'third']);
		expect(r.find('.selected').textContent).toBe('third');
		r.unmount();
	});

	it('adopts server-rendered rows and keeps them live when selection changes', () => {
		const items = makeRows();
		const props = { items, selected: 1, prefix: 'hydrated' };
		const server = loadServerFixture('packages/octane/tests/_fixtures/for.tsrx', {
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.KeyedSelectionList, props).html;
		const originalRows = Array.from(container.querySelectorAll('li'));
		const root = hydrateRoot(container, KeyedSelectionList, props);
		flushSync(() => {});

		expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
		expect(container.querySelector('.selected')?.textContent).toBe('first');

		flushSync(() => root.render(KeyedSelectionList, { ...props, selected: 3 }));
		expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
		expect(container.querySelector('.selected')?.textContent).toBe('third');

		root.unmount();
		container.remove();
	});

	it('keeps the committed selection while a later transition sibling suspends', async () => {
		const items = makeRows();
		const initialPromise = Promise.resolve('initial');
		let resolveNext!: (value: string) => void;
		const nextPromise = new Promise<string>((resolve) => {
			resolveNext = resolve;
		});
		await Promise.resolve();
		const r = mount(KeyedSelectionTransition, { items, initialPromise, nextPromise });
		await act(() => {});
		expect(r.find('#selection-transition-list .selected').textContent).toBe('first');
		expect(r.find('#selection-transition-value').textContent).toBe('initial');

		r.click('#selection-transition-bump');
		expect(r.find('#selection-transition-list .selected').textContent).toBe('first');
		expect(r.find('#selection-transition-value').textContent).toBe('initial');
		expect(r.findAll('#selection-transition-fallback')).toHaveLength(0);

		await act(() => resolveNext('resolved'));
		expect(r.find('#selection-transition-list .selected').textContent).toBe('second');
		expect(r.find('#selection-transition-value').textContent).toBe('resolved');

		r.click('#selection-transition-urgent');
		expect(r.findAll('#selection-transition-list .selected')).toHaveLength(1);
		expect(r.find('#selection-transition-list .selected').textContent).toBe('third');
		r.unmount();
	});
});

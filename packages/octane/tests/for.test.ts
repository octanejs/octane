import { describe, it, expect, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { createElement, flushSync, hydrateRoot, use, type OctaneNode } from '../src/index.js';
import { act, mount } from './_helpers';
import { loadServerFixture } from './_server-fixture';
import {
	List,
	MutableList,
	ListWithEmpty,
	ToggleableEmpty,
	DepPureList,
	CallBodyList,
	NestedConditionalActivityList,
	NestedConditionalCallBodyList,
	NestedConditionalList,
	NestedConditionalTransition,
	PlainCalleeList,
	KeyedSelectionList,
	KeyedSelectionProjectionList,
	KeyedSelectionControlledList,
	KeyedSelectionRenderableList,
	KeyedSelectionTransition,
	KeyedSelectionUuidList,
	MismatchedKeyedSelectionList,
	SharedKeyedSelectionList,
	FastHostKeyedList,
	FastHostMappedList,
	FastHostCustomList,
	FastHostRefList,
	FastHostControlledList,
	FastHostRenderCallList,
	FastHostTransitionList,
	FastRowContext,
	FastContextGetterList,
	FastRenderableProbe,
	FastMappedRenderableList,
	FastMappedBoundaryList,
	FastSuspendingGetterList,
	NestedKeyedReorderList,
	NestedKeyedReorderBoundary,
	NestedKeyedReorderTransition,
	HostBindingList,
	HostMappedBindingList,
	setExternal,
	setNestedConditionalActivityMode,
} from './_fixtures/for.tsrx';
import {
	CapturedSnapshotList,
	StrongAliasedContextRows,
	StrongCallableDependencies,
	StrongConstructedResultProp,
	StrongConstCustomHookContextRows,
	StrongCustomHookContext,
	StrongCyclicContextReaders,
	StrongFactoryReadProp,
	StrongMapJoinProp,
	StrongOptionalAliasedContextRows,
	StrongOptionalNamespaceContextRows,
	StrongShadowedAssignmentContextRows,
	StrongSignedZeroConstructedProp,
	StrongSignedZeroListProjections,
	StrongSuspenseLayoutEffect,
	StrongTheme,
	SnapshotCalculation,
	SnapshotMethodList,
	WrappedSnapshotCalculation,
	type StrongNumberProjectorConstructor,
	type StrongProjectorConstructor,
	type SnapshotRow,
} from './_fixtures/for-strong.tsrx';
import { SnapshotMappedList } from './_fixtures/for-strong.js';

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

describe('forBlock — live methods in compatibility mode', () => {
	it('keeps live item methods reactive in compatibility mode', () => {
		// The TanStack Table header pattern: stable item refs whose methods read
		// mutable state (`header.column.getIsSorted()`). Neither the item ref nor
		// any dep changes, so a PURE/DEP-PURE skip would freeze the output — the
		// compatibility compiler must keep these bodies live.
		const r = mount(CallBodyList);
		expect(r.findAll('.cb-row').map((li) => li.textContent)).toEqual(['r1:tick0', 'r2:tick0']);

		setExternal('tick1');
		r.click('#cb-rerender');
		expect(r.findAll('.cb-row').map((li) => li.textContent)).toEqual(['r1:tick1', 'r2:tick1']);
		r.unmount();
		setExternal('tick0'); // reset the module-level fixture state
	});

	it('re-evaluates item methods inside nested conditional markup', () => {
		const r = mount(NestedConditionalCallBodyList);
		expect(r.findAll('.nested-call-row').map((row) => row.textContent)).toEqual([
			'r1:tick0',
			'r2:tick0',
		]);

		setExternal('tick1');
		r.click('#nested-call-rerender');
		expect(r.findAll('.nested-call-row').map((row) => row.textContent)).toEqual([
			'r1:tick1',
			'r2:tick1',
		]);
		r.unmount();
		setExternal('tick0');
	});
});

describe('Strong list methods preserve snapshot and event semantics', () => {
	const row = (id: number, label: string): SnapshotRow => ({
		id,
		label,
		read(prefix) {
			return prefix + this.label;
		},
	});

	it.each([
		['keyed templates', SnapshotMethodList],
		['returned JSX', SnapshotMappedList],
	])('updates snapshots, arguments, and captured callbacks in %s', (_dialect, Component) => {
		const items = [row(1, 'apple'), row(2, 'banana')];
		const selected: string[] = [];
		const onSelect = (item: SnapshotRow) => selected.push('first:' + item.label);
		const r = mount(Component, { items, prefix: 'old:', onSelect });
		const original = r.findAll('li');
		const editor = r.find('input') as HTMLInputElement;
		editor.value = 'my draft';
		const text = () => r.findAll('.snapshot-label').map((element) => element.textContent);
		expect(text()).toEqual(['old:apple', 'old:banana']);

		const appended = [...items, row(3, 'cherry')];
		r.update(Component, { items: appended, prefix: 'old:', onSelect });
		expect(text()).toEqual(['old:apple', 'old:banana', 'old:cherry']);
		expect(r.findAll('li').slice(0, 2)).toEqual(original);
		expect(r.find('input')).toBe(editor);
		expect(editor.value).toBe('my draft');
		r.click('li[data-id="1"] button');

		r.update(Component, { items: appended, prefix: 'new:', onSelect });
		expect(text()).toEqual(['new:apple', 'new:banana', 'new:cherry']);
		const latestSelect = (item: SnapshotRow) => selected.push('latest:' + item.label);
		r.update(Component, { items: appended, prefix: 'new:', onSelect: latestSelect });
		r.click('li[data-id="1"] button');
		expect(selected).toEqual(['first:apple', 'latest:apple']);

		const replacement = row(1, 'apricot');
		const reordered = [appended[2]!, replacement, items[1]!];
		r.update(Component, { items: reordered, prefix: 'new:', onSelect: latestSelect });
		expect(text()).toEqual(['new:cherry', 'new:apricot', 'new:banana']);
		expect(r.findAll('li')[1]).toBe(original[0]);
		expect(r.findAll('li')[2]).toBe(original[1]);
		r.click('li[data-id="1"] button');
		expect(selected).toEqual(['first:apple', 'latest:apple', 'latest:apricot']);

		r.update(Component, { items: [replacement], prefix: 'last:', onSelect: latestSelect });
		expect(text()).toEqual(['last:apricot']);
		expect(r.find('li')).toBe(original[0]);
		r.update(Component, { items: [], prefix: 'last:', onSelect: latestSelect });
		expect(r.findAll('.snapshot-label')).toHaveLength(0);
		r.update(Component, { items, prefix: 'restored:', onSelect });
		expect(text()).toEqual(['restored:apple', 'restored:banana']);
		r.unmount();
	});

	it('keeps appended items when an original row removes itself using the captured list', () => {
		const diagnostic = vi.spyOn(console, 'log').mockImplementation(() => {});
		const r = mount(CapturedSnapshotList);
		try {
			const original = r.findAll('.captured-row');
			const text = () => r.findAll('.captured-row span').map((element) => element.textContent);
			r.click('#captured-append');
			expect(text()).toEqual(['apple', 'banana', 'cherry', 'item 4']);
			expect(r.findAll('.captured-row').slice(0, 3)).toEqual(original);
			r.click('.captured-row[data-id="1"] button');
			expect(text()).toEqual(['banana', 'cherry', 'item 4']);

			r.click('#captured-prepend');
			r.click('#captured-reverse');
			expect(text()).toEqual(['item 4', 'cherry', 'banana', 'item 5']);
			expect(r.findAll('.captured-row')[2]).toBe(original[1]);
			r.click('.captured-row[data-id="2"] button');
			expect(text()).toEqual(['item 4', 'cherry', 'item 5']);
			r.click('#captured-clear');
			expect(r.find('.captured-empty').textContent).toBe('Empty');
			r.click('#captured-append');
			expect(text()).toEqual(['item 6']);
		} finally {
			r.unmount();
			diagnostic.mockRestore();
		}
	});

	it.each([
		['direct methods', SnapshotCalculation],
		['same-module wrappers', WrappedSnapshotCalculation],
	])('updates calculations through %s when any input changes', (_shape, Component) => {
		const first = row(1, 'apple');
		const formatter = { read: (item: SnapshotRow, prefix: string) => prefix + item.label };
		const r = mount(Component, { item: first, prefix: 'first:', formatter });
		expect(r.find('p').textContent).toBe('first:apple');
		r.update(Component, { item: first, prefix: 'next:', formatter });
		expect(r.find('p').textContent).toBe('next:apple');
		const replacement = row(1, 'apricot');
		r.update(Component, { item: replacement, prefix: 'next:', formatter });
		expect(r.find('p').textContent).toBe('next:apricot');
		r.update(Component, {
			item: replacement,
			prefix: 'next:',
			formatter: { read: (item: SnapshotRow) => item.label + '!' },
		});
		expect(r.find('p').textContent).toBe('apricot!');
		r.unmount();
	});

	it('adopts Strong method rows and preserves edits and current handlers after hydration', () => {
		const items = [row(1, 'apple'), row(2, 'banana')];
		const selected: string[] = [];
		const props = {
			items,
			prefix: 'server:',
			onSelect: (item: SnapshotRow) => selected.push(item.label),
		};
		const server = loadServerFixture('packages/octane/tests/_fixtures/for-strong.tsrx', {
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.SnapshotMethodList, props).html;
		const original = Array.from(container.querySelectorAll('li'));
		const editor = container.querySelector('input')!;
		editor.value = 'typed before hydration';
		const root = hydrateRoot(container, SnapshotMethodList, props);
		flushSync(() => {});
		expect(Array.from(container.querySelectorAll('li'))).toEqual(original);
		expect(container.querySelector('input')).toBe(editor);
		expect(editor.value).toBe('typed before hydration');

		flushSync(() =>
			root.render(SnapshotMethodList, {
				...props,
				items: [row(1, 'apricot'), items[1]!],
				prefix: 'client:',
			}),
		);
		expect(
			Array.from(container.querySelectorAll('.snapshot-label')).map((el) => el.textContent),
		).toEqual(['client:apricot', 'client:banana']);
		expect(Array.from(container.querySelectorAll('li'))).toEqual(original);
		(container.querySelector('button') as HTMLButtonElement).click();
		expect(selected).toEqual(['apricot']);
		root.unmount();
		container.remove();
	});
});

describe('Strong memoization preserves dependency and setup semantics', () => {
	it.each([
		[
			'member results after a call',
			StrongMapJoinProp,
			{ items: ['a', 'b'], project: (value: string) => value.toUpperCase() },
			'#strong-map-join',
			'A,B',
		],
		[
			'method results from a factory',
			StrongFactoryReadProp,
			{ factory: () => ({ read: (value: string) => `read:${value}` }), value: 'a' },
			'#strong-factory-read',
			'read:a',
		],
		[
			'properties of constructed values',
			StrongConstructedResultProp,
			{
				Projector: class {
					result: string;
					constructor(value: string) {
						this.result = `new:${value}`;
					}
				} satisfies StrongProjectorConstructor,
				value: 'a',
			},
			'#strong-constructed-result',
			'new:a',
		],
	] as const)(
		'mounts component props containing %s',
		(_label, Component, props, selector, value) => {
			const r = mount(Component as any, props);
			expect(r.find(selector).textContent).toBe(value);
			r.unmount();
		},
	);

	it('invalidates call helpers and method receivers when their immutable identities change', () => {
		const make = function (this: { prefix: string }) {
			const prefix = this.prefix;
			return (value: string) => prefix + value;
		};
		const tag = function (this: { prefix: string }, _strings: TemplateStringsArray, value: string) {
			return this.prefix + value;
		};
		const first = {
			value: 'value',
			format: (value: string) => `first:${value}`,
			tagger: { prefix: 'first:', make },
			template: { prefix: 'first:', tag },
		};
		const second = {
			value: 'value',
			format: (value: string) => `second:${value}`,
			tagger: { prefix: 'second:', make },
			template: { prefix: 'second:', tag },
		};
		const r = mount(StrongCallableDependencies, first);
		for (const selector of [
			'#strong-call',
			'#strong-apply',
			'#strong-bind',
			'#strong-produced-callee',
			'#strong-tag',
		]) {
			expect(r.find(selector).textContent).toBe('first:value');
		}

		r.update(StrongCallableDependencies, second);
		for (const selector of [
			'#strong-call',
			'#strong-apply',
			'#strong-bind',
			'#strong-produced-callee',
			'#strong-tag',
		]) {
			expect(r.find(selector).textContent).toBe('second:value');
		}
		r.unmount();
	});

	it.each([
		[
			'StrongMapJoinProp',
			StrongMapJoinProp,
			{ items: ['a', 'b'], project: (value: string) => value.toUpperCase() },
			'#strong-map-join',
			'A,B',
		],
		[
			'StrongFactoryReadProp',
			StrongFactoryReadProp,
			{ factory: () => ({ read: (value: string) => `read:${value}` }), value: 'a' },
			'#strong-factory-read',
			'read:a',
		],
		[
			'StrongConstructedResultProp',
			StrongConstructedResultProp,
			{
				Projector: class {
					result: string;
					constructor(value: string) {
						this.result = `new:${value}`;
					}
				} satisfies StrongProjectorConstructor,
				value: 'a',
			},
			'#strong-constructed-result',
			'new:a',
		],
	] as const)(
		'hydrates %s component props without replacing the output',
		(exportName, Component, props, selector, value) => {
			const server = loadServerFixture('packages/octane/tests/_fixtures/for-strong.tsrx', {
				compileOptions: { hmr: false, dev: false },
			});
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = ServerRuntime.renderToString((server as any)[exportName], props).html;
			const original = container.querySelector(selector);
			const root = hydrateRoot(container, Component as any, props);
			flushSync(() => {});
			expect(container.querySelector(selector)).toBe(original);
			expect(original?.textContent).toBe(value);
			root.unmount();
			container.remove();
		},
	);

	it('hydrates and then invalidates changed callable and receiver identities', () => {
		const make = function (this: { prefix: string }) {
			const prefix = this.prefix;
			return (value: string) => prefix + value;
		};
		const tag = function (this: { prefix: string }, _strings: TemplateStringsArray, value: string) {
			return this.prefix + value;
		};
		const props = (prefix: string) => ({
			value: 'value',
			format: (value: string) => `${prefix}:${value}`,
			tagger: { prefix: `${prefix}:`, make },
			template: { prefix: `${prefix}:`, tag },
		});
		const first = props('first');
		const second = props('second');
		const selectors = [
			'#strong-call',
			'#strong-apply',
			'#strong-bind',
			'#strong-produced-callee',
			'#strong-tag',
		];
		const server = loadServerFixture('packages/octane/tests/_fixtures/for-strong.tsrx', {
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(
			server.StrongCallableDependencies,
			first,
		).html;
		const original = selectors.map((selector) => container.querySelector(selector));
		const root = hydrateRoot(container, StrongCallableDependencies, first);
		flushSync(() => {});
		expect(selectors.map((selector) => container.querySelector(selector))).toEqual(original);

		flushSync(() => root.render(StrongCallableDependencies, second));
		for (const selector of selectors) {
			expect(container.querySelector(selector)?.textContent).toBe('second:value');
		}
		root.unmount();
		container.remove();
	});

	it('invalidates a child whose setup custom hook reads context', () => {
		function ContextHost(props: { value: string }): OctaneNode {
			return createElement(
				StrongTheme.Provider,
				{ value: props.value },
				createElement(StrongCustomHookContext, { context: StrongTheme }),
			);
		}
		const r = mount(ContextHost, { value: 'first' });
		expect(r.find('#strong-custom-hook-context').textContent).toBe('first');
		r.update(ContextHost, { value: 'second' });
		expect(r.find('#strong-custom-hook-context').textContent).toBe('second');
		r.unmount();
	});

	it('does not skip an aliased built-in hook in keyed-row setup', () => {
		const r = mount(StrongAliasedContextRows);
		expect(r.findAll('.strong-aliased-context-row').map((row) => row.textContent)).toEqual([
			'first',
			'first',
		]);
		r.click('#strong-aliased-context-update');
		expect(r.findAll('.strong-aliased-context-row').map((row) => row.textContent)).toEqual([
			'second',
			'second',
		]);
		r.unmount();
	});

	it('does not skip a const custom hook in keyed-row setup', () => {
		const r = mount(StrongConstCustomHookContextRows);
		expect(r.findAll('.strong-const-hook-context-row').map((row) => row.textContent)).toEqual([
			'first',
			'first',
		]);
		r.click('#strong-const-hook-context-update');
		expect(r.findAll('.strong-const-hook-context-row').map((row) => row.textContent)).toEqual([
			'second',
			'second',
		]);
		r.unmount();
	});

	it('does not skip an optional aliased built-in hook in keyed-row setup', () => {
		const r = mount(StrongOptionalAliasedContextRows);
		expect(r.findAll('.strong-optional-direct-context-row').map((row) => row.textContent)).toEqual([
			'first',
			'first',
		]);
		expect(r.findAll('.strong-optional-context-row').map((row) => row.textContent)).toEqual([
			'first',
			'first',
		]);
		expect(r.findAll('.strong-optional-custom-context-row').map((row) => row.textContent)).toEqual([
			'first',
			'first',
		]);
		expect(
			r.findAll('.strong-optional-namespace-context-row').map((row) => row.textContent),
		).toEqual(['first', 'first']);
		r.click('#strong-optional-context-update');
		expect(r.findAll('.strong-optional-direct-context-row').map((row) => row.textContent)).toEqual([
			'second',
			'second',
		]);
		expect(r.findAll('.strong-optional-context-row').map((row) => row.textContent)).toEqual([
			'second',
			'second',
		]);
		expect(r.findAll('.strong-optional-custom-context-row').map((row) => row.textContent)).toEqual([
			'second',
			'second',
		]);
		expect(
			r.findAll('.strong-optional-namespace-context-row').map((row) => row.textContent),
		).toEqual(['second', 'second']);
		r.unmount();
	});

	it('does not skip an optional namespace hook when it is the only keyed-row setup call', () => {
		const r = mount(StrongOptionalNamespaceContextRows);
		expect(
			r.findAll('.strong-optional-namespace-only-context-row').map((row) => row.textContent),
		).toEqual(['first', 'first']);
		r.click('#strong-optional-namespace-context-update');
		expect(
			r.findAll('.strong-optional-namespace-only-context-row').map((row) => row.textContent),
		).toEqual(['second', 'second']);
		r.unmount();
	});

	it('finds setup hooks through cyclic same-module call graphs independent of declaration order', () => {
		const r = mount(StrongCyclicContextReaders);
		expect(r.find('#strong-cycle-reader-a').textContent).toBe('first');
		expect(r.find('#strong-cycle-reader-c').textContent).toBe('first');
		r.click('#strong-cycle-context-update');
		expect(r.find('#strong-cycle-reader-a').textContent).toBe('second');
		expect(r.find('#strong-cycle-reader-c').textContent).toBe('second');
		r.unmount();
	});

	it('resolves shadowed assignments by binding when following same-module setup hooks', () => {
		const r = mount(StrongShadowedAssignmentContextRows);
		expect(r.find('.strong-shadow-context-row').textContent).toBe('first');
		r.click('#strong-shadow-context-update');
		expect(r.find('.strong-shadow-context-row').textContent).toBe('second');
		r.unmount();
	});

	it('uses SameValue semantics for newly cached constructor inputs', () => {
		const Projector = class {
			result: string;
			constructor(value: number) {
				this.result = Object.is(value, -0) ? '-0' : '+0';
			}
		} satisfies StrongNumberProjectorConstructor;
		const r = mount(StrongSignedZeroConstructedProp, { Projector, value: 0 });
		expect(r.find('#strong-signed-zero-constructor').textContent).toBe('+0');
		r.update(StrongSignedZeroConstructedProp, { Projector, value: -0 });
		expect(r.find('#strong-signed-zero-constructor').textContent).toBe('-0');
		r.unmount();
	});

	it('preserves signed-zero projection inputs through ordinary list caches', () => {
		const Projector = class {
			result: string;
			constructor(value: number) {
				this.result = Object.is(value, -0) ? '-0' : '+0';
			}
		} satisfies StrongNumberProjectorConstructor;
		const items = [{ id: 1 }];
		const r = mount(StrongSignedZeroListProjections, { items, Projector, value: 0 });
		expect(r.find('.strong-signed-zero-list-child').textContent).toBe('+0');
		expect(r.find('.strong-signed-zero-list-inline').textContent).toBe('+0');
		r.update(StrongSignedZeroListProjections, { items, Projector, value: -0 });
		expect(r.find('.strong-signed-zero-list-child').textContent).toBe('-0');
		expect(r.find('.strong-signed-zero-list-inline').textContent).toBe('-0');
		r.unmount();
	});

	it('reconnects cached-child layout effects after a Suspense reveal', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const log: string[] = [];
		let show!: () => void;
		const r = mount(StrongSuspenseLayoutEffect, {
			promise,
			log,
			bind: (next: () => void) => {
				show = next;
			},
		});
		await act(() => {});
		expect(log).toEqual(['create']);

		await act(() => show());
		expect(r.find('#strong-layout-effect-pending').textContent).toBe('pending');
		expect(log).toEqual(['create', 'destroy']);

		await act(() => resolve('ready'));
		expect(r.findAll('#strong-layout-effect-pending')).toHaveLength(0);
		expect(r.find('#strong-async-child').textContent).toBe('ready');
		expect(log).toEqual(['create', 'destroy', 'create']);
		r.unmount();
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

describe('keyed rows with nested conditional content', () => {
	const makeRows = () => [
		{ id: 1, label: 'first' },
		{ id: 2, label: 'second' },
		{ id: 3, label: 'third' },
	];

	it('updates Activity visibility in stable keyed rows alongside host conditionals', () => {
		const items = [{ id: 1, label: 'first' }];
		const r = mount(NestedConditionalActivityList, { items, visible: true });
		const content = r.find('.nested-conditional-activity-content') as HTMLElement;

		try {
			expect(content.style.display).toBe('');

			setNestedConditionalActivityMode('hidden');
			r.update(NestedConditionalActivityList, { items: [...items], visible: true });
			expect(content.style.display).toBe('none');
			expect(r.find('.nested-conditional-activity-content')).toBe(content);

			setNestedConditionalActivityMode('visible');
			r.update(NestedConditionalActivityList, { items: [...items], visible: true });
			expect(content.style.display).toBe('');
			expect(r.find('.nested-conditional-activity-label').textContent).toBe('first');
		} finally {
			r.unmount();
			setNestedConditionalActivityMode('visible');
		}
	});

	it('preserves surviving rows while updating immutable values, editing state, and callbacks', () => {
		const initialItems = makeRows();
		const calls: string[] = [];
		const originalHandler = (id: number, prefix: string) => {
			calls.push('original:' + prefix + ':' + id);
		};
		const initialProps = {
			items: initialItems,
			editing: 2,
			prefix: 'before',
			onSelect: originalHandler,
		};
		const r = mount(NestedConditionalList, initialProps);
		const originalRows = r.findAll('li');
		const editor = r.find('.nested-conditional-editor') as HTMLInputElement;
		editor.value = 'uncommitted draft';

		const updatedItems = [
			initialItems[0]!,
			{ ...initialItems[1]!, label: 'updated second', completed: true },
			initialItems[2]!,
		];
		r.update(NestedConditionalList, { ...initialProps, items: updatedItems });
		expect(r.findAll('li')).toEqual(originalRows);
		expect(r.find('.completed .nested-conditional-label').textContent).toBe('updated second');
		expect(r.find('.nested-conditional-editor')).toBe(editor);
		expect(editor.value).toBe('uncommitted draft');

		const nextHandler = (id: number, prefix: string) => {
			calls.push('updated:' + prefix + ':' + id);
		};
		r.update(NestedConditionalList, {
			items: updatedItems,
			editing: 3,
			prefix: 'after',
			onSelect: nextHandler,
		});
		expect(r.findAll('li')).toEqual(originalRows);
		expect(r.findAll('li').map((row) => row.getAttribute('data-prefix'))).toEqual([
			'after',
			'after',
			'after',
		]);
		expect(r.find('.editing .nested-conditional-label').textContent).toBe('third');
		expect((r.find('.nested-conditional-editor') as HTMLInputElement).value).toBe('third');
		r.click('.editing .nested-conditional-action');
		expect(calls).toEqual(['updated:after:3']);
		r.unmount();
	});

	it('preserves conditional DOM and live events when surviving rows move or disappear', () => {
		const initialItems = makeRows();
		const selected: number[] = [];
		const props = {
			items: initialItems,
			editing: 2,
			prefix: 'row',
			onSelect: (id: number) => {
				selected.push(id);
			},
		};
		const r = mount(NestedConditionalList, props);
		const originalRows = r.findAll('li');
		const editor = r.find('.nested-conditional-editor') as HTMLInputElement;
		editor.value = 'keep my draft';

		const reordered = [initialItems[2]!, initialItems[1]!, initialItems[0]!];
		r.update(NestedConditionalList, { ...props, items: reordered });
		expect(r.findAll('li')).toEqual([originalRows[2], originalRows[1], originalRows[0]]);
		expect(r.find('.nested-conditional-editor')).toBe(editor);
		expect(editor.value).toBe('keep my draft');
		r.click('.editing .nested-conditional-action');

		r.update(NestedConditionalList, {
			...props,
			items: [reordered[0]!, reordered[2]!],
			editing: null,
		});
		expect(r.findAll('li')).toEqual([originalRows[2], originalRows[0]]);
		expect(r.findAll('.nested-conditional-editor')).toHaveLength(0);
		r.click('.nested-conditional-action');
		expect(selected).toEqual([2, 3]);
		r.unmount();
	});

	it('adopts server-rendered conditional rows while preserving inputs and live handlers', () => {
		const items = makeRows();
		const selected: number[] = [];
		const props = {
			items,
			editing: 2,
			prefix: 'hydrated',
			onSelect: (id: number) => {
				selected.push(id);
			},
		};
		const server = loadServerFixture('packages/octane/tests/_fixtures/for.tsrx', {
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.NestedConditionalList, props).html;
		const originalRows = Array.from(container.querySelectorAll('li'));
		const originalEditor = container.querySelector(
			'.nested-conditional-editor',
		) as HTMLInputElement;
		originalEditor.value = 'typed before hydration';
		const root = hydrateRoot(container, NestedConditionalList, props);
		flushSync(() => {});

		expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
		expect(container.querySelector('.nested-conditional-editor')).toBe(originalEditor);
		expect(originalEditor.value).toBe('typed before hydration');

		flushSync(() => root.render(NestedConditionalList, { ...props, editing: 3 }));
		expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
		expect(container.querySelector('.editing .nested-conditional-label')?.textContent).toBe(
			'third',
		);
		(container.querySelector('.editing .nested-conditional-action') as HTMLButtonElement).click();
		expect(selected).toEqual([3]);

		root.unmount();
		container.remove();
	});

	it('keeps committed conditional-row bindings intact while a later transition sibling suspends', async () => {
		const items = makeRows();
		const initialPromise = Promise.resolve('initial');
		let resolveNext!: (value: string) => void;
		const nextPromise = new Promise<string>((resolve) => {
			resolveNext = resolve;
		});
		await Promise.resolve();
		const r = mount(NestedConditionalTransition, { items, initialPromise, nextPromise });
		await act(() => {});
		const originalRows = r.findAll('#nested-transition-list li');
		const rowLabels = () => r.findAll('.nested-transition-label').map((row) => row.textContent);
		expect(rowLabels()).toEqual(['initial:first', 'initial:second', 'initial:third']);
		expect(r.find('.nested-transition-detail').textContent).toBe('initial:first');

		r.click('#nested-transition-bump');
		expect(r.findAll('#nested-transition-list li')).toEqual(originalRows);
		expect(rowLabels()).toEqual(['initial:first', 'initial:second', 'initial:third']);
		expect(r.find('.nested-transition-detail').textContent).toBe('initial:first');
		expect(r.findAll('#nested-transition-fallback')).toHaveLength(0);

		await act(() => resolveNext('resolved'));
		expect(r.findAll('#nested-transition-list li')).toEqual(originalRows);
		expect(rowLabels()).toEqual(['pending:first', 'pending:second', 'pending:third']);
		expect(r.find('.nested-transition-detail').textContent).toBe('pending:first');

		r.click('#nested-transition-urgent');
		expect(rowLabels()).toEqual(['urgent:first', 'urgent:second', 'urgent:third']);
		expect(r.find('.nested-transition-detail').textContent).toBe('urgent:first');
		r.unmount();
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

	it('uses strict equality for NaN and signed-zero selection keys', () => {
		const items = [
			{ id: Number.NaN, label: 'not a number' },
			{ id: -0, label: 'zero' },
			{ id: 1, label: 'one' },
		];
		const r = mount(KeyedSelectionList, { items, selected: 1 });
		const originalRows = r.findAll('li');

		r.update(KeyedSelectionList, { items, selected: Number.NaN });
		expect(r.findAll('li.selected')).toHaveLength(0);

		r.update(KeyedSelectionList, { items, selected: -0 });
		expect(r.findAll('li.selected')).toEqual([originalRows[1]]);
		r.update(KeyedSelectionList, { items, selected: 0 });
		expect(r.findAll('li.selected')).toEqual([originalRows[1]]);
		r.update(KeyedSelectionList, { items, selected: 99 });
		expect(r.findAll('li.selected')).toHaveLength(0);

		const reordered = [items[2]!, items[0]!, items[1]!];
		r.update(KeyedSelectionList, { items: reordered, selected: Number.NaN });
		expect(r.findAll('li')).toEqual([originalRows[2], originalRows[0], originalRows[1]]);
		expect(r.findAll('li.selected')).toHaveLength(0);
		r.update(KeyedSelectionList, { items: reordered, selected: 0 });
		expect(r.findAll('li.selected')).toEqual([originalRows[1]]);
		r.unmount();
	});

	it('uses SameValue for other captures in a strict-equality selection list', () => {
		const items = makeRows();
		const r = mount(KeyedSelectionProjectionList, { items, selected: 1, projection: 0 });
		expect(r.findAll('li').map((row) => row.getAttribute('data-projection'))).toEqual([
			'Infinity',
			'Infinity',
			'Infinity',
		]);

		r.update(KeyedSelectionProjectionList, { items, selected: 1, projection: -0 });
		expect(r.findAll('li').map((row) => row.getAttribute('data-projection'))).toEqual([
			'-Infinity',
			'-Infinity',
			'-Infinity',
		]);
		expect(r.find('.selected').textContent).toBe('first');
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

	it('preserves immutable row updates when returning to an earlier selected key', () => {
		const initialItems = makeRows();
		const r = mount(KeyedSelectionList, { items: initialItems, selected: 1 });
		const originalRows = r.findAll('li');

		r.update(KeyedSelectionList, { items: initialItems, selected: 2 });
		expect(r.findAll('li.selected')).toEqual([originalRows[1]]);

		const updatedItems = [
			initialItems[0]!,
			{ ...initialItems[1]!, label: 'updated second' },
			initialItems[2]!,
		];

		r.update(KeyedSelectionList, { items: updatedItems, selected: 1 });
		expect(labels(r)).toEqual(['first', 'updated second', 'third']);
		expect(r.findAll('li.selected')).toEqual([originalRows[0]]);
		expect(r.findAll('li')).toEqual(originalRows);

		r.update(KeyedSelectionList, { items: updatedItems, selected: 2 });
		expect(r.find('.selected').textContent).toBe('updated second');
		expect(labels(r)).toEqual(['first', 'updated second', 'third']);
		r.unmount();
	});

	it('reasserts controlled values in rows whose selection changes', () => {
		const items = makeRows();
		const r = mount(KeyedSelectionControlledList, { items, selected: 1 });
		const originalRows = r.findAll('li');
		const controls = r.findAll('input') as HTMLInputElement[];
		controls[0]!.focus();
		controls[0]!.value = 'changed outside render';
		controls[1]!.value = 'changed before selection';

		r.update(KeyedSelectionControlledList, { items, selected: 2 });
		expect(controls.map((control) => control.value)).toEqual(items.map((row) => row.label));
		expect(r.findAll('li.selected')).toEqual([originalRows[1]]);
		expect(r.findAll('li')).toEqual(originalRows);
		expect(r.findAll('input')).toEqual(controls);
		expect(document.activeElement).toBe(controls[0]);
		r.unmount();
	});

	it('keeps stable render-function children live when their rows are selected', () => {
		let first = 'first';
		let second = 'second';
		const items = [
			{
				id: 1,
				content: () =>
					createElement('span', { className: 'keyed-selection-readable-child' }, first),
			},
			{
				id: 2,
				content: () =>
					createElement('span', { className: 'keyed-selection-readable-child' }, second),
			},
			{ id: 3, content: 'third' },
		];
		const r = mount(KeyedSelectionRenderableList, { items, selected: 1 });
		const originalRows = r.findAll('li');
		const originalChildren = r.findAll('.keyed-selection-readable-child');
		expect(labels(r)).toEqual(['first', 'second', 'third']);

		first = 'updated first';
		second = 'updated second';
		r.update(KeyedSelectionRenderableList, { items, selected: 2 });
		expect(labels(r)).toEqual(['updated first', 'updated second', 'third']);
		expect(r.findAll('li.selected')).toEqual([originalRows[1]]);
		expect(r.findAll('li')).toEqual(originalRows);
		expect(r.findAll('.keyed-selection-readable-child')).toEqual(originalChildren);

		first = 'selected first again';
		r.update(KeyedSelectionRenderableList, { items, selected: 1 });
		expect(labels(r)).toEqual(['selected first again', 'updated second', 'third']);
		expect(r.findAll('li.selected')).toEqual([originalRows[0]]);
		expect(r.findAll('.keyed-selection-readable-child')).toEqual(originalChildren);
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

describe('large keyed list fills', () => {
	const makeRows = (length = 24) =>
		Array.from({ length }, (_, index) => ({ id: index + 1, label: `row ${index + 1}` }));

	it('preserves row order, static siblings, delegated events, selection, and keyed identity', () => {
		const items = makeRows();
		const picked: number[] = [];
		const onPick = (id: number) => picked.push(id);
		const r = mount(FastHostKeyedList, { items: [], selected: null, onPick });

		r.update(FastHostKeyedList, { items, selected: 5, onPick });
		const rows = r.findAll('.fast-host-row');
		expect(rows.map((row) => row.textContent)).toEqual(items.map((row) => row.label));
		expect(rows.every((row) => row.isConnected)).toBe(true);
		expect(r.find('#fast-host-keyed-list').firstElementChild?.className).toBe('fast-host-before');
		expect(r.find('#fast-host-keyed-list').lastElementChild?.className).toBe('fast-host-after');
		expect(r.find('.fast-host-row.selected').textContent).toBe('row 5');

		r.click('[data-fast-host-id="5"]');
		expect(picked).toEqual([5]);
		r.update(FastHostKeyedList, { items, selected: 20, onPick });
		expect(r.findAll('.fast-host-row')).toEqual(rows);
		expect(r.find('.fast-host-row.selected').textContent).toBe('row 20');

		const changed = items.map((row) => (row.id === 12 ? { ...row, label: 'updated row 12' } : row));
		r.update(FastHostKeyedList, { items: changed, selected: 12, onPick });
		expect(r.find('[data-fast-host-id="12"]').textContent).toBe('updated row 12');
		expect(r.findAll('.fast-host-row')).toEqual(rows);

		const reversed = changed.toReversed();
		r.update(FastHostKeyedList, { items: reversed, selected: 12, onPick });
		expect(r.findAll('.fast-host-row')).toEqual(rows.toReversed());
		r.update(FastHostKeyedList, { items: [], selected: null, onPick });
		expect(r.findAll('.fast-host-row')).toHaveLength(0);
		r.update(FastHostKeyedList, { items, selected: 1, onPick });
		expect(r.findAll('.fast-host-row').map((row) => row.textContent)).toEqual(
			items.map((row) => row.label),
		);
		r.unmount();
	});

	it('keeps mapped JSX rows interactive and reusable after an empty-to-populated update', () => {
		const items = makeRows();
		const picked: number[] = [];
		const onPick = (id: number) => picked.push(id);
		const r = mount(FastHostMappedList, { items: [], selected: null, onPick });

		r.update(FastHostMappedList, { items, selected: 6, onPick });
		const rows = r.findAll('.fast-host-mapped-row');
		expect(rows.map((row) => row.textContent)).toEqual(items.map((row) => row.label));
		expect(rows.every((row) => row.isConnected)).toBe(true);
		expect(r.find('.fast-host-mapped-row.selected').textContent).toBe('row 6');
		r.click('[data-fast-host-id="6"]');
		expect(picked).toEqual([6]);

		r.update(FastHostMappedList, { items: items.toReversed(), selected: 20, onPick });
		expect(r.findAll('.fast-host-mapped-row')).toEqual(rows.toReversed());
		expect(r.find('.fast-host-mapped-row.selected').textContent).toBe('row 20');
		r.unmount();
	});

	it('handles small lists and initially populated lists without changing their behavior', () => {
		const onPick = () => {};
		const small = makeRows(15);
		const large = makeRows();
		const r = mount(FastHostKeyedList, { items: [], selected: null, onPick });

		r.update(FastHostKeyedList, { items: small, selected: 15, onPick });
		expect(r.findAll('.fast-host-row')).toHaveLength(15);
		expect(r.find('.fast-host-row.selected').textContent).toBe('row 15');
		r.update(FastHostKeyedList, { items: [], selected: null, onPick });
		r.update(FastHostKeyedList, { items: makeRows(16), selected: 16, onPick });
		expect(r.findAll('.fast-host-row')).toHaveLength(16);
		expect(r.find('.fast-host-row.selected').textContent).toBe('row 16');
		r.unmount();

		const initiallyPopulated = mount(FastHostKeyedList, {
			items: large,
			selected: 24,
			onPick,
		});
		expect(initiallyPopulated.findAll('.fast-host-row')).toHaveLength(24);
		expect(initiallyPopulated.find('.fast-host-row.selected').textContent).toBe('row 24');
		initiallyPopulated.unmount();
	});

	it('retains the ordinary first-fill behavior when sibling rows share a key', () => {
		const items = makeRows();
		items[12] = { id: items[3]!.id, label: 'same key' };
		const onPick = () => {};
		const r = mount(FastHostKeyedList, { items: [], selected: null, onPick });

		r.update(FastHostKeyedList, { items, selected: null, onPick });
		expect(r.findAll('.fast-host-row').map((row) => row.textContent)).toEqual(
			items.map((row) => row.label),
		);
		r.update(FastHostKeyedList, { items: [], selected: null, onPick });
		expect(r.findAll('.fast-host-row')).toHaveLength(0);
		r.unmount();

		const mapped = mount(FastHostMappedList, { items: [], selected: null, onPick });
		mapped.update(FastHostMappedList, { items, selected: null, onPick });
		expect(mapped.findAll('.fast-host-mapped-row').map((row) => row.textContent)).toEqual(
			items.map((row) => row.label),
		);
		mapped.update(FastHostMappedList, { items: [], selected: null, onPick });
		expect(mapped.findAll('.fast-host-mapped-row')).toHaveLength(0);
		mapped.unmount();
	});

	it('connects custom-element descendants in their ordinary row-by-row order', () => {
		const observed: number[] = [];
		class FastHostRowElement extends HTMLDivElement {
			connectedCallback() {
				observed.push(
					this.ownerDocument.querySelectorAll('#fast-host-custom-list [is="octane-fast-host-row"]')
						.length,
				);
			}
		}
		customElements.define('octane-fast-host-row', FastHostRowElement, { extends: 'div' });
		const items = makeRows();
		const r = mount(FastHostCustomList, { items: [] });

		r.update(FastHostCustomList, { items });
		expect(observed).toEqual(items.map((_, index) => index + 1));
		expect(r.findAll('.fast-host-custom-row').map((row) => row.textContent)).toEqual(
			items.map((row) => row.label),
		);
		r.unmount();
	});

	it('attaches row refs only after their elements are connected and releases them on unmount', () => {
		const connected: boolean[] = [];
		let detached = 0;
		const onRef = (element: HTMLLIElement | null) => {
			if (element === null) detached++;
			else connected.push(element.isConnected);
		};
		const items = makeRows();
		const r = mount(FastHostRefList, { items: [], onRef });

		r.update(FastHostRefList, { items, onRef });
		expect(r.findAll('.fast-host-ref-row')).toHaveLength(items.length);
		expect(connected).toEqual(items.map(() => true));
		r.unmount();
		expect(detached).toBe(items.length);
	});

	it('preserves controlled input values, focus, and survivor identity', () => {
		const items = makeRows();
		const r = mount(FastHostControlledList, { items: [] });
		r.update(FastHostControlledList, { items });
		const controls = r.findAll('.fast-host-controlled-row') as HTMLInputElement[];
		controls[0]!.focus();
		expect(document.activeElement).toBe(controls[0]);
		expect(controls.map((control) => control.value)).toEqual(items.map((row) => row.label));

		const changed = items.map((row) => (row.id === 2 ? { ...row, label: 'updated' } : row));
		r.update(FastHostControlledList, { items: changed });
		expect(r.findAll('.fast-host-controlled-row')).toEqual(controls);
		expect(controls[1]!.value).toBe('updated');
		expect(document.activeElement).toBe(controls[0]);
		r.unmount();
	});

	it('keeps render-time row methods able to observe previously connected rows', () => {
		const items = makeRows().map((row) => ({
			id: row.id,
			read: () =>
				String(
					document.querySelectorAll('#fast-host-render-call-list .fast-host-render-call-row')
						.length,
				),
		}));
		const r = mount(FastHostRenderCallList, { items: [] });
		r.update(FastHostRenderCallList, { items });
		expect(r.findAll('.fast-host-render-call-row').map((row) => row.textContent)).toEqual(
			items.map((_, index) => String(index)),
		);
		r.unmount();
	});

	it('evaluates implicit row getters in their represented context scope', () => {
		const items = makeRows().map(({ id }) => ({
			id,
			get label() {
				return `${use(FastRowContext)} ${id}`;
			},
		}));
		const r = mount(FastContextGetterList, { items: [], value: 'inside' });

		r.update(FastContextGetterList, { items, value: 'inside' });
		expect(r.findAll('.fast-context-getter-row').map((row) => row.textContent)).toEqual(
			items.map(({ id }) => `inside ${id}`),
		);
		r.unmount();
	});

	it('renders dynamic mapped component values after each row connects', () => {
		const renderRows: number[] = [];
		const renderValues: string[] = [];
		const attached: boolean[] = [];
		const onRender = (connectedRows: number, value: string) => {
			renderRows.push(connectedRows);
			renderValues.push(value);
		};
		const onRef = (element: HTMLSpanElement | null) => {
			if (element !== null) attached.push(element.isConnected);
		};
		const items = makeRows().map(({ id }) => ({
			id,
			content: createElement(FastRenderableProbe, { onRender, onRef }),
		}));
		const r = mount(FastMappedRenderableList, { items: [], value: 'inside' });

		r.update(FastMappedRenderableList, { items, value: 'inside' });
		expect(renderRows).toEqual(items.map((_, index) => index + 1));
		expect(renderValues).toEqual(items.map(() => 'inside'));
		expect(attached).toEqual(items.map(() => true));
		expect(r.findAll('.fast-renderable-row').map((row) => row.textContent)).toEqual(
			items.map(() => 'inside'),
		);
		r.unmount();
	});

	it('disposes a throwing dynamic child together with every completed row', () => {
		let shouldThrow = true;
		const attached: boolean[] = [];
		const onRender = (connectedRows: number) => {
			if (connectedRows === 12 && shouldThrow) throw new Error('child failed');
		};
		const onRef = (element: HTMLSpanElement | null) => {
			if (element !== null) attached.push(element.isConnected);
		};
		const items = makeRows().map(({ id }) => ({
			id,
			content: createElement(FastRenderableProbe, { onRender, onRef }),
		}));
		const r = mount(FastMappedBoundaryList, { items: [], value: 'inside' });

		r.update(FastMappedBoundaryList, { items, value: 'inside' });
		expect(r.findAll('.fast-renderable-row')).toHaveLength(0);
		expect(r.find('#fast-mapped-renderable-retry').textContent).toBe('child failed');
		expect(attached).toEqual([]);

		shouldThrow = false;
		r.click('#fast-mapped-renderable-retry');
		expect(r.findAll('.fast-renderable-row')).toHaveLength(items.length);
		expect(attached).toEqual(items.map(() => true));
		r.unmount();
	});

	it('rolls back an implicit getter suspension and remounts cleanly on resolution', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const items = makeRows().map(({ id, label }) => ({
			id,
			get label() {
				return id === 12 ? use(promise) : label;
			},
		}));
		const r = mount(FastSuspendingGetterList, { items: [] });

		r.update(FastSuspendingGetterList, { items });
		expect(r.findAll('.fast-suspending-getter-row')).toHaveLength(0);
		expect(r.find('#fast-suspending-getter-pending').textContent).toBe('loading');

		await act(() => resolve('resolved row 12'));
		expect(r.findAll('.fast-suspending-getter-row')).toHaveLength(items.length);
		expect(r.findAll('.fast-suspending-getter-row')[11]!.textContent).toBe('resolved row 12');
		r.unmount();
	});

	it('disposes every completed row when an implicit getter throws, then retries', () => {
		let shouldThrow = true;
		const items = makeRows().map(({ id, label }) => ({
			id,
			get label() {
				if (id === 12 && shouldThrow) throw new Error('row failed');
				return label;
			},
		}));
		const r = mount(FastSuspendingGetterList, { items: [] });

		r.update(FastSuspendingGetterList, { items });
		expect(r.findAll('.fast-suspending-getter-row')).toHaveLength(0);
		expect(r.find('#fast-suspending-getter-retry').textContent).toBe('row failed');

		shouldThrow = false;
		r.click('#fast-suspending-getter-retry');
		expect(r.findAll('.fast-suspending-getter-row').map((row) => row.textContent)).toEqual(
			makeRows().map((row) => row.label),
		);
		r.unmount();
	});

	it('unwinds completed rows when a key getter throws and evaluates each key only once', () => {
		let shouldThrow = true;
		const reads: number[] = [];
		const items = makeRows().map(({ id, label }) => ({
			get id() {
				reads.push(id);
				if (id === 12 && shouldThrow) throw new Error('key failed');
				return id;
			},
			label,
		}));
		const r = mount(FastSuspendingGetterList, { items: [] });

		r.update(FastSuspendingGetterList, { items });
		expect(reads).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
		expect(r.findAll('.fast-suspending-getter-row')).toHaveLength(0);
		expect(r.find('#fast-suspending-getter-retry').textContent).toBe('key failed');

		shouldThrow = false;
		reads.length = 0;
		r.click('#fast-suspending-getter-retry');
		expect(reads).toEqual(Array.from({ length: items.length }, (_, index) => index + 1));
		expect(r.findAll('.fast-suspending-getter-row')).toHaveLength(items.length);
		r.unmount();
	});

	it('adopts a populated server list without replacing its original rows or losing events', () => {
		const items = makeRows();
		const picked: number[] = [];
		const onPick = (id: number) => picked.push(id);
		const props = { items, selected: 8, onPick };
		const server = loadServerFixture('packages/octane/tests/_fixtures/for.tsrx', {
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.FastHostKeyedList, props).html;
		const originalRows = Array.from(container.querySelectorAll('.fast-host-row'));
		const root = hydrateRoot(container, FastHostKeyedList, props);
		flushSync(() => {});

		expect(Array.from(container.querySelectorAll('.fast-host-row'))).toEqual(originalRows);
		expect(container.querySelector('.fast-host-row.selected')?.textContent).toBe('row 8');
		flushSync(() => (container.querySelector('[data-fast-host-id="8"]') as HTMLElement).click());
		expect(picked).toEqual([8]);
		flushSync(() => root.render(FastHostKeyedList, { ...props, selected: 12 }));
		expect(Array.from(container.querySelectorAll('.fast-host-row'))).toEqual(originalRows);
		expect(container.querySelector('.fast-host-row.selected')?.textContent).toBe('row 12');
		root.unmount();
		container.remove();
	});

	it('rolls back a suspended transition fill and restores the full list when it retries', async () => {
		const items = makeRows();
		const initialPromise = Promise.resolve('initial');
		let resolveNext!: (value: string) => void;
		const nextPromise = new Promise<string>((resolve) => {
			resolveNext = resolve;
		});
		await Promise.resolve();
		const r = mount(FastHostTransitionList, { items, initialPromise, nextPromise });
		await act(() => {});
		expect(r.findAll('.fast-host-transition-row')).toHaveLength(0);
		expect(r.find('#fast-host-transition-value').textContent).toBe('initial');

		r.click('#fast-host-transition-fill');
		expect(r.findAll('.fast-host-transition-row')).toHaveLength(0);
		expect(r.find('#fast-host-transition-value').textContent).toBe('initial');
		expect(r.findAll('#fast-host-transition-fallback')).toHaveLength(0);

		await act(() => resolveNext('resolved'));
		expect(r.findAll('.fast-host-transition-row').map((row) => row.textContent)).toEqual(
			items.map((row) => row.label),
		);
		expect(r.find('#fast-host-transition-value').textContent).toBe('resolved');
		r.unmount();
	});
});

describe('nested keyed list reordering', () => {
	const makeGroups = (length = 11) =>
		Array.from({ length }, (_, groupIndex) => {
			const id = groupIndex + 1;
			return {
				id,
				label: `group ${id}`,
				rows: Array.from({ length: 17 + (groupIndex % 5) }, (_, rowIndex) => ({
					id: id * 100 + rowIndex + 1,
					label: `row ${id}:${rowIndex + 1}`,
				})),
			};
		});

	const reorderGroups = (groups: ReturnType<typeof makeGroups>, prefix = 'updated') =>
		groups.toReversed().map((group) => ({
			...group,
			label: `${prefix} group ${group.id}`,
			rows: group.rows.toReversed().map((row) => ({
				...row,
				label: `${prefix} row ${row.id}`,
			})),
		}));

	const expectGroups = (r: ReturnType<typeof mount>, groups: ReturnType<typeof makeGroups>) => {
		const renderedGroups = r.findAll('.nested-reorder-group');
		expect(renderedGroups.map((group) => Number(group.getAttribute('data-reorder-group')))).toEqual(
			groups.map((group) => group.id),
		);
		for (let index = 0; index < groups.length; index++) {
			const group = groups[index]!;
			const renderedGroup = renderedGroups[index]!;
			expect(renderedGroup.querySelector('h3')?.textContent).toBe(group.label);
			const rows = Array.from(renderedGroup.querySelectorAll('.nested-reorder-row'));
			expect(rows.map((row) => Number(row.getAttribute('data-reorder-row')))).toEqual(
				group.rows.map((row) => row.id),
			);
			expect(rows.map((row) => row.textContent)).toEqual(group.rows.map((row) => row.label));
		}
	};

	it('keeps every group and row alive when both nesting levels reorder together', () => {
		const warmRows = Array.from({ length: 29 }, (_, index) => ({
			id: index + 1,
			label: `warm row ${index + 1}`,
		}));
		const warm = mount(List, { items: warmRows });
		warm.update(List, { items: warmRows.toReversed() });
		warm.unmount();

		const groups = makeGroups();
		const picked: Array<[number, number]> = [];
		const onPick = (groupId: number, rowId: number) => picked.push([groupId, rowId]);
		const r = mount(NestedKeyedReorderList, { groups, onPick });
		const groupNodes = new Map(
			r
				.findAll('.nested-reorder-group')
				.map((group) => [Number(group.getAttribute('data-reorder-group')), group]),
		);
		const rowNodes = new Map(
			r
				.findAll('.nested-reorder-row')
				.map((row) => [Number(row.getAttribute('data-reorder-row')), row]),
		);
		const preservedButton = r.find('[data-reorder-row="112"] button') as HTMLButtonElement;
		preservedButton.focus();
		expect(document.activeElement).toBe(preservedButton);

		const reversed = groups.toReversed().map((group, groupIndex) => {
			const split = 2 + (groupIndex % 5);
			const rows = [...group.rows.slice(split), ...group.rows.slice(0, split)];
			return {
				...group,
				label: `updated group ${group.id}`,
				rows: rows.map((row) => ({ ...row, label: `updated row ${row.id}` })),
			};
		});
		r.update(NestedKeyedReorderList, { groups: reversed, onPick });
		expectGroups(r, reversed);
		for (const group of reversed) {
			expect(r.find(`[data-reorder-group="${group.id}"]`)).toBe(groupNodes.get(group.id));
			for (const row of group.rows) {
				expect(r.find(`[data-reorder-row="${row.id}"]`)).toBe(rowNodes.get(row.id));
			}
		}
		expect(r.find('[data-reorder-row="112"] button')).toBe(preservedButton);
		preservedButton.focus();
		expect(document.activeElement).toBe(preservedButton);
		r.click('[data-reorder-row="112"] button');
		expect(picked).toEqual([[1, 112]]);

		const shortened = reversed
			.slice(0, 8)
			.toReversed()
			.map((group) => ({
				...group,
				label: `short group ${group.id}`,
				rows: group.rows
					.slice(0, 13)
					.toReversed()
					.map((row) => ({ ...row, label: `short row ${row.id}` })),
			}));
		r.update(NestedKeyedReorderList, { groups: shortened, onPick });
		expectGroups(r, shortened);
		for (const group of shortened) {
			expect(r.find(`[data-reorder-group="${group.id}"]`)).toBe(groupNodes.get(group.id));
			for (const row of group.rows) {
				expect(r.find(`[data-reorder-row="${row.id}"]`)).toBe(rowNodes.get(row.id));
			}
		}
		r.unmount();
	});

	it('adopts server-rendered nested rows and preserves their identity during both reorders', () => {
		const groups = makeGroups(8);
		const picked: Array<[number, number]> = [];
		const onPick = (groupId: number, rowId: number) => picked.push([groupId, rowId]);
		const props = { groups, onPick };
		const server = loadServerFixture('packages/octane/tests/_fixtures/for.tsrx', {
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = ServerRuntime.renderToString(server.NestedKeyedReorderList, props).html;
		const groupNodes = new Map(
			Array.from(container.querySelectorAll('.nested-reorder-group')).map((group) => [
				Number(group.getAttribute('data-reorder-group')),
				group,
			]),
		);
		const rowNodes = new Map(
			Array.from(container.querySelectorAll('.nested-reorder-row')).map((row) => [
				Number(row.getAttribute('data-reorder-row')),
				row,
			]),
		);
		const root = hydrateRoot(container, NestedKeyedReorderList, props);
		flushSync(() => {});
		expect(Array.from(container.querySelectorAll('.nested-reorder-group'))).toEqual([
			...groupNodes.values(),
		]);

		const reordered = reorderGroups(groups, 'hydrated');
		flushSync(() => root.render(NestedKeyedReorderList, { groups: reordered, onPick }));
		expect(
			Array.from(container.querySelectorAll('.nested-reorder-group')).map((group) =>
				Number(group.getAttribute('data-reorder-group')),
			),
		).toEqual(reordered.map((group) => group.id));
		for (const group of reordered) {
			expect(container.querySelector(`[data-reorder-group="${group.id}"]`)).toBe(
				groupNodes.get(group.id),
			);
			for (const row of group.rows) {
				expect(container.querySelector(`[data-reorder-row="${row.id}"]`)).toBe(
					rowNodes.get(row.id),
				);
			}
		}
		flushSync(() =>
			(container.querySelector('[data-reorder-row="112"] button') as HTMLButtonElement).click(),
		);
		expect(picked).toEqual([[1, 112]]);
		root.unmount();
		container.remove();
	});

	it('recovers when a nested survivor throws during simultaneous parent and child reorders', () => {
		const groups = makeGroups();
		const onPick = () => {};
		const r = mount(NestedKeyedReorderBoundary, { groups, onPick });
		let shouldThrow = true;
		const reordered = reorderGroups(groups).map((group) => ({
			...group,
			rows: group.rows.map((row) =>
				row.id === 112
					? {
							id: row.id,
							get label() {
								if (shouldThrow) throw new Error('nested row failed');
								return 'recovered nested row';
							},
						}
					: row,
			),
		}));

		r.update(NestedKeyedReorderBoundary, { groups: reordered, onPick });
		expect(r.findAll('.nested-reorder-row')).toHaveLength(0);
		expect(r.find('#nested-reorder-retry').textContent).toBe('nested row failed');

		shouldThrow = false;
		r.click('#nested-reorder-retry');
		expectGroups(r, reordered);
		expect(r.find('[data-reorder-row="112"]').textContent).toBe('recovered nested row');
		const resized = reorderGroups(reordered.slice(0, 7), 'after retry');
		r.update(NestedKeyedReorderBoundary, { groups: resized, onPick });
		expectGroups(r, resized);
		r.unmount();
	});

	it('retries a nested survivor suspension and then reorders a differently sized list', async () => {
		const groups = makeGroups();
		const onPick = () => {};
		const r = mount(NestedKeyedReorderBoundary, { groups, onPick });
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => {
			resolve = done;
		});
		const reordered = reorderGroups(groups).map((group) => ({
			...group,
			rows: group.rows.map((row) =>
				row.id === 112
					? {
							id: row.id,
							get label() {
								return use(promise);
							},
						}
					: row,
			),
		}));

		r.update(NestedKeyedReorderBoundary, { groups: reordered, onPick });
		expect(r.find('#nested-reorder-pending').textContent).toBe('loading');

		await act(() => resolve('row 1:12'));
		const resolved = reordered.map((group) => ({
			...group,
			rows: group.rows.map((row) => ({
				id: row.id,
				label: row.id === 112 ? 'row 1:12' : row.label,
			})),
		}));
		expectGroups(r, resolved);
		const resized = reorderGroups(resolved.slice(0, 7), 'after resolution');
		r.update(NestedKeyedReorderBoundary, { groups: resized, onPick });
		expectGroups(r, resized);
		r.unmount();
	});

	it('preserves committed nested rows through a suspended transition and a later urgent reorder', async () => {
		const groups = makeGroups();
		const nextGroups = groups.toReversed().map((group) => ({
			...group,
			rows: group.rows.toReversed().map((row) => ({ ...row })),
		}));
		const picked: Array<[number, number]> = [];
		const onPick = (groupId: number, rowId: number) => picked.push([groupId, rowId]);
		const initialPromise = Promise.resolve('initial');
		let resolveNext!: (value: string) => void;
		const nextPromise = new Promise<string>((resolve) => {
			resolveNext = resolve;
		});
		await Promise.resolve();
		const r = mount(NestedKeyedReorderTransition, {
			initialGroups: groups,
			nextGroups,
			initialPromise,
			nextPromise,
			onPick,
		});
		await act(() => {});
		const originalGroups = r.findAll('.nested-reorder-group');
		const originalRows = new Map(
			r
				.findAll('.nested-reorder-row')
				.map((row) => [Number(row.getAttribute('data-reorder-row')), row]),
		);
		expect(r.find('#nested-reorder-transition-value').textContent).toBe('initial');

		r.click('#nested-reorder-transition-start');
		expect(r.findAll('.nested-reorder-group')).toEqual(originalGroups);
		expect(r.find('#nested-reorder-transition-value').textContent).toBe('initial');
		expect(r.findAll('#nested-reorder-transition-pending')).toHaveLength(0);

		await act(() => resolveNext('resolved'));
		expect(r.find('#nested-reorder-transition-value').textContent).toBe('resolved');
		r.click('#nested-reorder-transition-urgent');
		expectGroups(r, nextGroups);
		for (const group of nextGroups) {
			for (const row of group.rows) {
				expect(r.find(`[data-reorder-row="${row.id}"]`)).toBe(originalRows.get(row.id));
			}
		}
		r.click('[data-reorder-row="112"] button');
		expect(picked).toEqual([[1, 112]]);
		r.unmount();
	});
});

describe.each([
	['@for', HostBindingList],
	['native map', HostMappedBindingList],
] as const)('host-row bindings — %s', (_kind, Body) => {
	function loggedRow(label: string, log: string[], beforeTitleCoercion = () => {}) {
		const className = ['row', label];
		const title = {
			toString() {
				log.push('coerce-title');
				beforeTitleCoercion();
				return label;
			},
		};
		const data = {
			toString() {
				log.push('coerce-data');
				return label;
			},
		};
		return {
			id: 1,
			get className() {
				log.push('class');
				return className;
			},
			get title() {
				log.push('title');
				return title as unknown as string;
			},
			get data() {
				log.push('data');
				return data as unknown as string;
			},
			get aria() {
				log.push('aria');
				return label;
			},
			get hidden() {
				log.push('hidden');
				return label === 'second';
			},
			get only() {
				log.push('only');
				return label;
			},
			get mixed() {
				log.push('mixed');
				return label;
			},
		};
	}
	const readAndCoerce = [
		'class',
		'title',
		'coerce-title',
		'data',
		'coerce-data',
		'aria',
		'hidden',
		'only',
		'mixed',
	];

	it('evaluates bindings once in order and skips coercing unchanged scalar values', () => {
		const log: string[] = [];
		const r = mount(Body, { items: [loggedRow('first', log)], version: 0, context: 'inside' });
		try {
			const host = r.find('li');
			expect(log.splice(0)).toEqual(readAndCoerce);
			const second = loggedRow('second', log);
			r.update(Body, { items: [second], version: 1, context: 'inside' });
			expect(log.splice(0)).toEqual(readAndCoerce);
			expect(r.find('li')).toBe(host);
			expect(host.className).toBe('row second');
			expect(host.getAttribute('title')).toBe('second');
			expect(host.getAttribute('data-value')).toBe('second');
			expect(host.getAttribute('aria-label')).toBe('second');
			expect(host.hasAttribute('hidden')).toBe(true);
			expect(r.find('[data-kind="only"]').textContent).toBe('second');
			expect(r.find('[data-kind="mixed"]').textContent).toBe('beforesecondafter');
			r.update(Body, { items: [second], version: 2, context: 'inside' });
			expect(log).toEqual(['class', 'title', 'data', 'aria', 'hidden', 'only', 'mixed']);
		} finally {
			r.unmount();
		}
	});

	it('retries the same scalar value after coercion throws without reading later bindings', () => {
		const log: string[] = [];
		const r = mount(Body, { items: [loggedRow('first', log)], version: 0, context: 'inside' });
		try {
			log.length = 0;
			let shouldThrow = true;
			const second = loggedRow('second', log, () => {
				if (shouldThrow) throw new Error('title coercion failed');
			});
			expect(() => r.update(Body, { items: [second], version: 1, context: 'inside' })).toThrow(
				'title coercion failed',
			);
			expect(log.splice(0)).toEqual(['class', 'title', 'coerce-title']);
			shouldThrow = false;
			r.update(Body, { items: [second], version: 2, context: 'inside' });
			expect(log).toEqual(readAndCoerce);
			expect(r.find('li').getAttribute('title')).toBe('second');
			expect(r.find('li').getAttribute('data-value')).toBe('second');
			expect(r.find('[data-kind="only"]').textContent).toBe('second');
		} finally {
			r.unmount();
		}
	});

	it('preserves only-child and mixed-child ownership across primitive and complex updates', () => {
		const row = { id: 1, className: 'row', title: '', data: '', aria: '', hidden: false };
		const r = mount(Body, {
			items: [{ ...row, only: 'first', mixed: 'first' }],
			version: 0,
			context: 'initial',
		});
		try {
			const host = r.find('li');
			const only = r.find('[data-kind="only"]');
			const mixed = r.find('[data-kind="mixed"]');
			const onlyText = only.firstChild;
			const mixedText = Array.from(mixed.childNodes).find(
				(node) => node.nodeType === Node.TEXT_NODE && node.textContent === 'first',
			);
			let version = 0;
			const update = (content: OctaneNode, text: string, context = 'inside') => {
				r.update(Body, {
					items: [{ ...row, only: content, mixed: content }],
					version: ++version,
					context,
				});
				expect(r.find('li')).toBe(host);
				expect(r.find('[data-kind="only"]')).toBe(only);
				expect(r.find('[data-kind="mixed"]')).toBe(mixed);
				expect(only.textContent).toBe(text);
				expect(mixed.textContent).toBe(`before${text}after`);
			};
			update('second', 'second');
			expect(only.firstChild).toBe(onlyText);
			expect(Array.from(mixed.childNodes)).toContain(mixedText);
			for (const value of [0, -0, false, true, null, undefined, '', NaN]) {
				update(value, typeof value === 'number' ? String(value) : '');
			}
			const clicks: string[] = [];
			let label = 'function first';
			const render = () => createElement('button', { onClick: () => clicks.push(label) }, label);
			update(render, label);
			const buttons = r.findAll('button');
			label = 'function second';
			update(render, label);
			expect(r.findAll('button')).toEqual(buttons);
			r.click('[data-kind="only"] button');
			expect(clicks).toEqual(['function second']);
			function CurrentContext() {
				return createElement('b', null, use(FastRowContext));
			}
			const descriptor = createElement(CurrentContext, {});
			update(descriptor, 'context first', 'context first');
			expect(buttons.every((button) => !button.isConnected)).toBe(true);
			const consumers = r.findAll('b');
			update(descriptor, 'context second', 'context second');
			expect(r.findAll('b')).toEqual(consumers);
			update([createElement('u', null, 'array'), ' tail'], 'array tail');
			expect(consumers.every((consumer) => !consumer.isConnected)).toBe(true);
			update('final', 'final');
			expect(r.findAll('button, b, u')).toHaveLength(0);
		} finally {
			r.unmount();
		}
	});
});

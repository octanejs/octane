import { describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { prerender } from 'octane/static';
import { compile } from '../src/compiler/compile.js';
import { createContext, createElement, flushSync, hydrateRoot, use } from '../src/index.js';
import { act, flushEffects, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { AutoMemoApp } from './_fixtures/auto-memo.tsrx';
import { CompilerNameCollisionApp } from './_fixtures/auto-memo-name-collisions.tsrx';
import { ParentCaptureApp } from './_fixtures/auto-memo-parent-capture.tsrx';
import { EffectImportRow } from './_fixtures/auto-memo-effect-row.tsrx';
import { setEffectRowImports } from './_fixtures/auto-memo-effect-imports';
import { AutoMemoCycleA } from './_fixtures/auto-memo-cycle-a.tsrx';
import { setAutoMemoCycleValue } from './_fixtures/auto-memo-cycle-b.tsrx';
import {
	TsxAutoMemoApp,
	TsxBoundMapApp,
	TsxCustomMapApp,
	TsxGetterMapApp,
	TsxImpureRowsApp,
	TsxMappedComponentApp,
	TsxMapExtraArgumentApp,
	TsxStatefulMappedApp,
} from './_fixtures/tsx-auto-memo.tsx';

function loadEffectRowParent(Row: any, mode: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(
		`import { Row } from './row';
		 export function App(props) @{
			const items = props.items;
			const onEffect = props.onEffect;
			<section data-tick={props.tick}>
				<ul>@for (const item of items; key item.id) {
					<Row item={item} onEffect={onEffect} />
				}</ul>
			</section>
		 }`,
		{
			id: 'effectful-parent.tsrx',
			mode,
			compileOptions: { hmr: false, dev: false },
			runtimeModules: { './row': { Row } },
		},
	);
}

const EFFECT_ROW_SOURCE = `
	import { useEffect, useLayoutEffect, useRef } from 'octane';
	export function Row(props) @{
		const cell = useRef(null);
		useEffect(() => {
			props.onEffect('effect:' + props.item.label);
			return () => props.onEffect('cleanup:' + props.item.label);
		}, [props.item.label]);
		useLayoutEffect(() => {
			props.onEffect('layout:' + cell.current.textContent);
		}, [props.item.label]);
		<li><span ref={cell}>{props.item.label as string}</span></li>
	}
`;

function loadEffectRow(source = EFFECT_ROW_SOURCE, mode: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(source, {
		id: 'effectful-row.tsrx',
		mode,
		compileOptions: { hmr: false, dev: false },
	});
}

// Middle's caches over the hookless Leaf and Badge hit on every tick while
// Counter, their hookful sibling, re-renders. Badge's root can render nothing,
// so its lite slot keeps an anchor. Frame is hookless too, but it renders a
// memo wall that may read context, so its cache must keep refreshing that
// reader.
const LITE_CALLEE_REGION_SOURCE = `
	import { createContext, memo, useContext, useState } from 'octane';

	const Theme = createContext('light');

	function Counter(props) @{
		const [own, setOwn] = useState(0);
		<button id="lite-region-counter" onClick={() => setOwn(own + 1)}>
			{props.label + ':' + own}
		</button>
	}

	function Leaf(props) @{
		<span id="lite-region-leaf">{props.label as string}</span>
	}

	function Badge(props) @{
		@if (props.on) {
			<b id="lite-region-badge">{'on'}</b>
		}
	}

	function Middle(props) @{
		<div id="lite-region-middle">
			<Leaf label={props.label} />
			<Badge on={props.on} />
			<Counter label={props.label + '/' + props.tick} />
		</div>
	}

	const Themed = memo(function Themed() @{
		const theme = useContext(Theme);
		<em id="lite-region-themed">{theme as string}</em>
	});

	function Frame(props) @{
		<p id="lite-region-frame" title={props.label}><Themed /></p>
	}

	function Shell(props) @{
		<section id="lite-region">
			<Middle label={props.label} tick={props.tick} on={props.on} />
			<Frame label={props.label} />
		</section>
	}

	export function App(props) @{
		<Theme value={props.theme}>
			<Shell label={props.label} tick={props.tick} on={props.on} />
		</Theme>
	}
`;

function trailingVersion(text: string | null): number {
	return Number(text?.match(/(\d+)$/)?.[1]);
}

function expectCompilerRegion(code: string): void {
	expect(code).toMatch(/__s\.slots\[\d+\] === undefined \|\| __memoCache/);
	// Dependencies are snapshotted into temporaries once per render; the guard
	// compares and publishes those exact values.
	expect(code).toMatch(/const __memoDep[\w$]* = \(?[^;]+\)?;/);
	expect(code).toMatch(/!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)/);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* === __memoCommitted[\w$]*\) __memoCache[\w$]* = __memoCache[\w$]*\.slice\(\);/,
	);
}

function expectNoCompilerRegion(code: string): void {
	expect(code).not.toContain('__memoCommitted');
	expect(code).not.toContain('compilerCacheContext');
}

function loadMappedHydrationComponents(load = loadCompiledFixtureSource) {
	const source = `
		function AppImpl(props) {
			const rows = props.rows;
			return (
				<ul id="tsx-custom-map-hydration">
					{rows.map((item, index) => (
						<li key={item.id} data-callback={props.onItem(item.id, index)}>
							{props.prefix + ':' + index + ':' + item.label}
						</li>
					))}
				</ul>
			);
		}
		export const App = AppImpl;
	`;
	const id = 'tsx-custom-map-hydration.tsx';
	return {
		server: load(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		}),
		client: load(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		}),
	};
}

// Evaluate fresh client and server runtimes, so the next mapped render is the
// first one either runtime sees. The fixture loader is already loaded by this
// file's static import, so the re-import comes from the worker's module cache.
async function loadFreshMappedRuntimes() {
	vi.resetModules();
	const fixtures = await import('./_server-fixture.js');
	return {
		...loadMappedHydrationComponents(fixtures.loadCompiledFixtureSource),
		ClientRuntime: await import('../src/index.js'),
		ServerRuntime: await import('octane/server'),
	};
}

function mappedRowTexts(html: string): Array<string | null> {
	const container = document.createElement('div');
	container.innerHTML = html;
	return Array.from(container.querySelectorAll('li'), (row) => row.textContent);
}

function loadMappedComponentHydrationComponents() {
	const source = `
		import { createContext, useContext, useState } from 'octane';

		const Theme = createContext('default');

		function Row(props) {
			const theme = useContext(Theme);
			const [own, setOwn] = useState(0);
			return (
				<li data-id={props.id}>
					<button className={'hydrated-own-' + props.id} onClick={() => setOwn(own + 1)}>
						{theme + ':' + props.label + ':' + own}
					</button>
				</li>
			);
		}

		function Rows(props) {
			const rows = props.rows;
			return (
				<ul id="tsx-mapped-component-hydration">
					{rows.map((item, index) => (
						<Row
							key={item.id}
							id={item.id}
							label={props.prefix + ':' + props.onItem(item.id, index) + ':' + item.label}
						/>
					))}
				</ul>
			);
		}

		export function App(props) {
			return <Theme value={props.theme}><Rows {...props} /></Theme>;
		}
	`;
	const id = 'tsx-mapped-component-hydration.tsx';
	return {
		server: loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		}),
		client: loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		}),
	};
}

function loadReturnedProviderComponentMapFixture() {
	const source = `
		import { createContext, memo, useState } from 'octane';

		const Theme = createContext(null);

		function RowImpl(props) {
			return <span className="returned-provider-map-row">{props.label}</span>;
		}
		const Row = memo(RowImpl);

		function Rows(props) {
			return (
				<div id="returned-provider-map-rows">
					{props.items.map((item) => <Row key={item.id} label={item.label} />)}
				</div>
			);
		}

		export function App(props) {
			const [tick, setTick] = useState(0);
			const items = props.items;
			return (
				<section>
					<button id="returned-provider-map-update" onClick={() => setTick(tick + 1)}>
						{tick}
					</button>
					<Theme value={null}>
						<Rows items={items} />
					</Theme>
				</section>
			);
		}
	`;
	return loadCompiledFixtureSource(source, {
		id: 'returned-provider-component-map.tsx',
		mode: 'client',
		compileOptions: { hmr: false, dev: false },
	});
}

const STATE_FILTER_SOURCE = `
	import { useState } from 'octane';

	export function App(props) @{
		const [todos, setTodos] = useState([]);
		const [filter, setFilter] = useState('all');
		const [editing, setEditing] = useState(false);
		const visible = filter === 'active'
			? todos.filter((todo) => !todo.completed)
			: filter === 'completed'
				? todos.filter((todo) => todo.completed)
				: todos;
		const remaining = todos.filter((todo) => !todo.completed).length;

		<section id="state-filter-app" data-editing={editing ? 'yes' : 'no'}>
			<button
				id="state-filter-load"
				onClick={() => setTodos([
					{ id: 1, label: 'first', completed: false },
					{ id: 2, label: 'second', completed: true },
				])}
			>{'load'}</button>
			<button id="state-filter-edit" onClick={() => setEditing(!editing)}>{'edit'}</button>
			<button
				id="state-filter-replace"
				onClick={() => setTodos((current) => current.map((todo) => todo.id === 1
					? { ...todo, label: 'updated', completed: true }
					: todo))}
			>{'replace'}</button>
			<button
				id="state-filter-add"
				onClick={() => setTodos((current) => [
					...current,
					{ id: 3, label: 'third', completed: false },
				])}
			>{'add'}</button>
			<button
				id="state-filter-all"
				class={{ selected: filter === 'all' }}
				onClick={() => setFilter('all')}
			>{'all'}</button>
			<button
				id="state-filter-active"
				class={{ selected: filter === 'active' }}
				onClick={() => setFilter('active')}
			>{'active'}</button>
			<button
				id="state-filter-completed"
				class={{ selected: filter === 'completed' }}
				onClick={() => setFilter('completed')}
			>{'completed'}</button>
			<input id="state-filter-value" value={props.value} onInput={() => {}} />
			<input
				id="state-filter-toggle-all"
				type="checkbox"
				checked={remaining === 0}
				onClick={() => {}}
			/>
			<output id="state-filter-remaining">{'' + remaining}</output>
			<ul id="state-filter-rows">
				@for (const todo of visible; key todo.id) {
					<li class={{ editing: editing && todo.id === 1 }} data-id={todo.id}>
						<input
							class="state-filter-row-check"
							type="checkbox"
							checked={todo.completed}
							onClick={() => {}}
						/>
						<span>{todo.label as string}</span>
					</li>
				}
			</ul>
		</section>
	}
`;

function loadStateFilterFixture(source = STATE_FILTER_SOURCE, id = 'state-filter-provenance.tsrx') {
	return loadCompiledFixtureSource(source, {
		id,
		mode: 'client',
		compileOptions: { hmr: false, dev: false },
	});
}

describe('state-derived collections and independent host bindings', () => {
	it('keeps filtered state, keyed rows, filter classes, and controlled fields synchronized', () => {
		const client = loadStateFilterFixture();
		const root = mount(client.App, { value: 'locked' });

		try {
			expect(root.find('#state-filter-remaining').textContent).toBe('0');
			root.click('#state-filter-load');
			const first = root.find('#state-filter-rows li');
			const input = root.find('#state-filter-value') as HTMLInputElement;
			const toggleAll = root.find('#state-filter-toggle-all') as HTMLInputElement;
			const firstToggle = root.find('.state-filter-row-check') as HTMLInputElement;
			expect(root.find('#state-filter-remaining').textContent).toBe('1');
			expect(first.textContent).toBe('first');
			expect(input.value).toBe('locked');
			expect(toggleAll.checked).toBe(false);
			expect(firstToggle.checked).toBe(false);

			input.value = 'drifted';
			toggleAll.checked = true;
			firstToggle.checked = true;
			root.click('#state-filter-edit');
			expect(root.find('#state-filter-rows li')).toBe(first);
			expect(root.find('#state-filter-app').getAttribute('data-editing')).toBe('yes');
			expect(input.value).toBe('locked');
			expect(toggleAll.checked).toBe(false);
			expect(firstToggle.checked).toBe(false);
			expect(root.find('#state-filter-all').className).toBe('selected');

			root.click('#state-filter-active');
			expect(root.findAll('#state-filter-rows li')).toEqual([first]);
			expect(root.find('#state-filter-active').className).toBe('selected');
			expect(root.find('#state-filter-all').className).toBe('');

			root.click('#state-filter-completed');
			expect(root.find('#state-filter-rows li').textContent).toBe('second');
			expect(root.find('#state-filter-completed').className).toBe('selected');
			expect(root.find('#state-filter-active').className).toBe('');

			root.click('#state-filter-all');
			const restoredFirst = root.find('#state-filter-rows li');
			root.click('#state-filter-replace');
			expect(root.find('#state-filter-rows li')).toBe(restoredFirst);
			expect(restoredFirst.textContent).toBe('updated');
			expect(root.find('#state-filter-remaining').textContent).toBe('0');
			expect(toggleAll.checked).toBe(true);

			root.click('#state-filter-active');
			expect(root.findAll('#state-filter-rows li')).toEqual([]);
			root.click('#state-filter-add');
			expect(root.find('#state-filter-rows li').textContent).toBe('third');
			expect(root.find('#state-filter-remaining').textContent).toBe('1');
			expect(toggleAll.checked).toBe(false);
		} finally {
			root.unmount();
		}
	});

	it('observes an Array.prototype.filter override installed after a state snapshot mounts', () => {
		const client = loadStateFilterFixture();
		const root = mount(client.App, { value: 'locked' });
		root.click('#state-filter-load');
		root.click('#state-filter-active');
		const original = Array.prototype.filter;
		const events: string[] = [];

		try {
			Array.prototype.filter = function <Item, Result extends Item>(
				this: Item[],
				predicate: (value: Item, index: number, array: Item[]) => value is Result,
				thisArg?: unknown,
			): Result[] {
				const first = this[0] as { id?: number; label?: string } | undefined;
				if (this.length === 2 && first?.id === 1 && first.label === 'first') {
					events.push('filter');
					return [this[1]!] as Result[];
				}
				return original.call(this, predicate, thisArg) as Result[];
			};

			root.click('#state-filter-edit');
			expect(events).toEqual(['filter', 'filter']);
			expect(root.find('#state-filter-rows li').textContent).toBe('second');
			expect(root.find('#state-filter-remaining').textContent).toBe('1');
		} finally {
			Array.prototype.filter = original;
			root.unmount();
		}
	});

	it('honors an Array.prototype.map override when a state updater creates its next snapshot', () => {
		const client = loadStateFilterFixture();
		const root = mount(client.App, { value: 'locked' });
		root.click('#state-filter-load');
		const original = Array.prototype.map;
		const events: string[] = [];

		try {
			Array.prototype.map = function <Item, Result>(
				this: Item[],
				callback: (value: Item, index: number, array: Item[]) => Result,
				thisArg?: unknown,
			): Result[] {
				const first = this[0] as { id?: number; label?: string } | undefined;
				if (this.length === 2 && first?.id === 1 && first.label === 'first') {
					events.push('map');
					return [{ id: 1, label: 'mapped override', completed: false }, this[1]] as Result[];
				}
				return original.call(this, callback, thisArg) as Result[];
			};

			root.click('#state-filter-replace');
			expect(events).toEqual(['map']);
			expect(root.find('#state-filter-rows li').textContent).toBe('mapped override');
			expect(root.find('#state-filter-remaining').textContent).toBe('1');

			root.click('#state-filter-edit');
			expect(root.find('#state-filter-rows li').textContent).toBe('mapped override');
			expect(root.find('#state-filter-remaining').textContent).toBe('1');
		} finally {
			Array.prototype.map = original;
			root.unmount();
		}
	});

	it.each([
		'own filter getter',
		'inherited filter getter',
		'sparse indexed getter',
		'item completed getter',
		'custom array species',
		'proxy receiver',
	] as const)('preserves observable state-array behavior for an %s', (shape) => {
		const source = `
			import { useState } from 'octane';

			export function App(props) @{
				const [todos, setTodos] = useState([]);
				const [tick, setTick] = useState(0);
				const remaining = todos.filter((todo) => !todo.completed).length;
				<section>
					<button id="state-filter-unsafe-load" onClick={() => setTodos(props.items)}>
						{'load'}
					</button>
					<button id="state-filter-unsafe-update" onClick={() => setTick(tick + 1)}>
						{tick as number}
					</button>
					<output id="state-filter-unsafe-remaining">{'' + remaining}</output>
				</section>
			}
		`;
		const client = loadStateFilterFixture(source, `state-filter-unsafe-${shape}.tsrx`);
		const events: string[] = [];
		let completed = false;
		const item: { id: number; completed: boolean } = { id: 1, completed: false };
		let items: Array<typeof item> = [item];
		let expectedEvents: string[];

		if (shape === 'own filter getter' || shape === 'inherited filter getter') {
			const owner = shape === 'own filter getter' ? items : Object.create(Array.prototype);
			Object.defineProperty(owner, 'filter', {
				configurable: true,
				get() {
					events.push('get:filter');
					return function (
						this: typeof items,
						predicate: (value: typeof item, index: number, values: typeof items) => unknown,
					) {
						events.push('call:filter');
						return Array.prototype.filter.call(this, predicate);
					};
				},
			});
			if (shape === 'inherited filter getter') Object.setPrototypeOf(items, owner);
			expectedEvents = ['get:filter', 'call:filter'];
		} else if (shape === 'sparse indexed getter') {
			items = [];
			items.length = 2;
			Object.defineProperty(items, '1', {
				configurable: true,
				enumerable: true,
				get() {
					events.push('get:index');
					return item;
				},
			});
			expectedEvents = ['get:index'];
		} else if (shape === 'item completed getter') {
			Object.defineProperty(item, 'completed', {
				configurable: true,
				get() {
					events.push('get:completed');
					return completed;
				},
			});
			expectedEvents = ['get:completed'];
		} else if (shape === 'custom array species') {
			Object.defineProperty(items, 'constructor', {
				configurable: true,
				value: {
					get [Symbol.species]() {
						events.push('get:species');
						return function (length: number) {
							events.push('new:species');
							return new Array(length);
						};
					},
				},
			});
			expectedEvents = ['get:species', 'new:species'];
		} else {
			items = new Proxy(items, {
				get(target, property, receiver) {
					if (property === 'filter') events.push('get:filter');
					if (property === '0') events.push('get:index');
					return Reflect.get(target, property, receiver);
				},
				getPrototypeOf(target) {
					events.push('get:prototype');
					return Reflect.getPrototypeOf(target);
				},
				getOwnPropertyDescriptor(target, property) {
					if (property === 'filter' || property === '0') events.push('get:descriptor');
					return Reflect.getOwnPropertyDescriptor(target, property);
				},
			});
			expectedEvents = ['get:filter', 'get:index'];
		}

		const root = mount(client.App, { items });

		try {
			root.click('#state-filter-unsafe-load');
			expect(events).toEqual(expectedEvents);
			expect(root.find('#state-filter-unsafe-remaining').textContent).toBe('1');

			events.length = 0;
			completed = true;
			if (shape !== 'item completed getter') item.completed = true;
			root.click('#state-filter-unsafe-update');
			expect(events).toEqual(expectedEvents);
			expect(root.find('#state-filter-unsafe-remaining').textContent).toBe('0');
		} finally {
			root.unmount();
		}
	});

	it('keeps a mutable state snapshot live when it escapes into an event callback', () => {
		const source = `
			import { useState } from 'octane';

			export function App() @{
				const [todos, setTodos] = useState([]);
				const [tick, setTick] = useState(0);
				const alias = todos;
				const remaining = todos.filter((todo) => !todo.completed).length;
				<section>
					<button
						id="state-filter-escape-load"
						onClick={() => setTodos([{ id: 1, completed: false }])}
					>{'load'}</button>
					<button
						id="state-filter-escape-mutate"
						onClick={() => {
							alias[0].completed = true;
							setTick(tick + 1);
						}}
					>{'mutate'}</button>
					<output id="state-filter-escape-remaining">{'' + remaining}</output>
				</section>
			}
		`;
		const client = loadStateFilterFixture(source, 'state-filter-escaped-alias.tsrx');
		const root = mount(client.App);

		try {
			root.click('#state-filter-escape-load');
			expect(root.find('#state-filter-escape-remaining').textContent).toBe('1');
			root.click('#state-filter-escape-mutate');
			expect(root.find('#state-filter-escape-remaining').textContent).toBe('0');
		} finally {
			root.unmount();
		}
	});

	it('recomputes a filtered state snapshot when its predicate captures changed state', () => {
		const source = `
			import { useState } from 'octane';

			export function App() @{
				const [todos, setTodos] = useState([]);
				const [completed, setCompleted] = useState(false);
				const visible = todos.filter((todo) => todo.completed === completed);
				<section>
					<button
						id="state-filter-capture-load"
						onClick={() => setTodos([
							{ id: 1, label: 'first', completed: false },
							{ id: 2, label: 'second', completed: true },
						])}
					>{'load'}</button>
					<button id="state-filter-capture-change" onClick={() => setCompleted(!completed)}>
						{'change'}
					</button>
					<ul id="state-filter-capture-rows">
						@for (const todo of visible; key todo.id) {
							<li>{todo.label as string}</li>
						}
					</ul>
				</section>
			}
		`;
		const client = loadStateFilterFixture(source, 'state-filter-predicate-capture.tsrx');
		const root = mount(client.App);

		try {
			root.click('#state-filter-capture-load');
			expect(root.find('#state-filter-capture-rows li').textContent).toBe('first');
			root.click('#state-filter-capture-change');
			expect(root.find('#state-filter-capture-rows li').textContent).toBe('second');
		} finally {
			root.unmount();
		}
	});

	it.each([
		{ mode: 'development', dev: true },
		{ mode: 'production', dev: false },
	])('re-evaluates observable coercion in $mode state-filter conditions', ({ mode, dev }) => {
		const source = `
			import { useState } from 'octane';

			export function App(props) @{
				const [todos, setTodos] = useState([]);
				const [filter, setFilter] = useState('all');
				const [tick, setTick] = useState(0);
				const visible = filter == 'active' ? todos.filter((todo) => !todo.completed) : todos;
				<section>
					<button
						id="state-filter-coercion-load"
						onClick={() => setTodos([
							{ id: 1, completed: false },
							{ id: 2, completed: true },
						])}
					>{'load'}</button>
					<button id="state-filter-coercion-set" onClick={() => setFilter(props.filter)}>
						{'set'}
					</button>
					<button id="state-filter-coercion-update" onClick={() => setTick(tick + 1)}>
						{'update'}
					</button>
					<output id="state-filter-coercion-visible">{'' + visible.length}</output>
				</section>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: `state-filter-observable-coercion-${mode}.tsrx`,
			mode: 'client',
			compileOptions: { hmr: false, dev },
		});
		const events: string[] = [];
		let active = true;
		const filter = {
			[Symbol.toPrimitive]() {
				events.push('coerce');
				return active ? 'active' : 'all';
			},
		};
		const root = mount(client.App, { filter });

		try {
			root.click('#state-filter-coercion-load');
			root.click('#state-filter-coercion-set');
			expect(root.find('#state-filter-coercion-visible').textContent).toBe('1');

			events.length = 0;
			active = false;
			root.click('#state-filter-coercion-update');
			expect(events).toEqual(['coerce']);
			expect(root.find('#state-filter-coercion-visible').textContent).toBe('2');
		} finally {
			root.unmount();
		}
	});

	it('keeps filtered state live when an earlier predicate mutates the same snapshot', () => {
		const source = `
			import { useState } from 'octane';

			export function App() @{
				const [todos, setTodos] = useState([]);
				const [tick, setTick] = useState(0);
				todos.filter((todo) => {
					todo.completed = !todo.completed;
					return true;
				});
				const remaining = todos.filter((todo) => !todo.completed).length;
				<section>
					<button
						id="state-filter-mutating-load"
						onClick={() => setTodos([{ id: 1, completed: false }])}
					>{'load'}</button>
					<button id="state-filter-mutating-update" onClick={() => setTick(tick + 1)}>
						{'update'}
					</button>
					<output id="state-filter-mutating-remaining">{'' + remaining}</output>
				</section>
			}
		`;
		const client = loadStateFilterFixture(source, 'state-filter-mutating-predicate.tsrx');
		const root = mount(client.App);

		try {
			root.click('#state-filter-mutating-load');
			expect(root.find('#state-filter-mutating-remaining').textContent).toBe('0');
			root.click('#state-filter-mutating-update');
			expect(root.find('#state-filter-mutating-remaining').textContent).toBe('1');
			root.click('#state-filter-mutating-update');
			expect(root.find('#state-filter-mutating-remaining').textContent).toBe('0');
		} finally {
			root.unmount();
		}
	});

	it('re-evaluates side-effecting conditions around filtered state snapshots', () => {
		const source = `
			import { useState } from 'octane';

			export function App() @{
				const [todos, setTodos] = useState([]);
				const [tick, setTick] = useState(0);
				let reads = 0;
				const visible = ++reads ? todos.filter((todo) => !todo.completed) : todos;
				<section>
					<button
						id="state-filter-update-load"
						onClick={() => setTodos([{ id: 1, completed: false }])}
					>{'load'}</button>
					<button id="state-filter-update-again" onClick={() => setTick(tick + 1)}>
						{'update'}
					</button>
					<output id="state-filter-update-visible">{reads + ':' + visible.length}</output>
				</section>
			}
		`;
		const client = loadStateFilterFixture(source, 'state-filter-side-effect-condition.tsrx');
		const root = mount(client.App);

		try {
			root.click('#state-filter-update-load');
			expect(root.find('#state-filter-update-visible').textContent).toBe('1:1');
			root.click('#state-filter-update-again');
			expect(root.find('#state-filter-update-visible').textContent).toBe('1:1');
		} finally {
			root.unmount();
		}
	});

	it('observes item mutations made through an escaped filtered state collection', () => {
		const source = `
			import { useState } from 'octane';

			export function App(props) @{
				const [todos, setTodos] = useState([]);
				const [tick, setTick] = useState(0);
				const visible = todos.filter((todo) => !todo.completed);
				props.observe(visible);
				const remaining = todos.filter((todo) => !todo.completed).length;
				<section>
					<button
						id="state-filter-derived-escape-load"
						onClick={() => setTodos([{ id: 1, completed: false }])}
					>{'load'}</button>
					<button
						id="state-filter-derived-escape-update"
						onClick={() => setTick(tick + 1)}
					>{'update'}</button>
					<output id="state-filter-derived-escape-remaining">{'' + remaining}</output>
				</section>
			}
		`;
		const client = loadStateFilterFixture(source, 'state-filter-derived-escape.tsrx');
		let completed = false;
		const root = mount(client.App, {
			observe(rows: Array<{ completed: boolean }>) {
				if (rows[0] !== undefined) rows[0].completed = completed;
			},
		});

		try {
			root.click('#state-filter-derived-escape-load');
			expect(root.find('#state-filter-derived-escape-remaining').textContent).toBe('1');
			completed = true;
			root.click('#state-filter-derived-escape-update');
			expect(root.find('#state-filter-derived-escape-remaining').textContent).toBe('0');
		} finally {
			root.unmount();
		}
	});

	it('hydrates state-derived filter controls in place and keeps later snapshots reactive', () => {
		const id = 'state-filter-provenance-hydration.tsrx';
		const server = loadCompiledFixtureSource(STATE_FILTER_SOURCE, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadStateFilterFixture(STATE_FILTER_SOURCE, id);
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, { value: 'locked' }).html;
		document.body.appendChild(container);
		const app = container.querySelector('#state-filter-app');
		const input = container.querySelector('#state-filter-value') as HTMLInputElement;
		const all = container.querySelector('#state-filter-all');
		let root: ReturnType<typeof hydrateRoot> | undefined;

		try {
			root = hydrateRoot(container, client.App, { value: 'locked' });
			flushSync(() => {});
			expect(container.querySelector('#state-filter-app')).toBe(app);
			expect(container.querySelector('#state-filter-value')).toBe(input);
			expect(container.querySelector('#state-filter-all')).toBe(all);
			expect(input.value).toBe('locked');

			flushSync(() => (container.querySelector('#state-filter-load') as HTMLElement).click());
			expect(container.querySelector('#state-filter-remaining')?.textContent).toBe('1');
			expect(container.querySelectorAll('#state-filter-rows li')).toHaveLength(2);

			flushSync(() => (container.querySelector('#state-filter-active') as HTMLElement).click());
			expect(container.querySelector('#state-filter-rows li')?.textContent).toBe('first');
			expect(container.querySelector('#state-filter-active')?.className).toBe('selected');
			expect(container.querySelector('#state-filter-app')).toBe(app);
			expect(container.querySelector('#state-filter-value')).toBe(input);
		} finally {
			root?.unmount();
			container.remove();
		}
	});
});

describe('effectful component regions', () => {
	it('keeps changed props, effect cleanup and row identity synchronized', () => {
		const { App } = loadEffectRowParent(loadEffectRow().Row);
		const events: string[] = [];
		const onEffect = (event: string) => events.push(event);
		const items = [{ id: 'row', label: 'first' }];
		const root = mount(App, { items, tick: 0, onEffect });
		flushEffects();
		const row = root.find('li');
		expect(events).toEqual(['layout:first', 'effect:first']);
		root.update(App, { items, tick: 1, onEffect });
		flushEffects();
		expect(root.find('li')).toBe(row);
		expect(events).toEqual(['layout:first', 'effect:first']);
		events.length = 0;
		root.update(App, { items: [{ id: 'row', label: 'second' }], tick: 2, onEffect });
		flushEffects();
		expect(root.find('li')).toBe(row);
		expect(row.textContent).toBe('second');
		expect(events).toContain('layout:second');
		expect(events.filter((event) => !event.startsWith('layout:'))).toEqual([
			'cleanup:first',
			'effect:second',
		]);
		root.unmount();
		flushEffects();
		expect(events.at(-1)).toBe('cleanup:second');
	});

	it('updates live imported refs independently in two retained roots', () => {
		const attached = [new Set<Element>(), new Set<Element>()];
		const ref = (index: number) => (element: Element | null) => {
			if (element === null) return;
			attached[index].add(element);
			return () => {
				attached[index].delete(element);
			};
		};
		setEffectRowImports(ref(0), 0);
		const { App } = loadEffectRowParent(EffectImportRow);
		const props = { items: [{ id: 'row', label: 'same' }], tick: 0 };
		const first = mount(App, props);
		const second = mount(App, props);
		const firstRow = first.find('li');
		const secondRow = second.find('li');
		try {
			expect(attached[0]).toEqual(new Set([firstRow, secondRow]));
			setEffectRowImports(ref(1), 0);
			first.update(App, { ...props, tick: 1 });
			expect(attached[0]).toEqual(new Set([secondRow]));
			expect(attached[1]).toEqual(new Set([firstRow]));
			second.update(App, { ...props, tick: 1 });
			expect(attached[0].size).toBe(0);
			expect(attached[1]).toEqual(new Set([firstRow, secondRow]));
			expect(first.find('li')).toBe(firstRow);
			expect(second.find('li')).toBe(secondRow);
		} finally {
			first.unmount();
			second.unmount();
			flushEffects();
			setEffectRowImports(() => {}, 0);
		}
		expect(attached[1].size).toBe(0);
	});

	it('observes signed-zero changes in a live imported value across roots', () => {
		const ref = () => {};
		setEffectRowImports(ref, 0);
		const { App } = loadEffectRowParent(EffectImportRow);
		const props = { items: [{ id: 'row', label: 'value' }], tick: 0 };
		const first = mount(App, props);
		const second = mount(App, props);
		try {
			expect(first.find('li').textContent).toBe('value:Infinity');
			setEffectRowImports(ref, -0);
			first.update(App, { ...props, tick: 1 });
			second.update(App, { ...props, tick: 1 });
			expect(first.find('li').textContent).toBe('value:-Infinity');
			expect(second.find('li').textContent).toBe('value:-Infinity');
			setEffectRowImports(ref, 0);
			second.update(App, { ...props, tick: 2 });
			first.update(App, { ...props, tick: 2 });
			expect(first.find('li').textContent).toBe('value:Infinity');
			expect(second.find('li').textContent).toBe('value:Infinity');
		} finally {
			first.unmount();
			second.unmount();
			flushEffects();
			setEffectRowImports(() => {}, 0);
		}
	});

	it.each(['null', 'callback factory', 'dependency factory'])(
		'preserves %s effects on unchanged parent updates',
		(kind) => {
			const call =
				kind === 'null'
					? "useEffect(() => { props.onEffect('effect'); return () => props.onEffect('cleanup'); }, null);"
					: kind === 'callback factory'
						? 'useEffect(props.callbackFactory(), []);'
						: "useEffect(() => props.onEffect('effect'), props.dependencyFactory());";
			const { Row } = loadEffectRow(
				`import { useEffect } from 'octane'; export function Row(props) @{ ${call} <li>{props.item.label as string}</li> }`,
			);
			const events: string[] = [];
			const parent = loadCompiledFixtureSource(
				`import { Row } from './row'; export function App(props) @{
					const items = props.items;
					const onEffect = props.onEffect;
					const callbackFactory = props.callbackFactory;
					const dependencyFactory = props.dependencyFactory;
					<ul data-tick={props.tick}>@for (const item of items; key item.id) {
						<Row item={item} onEffect={onEffect} callbackFactory={callbackFactory} dependencyFactory={dependencyFactory} />
					}</ul>
				}`,
				{
					id: 'effect-factories-parent.tsrx',
					mode: 'client',
					compileOptions: { hmr: false, dev: false },
					runtimeModules: { './row': { Row } },
				},
			);
			const props = {
				items: [{ id: 'row', label: 'same' }],
				onEffect: (event: string) => events.push(event),
				callbackFactory: () => {
					events.push('callback');
					return () => {};
				},
				dependencyFactory: () => {
					events.push('dependencies');
					return [];
				},
			};
			const root = mount(parent.App, props);
			flushEffects();
			events.length = 0;
			root.update(parent.App, { ...props, tick: 1 });
			flushEffects();
			expect(events).toEqual(
				kind === 'null'
					? ['cleanup', 'effect']
					: [kind === 'callback factory' ? 'callback' : 'dependencies'],
			);
			root.unmount();
			flushEffects();
		},
	);

	it('does not transfer component behavior guarantees when statics are copied to a wrapper', () => {
		const { Row } = loadEffectRow();
		let label = 'first';
		function Wrapper(props: any, scope: any, extra: any) {
			return Row({ ...props, item: { ...props.item, label } }, scope, extra);
		}
		Object.defineProperties(Wrapper, Object.getOwnPropertyDescriptors(Row));
		const { App } = loadEffectRowParent(Wrapper);
		const props = { items: [{ id: 'row', label: 'ignored' }], tick: 0, onEffect: () => {} };
		const root = mount(App, props);
		expect(root.find('li').textContent).toBe('first');
		label = 'second';
		root.update(App, { ...props, tick: 1 });
		expect(root.find('li').textContent).toBe('second');
		root.unmount();
		flushEffects();
	});

	it('observes defaults added and changed on an effectful provider child', () => {
		const { Row } = loadEffectRow(
			`import { useEffect } from 'octane'; export function Row(props) @{ useEffect(() => {}, []); <li>{props.label as string}</li> }`,
		);
		const parent = loadCompiledFixtureSource(
			`import { createContext } from 'octane'; import { Row } from './row'; const Theme = createContext(null); export function App(props) { return <Theme value={null}><Row /></Theme>; }`,
			{
				id: 'effect-defaults-parent.tsx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './row': { Row } },
			},
		);
		const props = { items: [{ id: 'row' }] };
		const root = mount(parent.App, props);
		Row.defaultProps = { label: 'first' };
		root.update(parent.App, props);
		expect(root.find('li').textContent).toBe('first');
		Row.defaultProps = { label: 'second' };
		root.update(parent.App, props);
		expect(root.find('li').textContent).toBe('second');
		root.unmount();
		flushEffects();
	});

	it('reconnects retained effects when an Activity becomes visible again', () => {
		const { Row } = loadEffectRow();
		const { App } = loadCompiledFixtureSource(
			`
			import { Activity } from 'octane';
			import { Row } from './row';
			function Rows(props) @{
				const items = props.items;
				const onEffect = props.onEffect;
				<ul>@for (const item of items; key item.id) {
					<Row item={item} onEffect={onEffect} />
				}</ul>
			}
			export function App(props) @{ <Activity mode={props.mode}><Rows items={props.items} onEffect={props.onEffect} /></Activity> }
		`,
			{
				id: 'effectful-activity.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './row': { Row } },
			},
		);
		const events: string[] = [];
		const props = {
			items: [{ id: 'row', label: 'live' }],
			onEffect: (event: string) => events.push(event),
			mode: 'visible',
		};
		const root = mount(App, props);
		flushEffects();
		const row = root.find('li');
		expect(events).toEqual(['layout:live', 'effect:live']);
		root.update(App, { ...props, mode: 'hidden' });
		flushEffects();
		expect(events).toContain('cleanup:live');
		events.length = 0;
		root.update(App, props);
		flushEffects();
		expect(root.find('li')).toBe(row);
		expect(row.textContent).toBe('live');
		expect(events).toEqual(['layout:live', 'effect:live']);
		root.unmount();
		flushEffects();
		expect(events.at(-1)).toBe('cleanup:live');
	});

	it('restores effectful row output before retrying a held root update', async () => {
		const { Row } = loadEffectRow();
		const { App } = loadCompiledFixtureSource(
			`
			import { use } from 'octane';
			import { Row } from './row';
			function Reader(props) @{ const value = use(props.promise); <output>{value as string}</output> }
			export function App(props) @{
				const items = props.items;
				const onEffect = props.onEffect;
				<main><ul>@for (const item of items; key item.id) {
					<Row item={item} onEffect={onEffect} />
				}</ul><Reader promise={props.promise} /></main>
			}
		`,
			{
				id: 'effectful-held-root.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './row': { Row } },
			},
		);
		const events: string[] = [];
		const onEffect = (event: string) => events.push(event);
		const first = Promise.resolve('ready');
		const root = mount(App, { items: [{ id: 'row', label: 'first' }], onEffect, promise: first });
		await act(() => first);
		flushEffects();
		const row = root.find('li');
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		await act(() =>
			root.root.render(App, {
				items: [{ id: 'row', label: 'second' }],
				onEffect,
				promise: pending,
			}),
		);
		expect(root.find('li')).toBe(row);
		expect(row.textContent).toBe('first');
		expect(events.filter((event) => !event.startsWith('layout:'))).toEqual(['effect:first']);
		await act(() => resolve('accepted'));
		flushEffects();
		expect(root.find('li')).toBe(row);
		expect(row.textContent).toBe('second');
		expect(root.find('output').textContent).toBe('accepted');
		expect(events.filter((event) => !event.startsWith('layout:'))).toEqual([
			'effect:first',
			'cleanup:first',
			'effect:second',
		]);
		root.unmount();
		flushEffects();
	});

	it('hydrates effectful rows in place and preserves changed dependencies', () => {
		const server = loadEffectRowParent(loadEffectRow(EFFECT_ROW_SOURCE, 'server').Row, 'server');
		const client = loadEffectRowParent(loadEffectRow().Row);
		const events: string[] = [];
		const onEffect = (event: string) => events.push(event);
		const props = { items: [{ id: 'row', label: 'server' }], tick: 0, onEffect };
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
		const row = container.querySelector('li');
		const root = hydrateRoot(container, client.App, props);
		flushEffects();
		expect(container.querySelector('li')).toBe(row);
		expect(events).toEqual(['layout:server', 'effect:server']);
		flushSync(() => root.render(client.App, { ...props, tick: 1 }));
		flushEffects();
		expect(events).toEqual(['layout:server', 'effect:server']);
		flushSync(() => root.render(client.App, { ...props, items: [{ id: 'row', label: 'client' }] }));
		flushEffects();
		expect(container.querySelector('li')).toBe(row);
		expect(row?.textContent).toBe('client');
		expect(events).toContain('cleanup:server');
		expect(events).toContain('effect:client');
		root.unmount();
		flushEffects();
		expect(events.at(-1)).toBe('cleanup:client');
	});
});

// The lite exports each imported module published, and the anchorless ones
// among them, keyed by request, as a production bundler hands them to the
// importer's compile. Every import is reported memo-proven, as a stale build
// fact would be: the runtime witness must still keep each region correct.
interface LiteProof {
	readonly lite: readonly string[];
	readonly anchorless: readonly string[];
}
type LiteProofs = Readonly<Record<string, LiteProof>>;

function liteCompileOptions(proofs: LiteProofs) {
	return {
		hmr: false,
		dev: false,
		isCompilerMemoImport: () => true,
		isLiteComponentImport: (request: string, imported: string) =>
			proofs[request]?.lite.includes(imported) === true,
		isAnchorlessComponentImport: (request: string, imported: string) =>
			proofs[request]?.anchorless.includes(imported) === true,
	};
}

function liteExportsOf(source: string, id: string, proofs: LiteProofs = {}): LiteProof {
	const result = compile(source, id, liteCompileOptions(proofs)) as {
		liteComponentExports?: string[];
		anchorlessComponentExports?: string[];
	};
	return {
		lite: result.liteComponentExports ?? [],
		anchorless: result.anchorlessComponentExports ?? [],
	};
}

function loadImportedModule(
	source: string,
	id: string,
	runtimeModules?: Record<string, any>,
	lite: LiteProofs = {},
	mode: 'client' | 'server' = 'client',
) {
	return loadCompiledFixtureSource(source, {
		id,
		mode,
		compileOptions: liteCompileOptions(lite),
		runtimeModules,
	});
}

// Each module is its own file. Leaf and Badge are hookless and read no context,
// so the bundler proves them lite, and Mid too through its proven imports.
// Counter is hookful, so the edge to it keeps a Block and its updates never
// re-run App. Badge's root can render nothing, so it is not anchorless, and its
// lite edge keeps an anchor among its siblings; Mid's call needs none.
const IMPORTED_LITE_MODULES = {
	leaf: `export function Leaf(props) @{ <span class="leaf">{props.text as string}</span> }`,
	badge: `export function Badge(props) @{ @if (props.on) { <b class="badge">{'on'}</b> } }`,
	counter: `import { useState } from 'octane';
		export function Counter(props) @{
			const [count, setCount] = useState(0);
			<button class="counter" onClick={() => setCount(count + 1)}>
				{(props.text + ':' + count) as string}
			</button>
		}`,
	mid: `import { Leaf } from './leaf';
		import { Badge } from './badge';
		export function Mid(props) @{
			<div class="mid">
				<Leaf text={props.text} />
				<Badge on={props.on} />
				<Leaf text="tail" />
			</div>
		}`,
	app: `import { Mid } from './mid';
		import { Counter } from './counter';
		export function App(props) @{
			props.onRender();
			<section data-tick={props.tick}>
				<Mid text={props.text} on={props.on} />
				<Counter text={props.text} />
			</section>
		}`,
};

function loadImportedLiteApp(mode: 'client' | 'server' = 'client') {
	const sources = IMPORTED_LITE_MODULES;
	const lite = {
		'./leaf': liteExportsOf(sources.leaf, 'lite-leaf.tsrx'),
		'./badge': liteExportsOf(sources.badge, 'lite-badge.tsrx'),
		'./counter': liteExportsOf(sources.counter, 'lite-counter.tsrx'),
	};
	const all = { ...lite, './mid': liteExportsOf(sources.mid, 'lite-mid.tsrx', lite) };
	const modules = {
		'./leaf': loadImportedModule(sources.leaf, 'lite-leaf.tsrx', undefined, {}, mode),
		'./badge': loadImportedModule(sources.badge, 'lite-badge.tsrx', undefined, {}, mode),
		'./counter': loadImportedModule(sources.counter, 'lite-counter.tsrx', undefined, {}, mode),
	};
	const mid = loadImportedModule(sources.mid, 'lite-mid.tsrx', modules, lite, mode);
	const app = loadImportedModule(
		sources.app,
		'lite-app.tsrx',
		{ ...modules, './mid': mid },
		all,
		mode,
	);
	return { app, lite: all };
}

describe('imported component regions', () => {
	it('admits imported regions only for exports that publish a proof', () => {
		const card = `import { useState } from 'octane';
			 import { Leaf } from './leaf';
			 export function Card(props) @{ <div><Leaf label={props.label} /></div> }
			 function Private(props) @{ <i>{props.label as string}</i> }
			 export function Stateful() @{ const [count] = useState(0); <b>{count as number}</b> }
			 export { Private as Item };`;
		const compileCard = (leafProven: boolean) =>
			compile(card, 'imported-memo-card.tsrx', {
				hmr: false,
				autoMemo: true,
				isCompilerMemoImport: (request: string, imported: string) =>
					leafProven && request === './leaf' && imported === 'Leaf',
			});
		const proven = compileCard(true);
		// The proof witnesses the imported child it renders: live binding and proof.
		expect(proven.code).toMatch(/\(\) => \[Leaf, _\$compilerMemoWitness\(Leaf\)\]/);
		expect(proven.code).toMatch(/const Stateful = \/\* @__PURE__ \*\/ _\$__s\(/);
		expect(proven.compilerMemoExports).toEqual(['Card', 'Item']);
		// A proof over an import without one could never hold.
		expect(compileCard(false).compilerMemoExports).toEqual(['Item']);

		const parent = `import { Card } from './card';
			 import { Stateful } from './stateful';
			 export function App(props) @{
				<p data-tick={props.tick}><Card label={props.label} /><Stateful label={props.label} /></p>
			 }`;
		const compileParent = (proofs: string[]) =>
			compile(parent, 'imported-memo-parent.tsrx', {
				hmr: false,
				autoMemo: true,
				isCompilerMemoImport: (request: string) => proofs.includes(request),
			}).code;
		const admitted = compileParent(['./card']);
		expectCompilerRegion(admitted);
		expect(admitted).toContain('_$compilerMemoWitness(Card)');
		// An import without a published proof keeps its plain call.
		expect(admitted).not.toContain('_$compilerMemoWitness(Stateful)');
		expectNoCompilerRegion(compileParent([]));

		const withChildren = compile(
			`import { Card } from './card';
			 export function App(props) @{ <p data-tick={props.tick}><Card label={props.label}><b /></Card></p> }`,
			'imported-memo-children.tsrx',
			{ hmr: false, autoMemo: true, isCompilerMemoImport: () => true },
		).code;
		expectNoCompilerRegion(withChildren);
	});

	it('re-renders a proven import whose imported child is unproven', () => {
		const inner = loadImportedModule(
			`let value = 'a';
			 export function setValue(next) { value = next; }
			 export function Inner(props) @{ <b>{(props.label + ':' + value) as string}</b> }`,
			'imported-unproven-inner.tsrx',
		);
		const wrapper = loadImportedModule(
			`import { Inner } from './inner';
			 export function Wrapper(props) @{ <span><Inner label={props.label} /></span> }`,
			'imported-proven-wrapper.tsrx',
			{ './inner': inner },
		);
		const { App } = loadImportedModule(
			`import { Wrapper } from './wrapper';
			 export function App(props) @{ <p data-tick={props.tick}><Wrapper label={props.label} /></p> }`,
			'imported-wrapper-parent.tsrx',
			{ './wrapper': wrapper },
		);
		const root = mount(App, { label: 'x', tick: 0 });
		try {
			expect(root.find('b').textContent).toBe('x:a');
			inner.setValue('b');
			root.update(App, { label: 'x', tick: 1 });
			expect(root.find('b').textContent).toBe('x:b');
			root.update(App, { label: 'y', tick: 2 });
			expect(root.find('b').textContent).toBe('y:b');
		} finally {
			root.unmount();
		}
	});

	it('refreshes a memo() context consumer below a cached imported edge', () => {
		const Theme = createContext('t0');
		const readerSource = `import { memo, useContext } from 'octane';
			 import { Theme } from './theme';
			 function ReaderImpl(props) @{
				const theme = useContext(Theme);
				<b>{(props.label + ':' + theme) as string}</b>
			 }
			 export const Reader = memo(ReaderImpl);`;
		const reader = loadImportedModule(readerSource, 'imported-context-reader.tsrx', {
			'./theme': { Theme },
		});
		const wrapperSource = `import { Reader } from './reader';
			 export function Wrapper(props) @{ <span><Reader label={props.label} /></span> }`;
		const wrapper = loadImportedModule(wrapperSource, 'imported-context-wrapper.tsrx', {
			'./reader': reader,
		});
		// The bundler's proofs, as built: a memo() export is never lite, so the
		// Wrapper edge that renders it must keep refreshing context.
		const readerLite = liteExportsOf(readerSource, 'imported-context-reader.tsrx');
		const { App } = loadImportedModule(
			`import { Theme } from './theme';
			 import { Wrapper } from './wrapper';
			 export function App(props) @{
				<Theme value={props.theme}>
					<p><Wrapper label={props.label} /></p>
				</Theme>
			 }`,
			'imported-context-parent.tsrx',
			{ './theme': { Theme }, './wrapper': wrapper },
			{
				'./wrapper': liteExportsOf(wrapperSource, 'imported-context-wrapper.tsrx', {
					'./reader': readerLite,
				}),
			},
		);
		const root = mount(App, { label: 'x', theme: 't1' });
		try {
			expect(root.find('b').textContent).toBe('x:t1');
			root.update(App, { label: 'x', theme: 't2' });
			expect(root.find('b').textContent).toBe('x:t2');
		} finally {
			root.unmount();
		}
	});

	it('renders and updates components that recurse across modules', () => {
		const { App } = loadImportedModule(
			`import { AutoMemoCycleA } from './cycle';
			 export function App(props) @{
				<p data-tick={props.tick}><AutoMemoCycleA depth={2} label={props.label} /></p>
			 }`,
			'imported-cycle-parent.tsrx',
			{ './cycle': { AutoMemoCycleA } },
		);
		setAutoMemoCycleValue('v0');
		const root = mount(App, { label: 'x', tick: 0 });
		try {
			expect(root.findAll('.cycle-a')).toHaveLength(3);
			expect(root.find('.cycle-leaf').textContent).toBe('x:v0');
			setAutoMemoCycleValue('v1');
			root.update(App, { label: 'x', tick: 1 });
			expect(root.find('.cycle-leaf').textContent).toBe('x:v1');
			root.update(App, { label: 'y', tick: 2 });
			expect(root.find('.cycle-leaf').textContent).toBe('y:v1');
		} finally {
			root.unmount();
			setAutoMemoCycleValue('v0');
		}
	});

	it('runs proven hookless imports through lite edges', () => {
		const { app, lite } = loadImportedLiteApp();
		expect(lite).toEqual({
			'./leaf': { lite: ['Leaf'], anchorless: ['Leaf'] },
			'./badge': { lite: ['Badge'], anchorless: [] },
			'./counter': { lite: [], anchorless: [] },
			'./mid': { lite: ['Mid'], anchorless: ['Mid'] },
		});
		const code = compile(IMPORTED_LITE_MODULES.app, 'lite-app.tsrx', liteCompileOptions(lite)).code;
		expect(code).toMatch(/_\$componentSlotLite\([^;]*, Mid,/);
		expect(code).not.toMatch(/_\$componentSlotLite\([^;]*, Counter,/);

		let renders = 0;
		const onRender = () => renders++;
		const root = mount(app.App, { text: 'a', on: false, tick: 0, onRender });
		const order = () =>
			Array.from(
				root.findAll('.mid > *, .counter'),
				(child) => child.className + ':' + child.textContent,
			);
		const anchored = (host: Element) => [...host.childNodes].some((node) => node.nodeType === 8);
		try {
			const leaf = root.find('.leaf');
			expect(order()).toEqual(['leaf:a', 'leaf:tail', 'counter:a:0']);
			// Only the proven anchorless call drops its anchor.
			expect(anchored(root.find('section'))).toBe(false);
			expect(anchored(root.find('.mid'))).toBe(true);
			// Equal props: every cached edge hits and the DOM stays in place.
			root.update(app.App, { text: 'a', on: false, tick: 1, onRender });
			expect(root.find('.leaf')).toBe(leaf);
			expect(order()).toEqual(['leaf:a', 'leaf:tail', 'counter:a:0']);
			// The hookful import owns its state: its update does not re-run App.
			expect(renders).toBe(2);
			root.click('.counter');
			expect(order()).toEqual(['leaf:a', 'leaf:tail', 'counter:a:1']);
			expect(renders).toBe(2);
			root.update(app.App, { text: 'a', on: true, tick: 2, onRender });
			expect(order()).toEqual(['leaf:a', 'badge:on', 'leaf:tail', 'counter:a:1']);
			root.update(app.App, { text: 'b', on: false, tick: 3, onRender });
			expect(order()).toEqual(['leaf:b', 'leaf:tail', 'counter:b:1']);
			root.update(app.App, { text: 'b', on: true, tick: 4, onRender });
			expect(order()).toEqual(['leaf:b', 'badge:on', 'leaf:tail', 'counter:b:1']);
			expect(root.find('.leaf')).toBe(leaf);
		} finally {
			const container = root.container;
			root.unmount();
			expect(container.innerHTML).toBe('');
		}
	});

	it('publishes no lite export over a body that renders a prop value', () => {
		// Such a value may hold a component that reads context, so a cache hit
		// over the export must keep refreshing it.
		const shell = (child: string) => `${child}
			export function Shell(props) @{ <div><Child on={props.on} content={props.content} /></div> }`;
		const proven = "function Child(props) @{ <i>{props.on ? 'on' : 'off'}</i> }";
		expect(liteExportsOf(shell(proven), 'lite-shell-text.tsrx').lite).toEqual(['Shell']);
		for (const child of [
			'function Child(props) @{ <i>{props.content}</i> }',
			"function Child(props) { if (props.on) return props.content; return <i>{'off'}</i>; }",
			'function Child(props) @{ const C = props.content; <C /> }',
		]) {
			expect(liteExportsOf(shell(child), 'lite-shell-opaque.tsrx').lite).toEqual([]);
		}
	});

	it.each([
		['a child hole', '<span>{props.content}</span>'],
		['a host children prop', '<span children={props.content} />'],
		['a host spread', '<span {...props.host} />'],
	])('refreshes context below an imported edge that renders %s', (_name, body) => {
		const Theme = createContext('t0');
		const slotSource = `export function Slot(props) @{ ${body} }`;
		const slot = loadImportedModule(slotSource, 'imported-prop-slot.tsrx');
		const { App, Reader } = loadImportedModule(
			`import { useContext } from 'octane';
			 import { Theme } from './theme';
			 import { Slot } from './slot';
			 export function Reader(props) @{
				const theme = useContext(Theme);
				<b>{(props.label + ':' + theme) as string}</b>
			 }
			 export function App(props) @{
				<Theme value={props.theme}><p><Slot content={props.content} host={props.host} /></p></Theme>
			 }`,
			'imported-prop-slot-parent.tsrx',
			{ './theme': { Theme }, './slot': slot },
			{ './slot': liteExportsOf(slotSource, 'imported-prop-slot.tsrx') },
		);
		// The parent passes the same element down, so the cached edge hits.
		const content = createElement(Reader, { label: 'x' });
		const props = { content, host: { children: content } };
		const root = mount(App, { ...props, theme: 't1' });
		try {
			expect(root.find('b').textContent).toBe('x:t1');
			root.update(App, { ...props, theme: 't2' });
			expect(root.find('b').textContent).toBe('x:t2');
		} finally {
			root.unmount();
		}
	});

	it('publishes no lite export from a native-read module', () => {
		// A native-read body subscribes the Block it renders in; behind a lite
		// edge that is the importer's region owner, which a cache hit does not
		// re-run. Its memo proof still stands.
		const label = `import 'octane/signals';
			export function Label(props) @{ <span>{props.value$ as string}</span> }`;
		const result = compile(label, 'native-lite-label.tsrx', liteCompileOptions({})) as {
			compilerMemoExports?: string[];
			liteComponentExports?: string[];
		};
		expect(result.compilerMemoExports).toEqual(['Label']);
		expect(result.liteComponentExports).toBeUndefined();
		expect(
			liteExportsOf(label.replace("import 'octane/signals';", ''), 'plain-label.tsrx').lite,
		).toEqual(['Label']);
	});

	it('hydrates proven hookless imports through lite edges', () => {
		const server = loadImportedLiteApp('server').app;
		const { app } = loadImportedLiteApp();
		let renders = 0;
		const onRender = () => renders++;
		const props = { text: 'a', on: true, tick: 0, onRender };
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
		const leaf = container.querySelector('.leaf');
		const badge = container.querySelector('.badge');
		const counter = container.querySelector('.counter') as HTMLButtonElement;
		const order = () =>
			Array.from(
				container.querySelectorAll('.mid > *, .counter'),
				(child) => child.className + ':' + child.textContent,
			);
		const root = hydrateRoot(container, app.App, props);
		try {
			expect(container.querySelector('.leaf')).toBe(leaf);
			expect(container.querySelector('.badge')).toBe(badge);
			expect(container.querySelector('.counter')).toBe(counter);
			const hydrated = renders;
			flushSync(() => counter.click());
			expect(order()).toEqual(['leaf:a', 'badge:on', 'leaf:tail', 'counter:a:1']);
			expect(renders).toBe(hydrated);
			flushSync(() => root.render(app.App, { text: 'b', on: false, tick: 1, onRender }));
			expect(order()).toEqual(['leaf:b', 'leaf:tail', 'counter:b:1']);
			flushSync(() => root.render(app.App, { text: 'b', on: true, tick: 2, onRender }));
			expect(order()).toEqual(['leaf:b', 'badge:on', 'leaf:tail', 'counter:b:1']);
			expect(container.querySelector('.leaf')).toBe(leaf);
		} finally {
			root.unmount();
			expect(container.innerHTML).toBe('');
		}
	});
});

// Strong renders hookful same-module callees through lite edges: a callee's
// hook cells live in its Scope, and an update re-renders the nearest Block.
// Counter `a` sits in an arm the parent keeps rendering around; `b` and Panel
// each guard an effect so a render can skip it, `b` while Panel still reaches
// its own; `m` reads context below a memo wall. Each scenario runs once per
// mode, and the two must not differ.
const STRONG_HOOKFUL_LITE_SOURCE = `"use strong";
	import { Activity, createContext, memo, useContext, useEffect, useId, useLayoutEffect, useState } from 'octane';

	export const Theme = createContext('light');

	function Counter(props) @{
		const [count, setCount] = useState(0);
		const theme = useContext(Theme);
		const uid = useId();
		const log = props.log;
		const name = props.name;
		useLayoutEffect(() => {
			log('layout:' + name + count);
			return () => log('layout-cleanup:' + name + count);
		});
		if (props.watch) {
			useEffect(() => {
				log('effect:' + name + count);
				return () => log('cleanup:' + name + count);
			});
		}
		<button id={props.name} data-uid={uid} ref={props.cell} onClick={() => setCount(count + 1)}>
			{(props.name + ':' + theme + ':' + count) as string}
		</button>
	}

	function Panel(props) @{
		const [tick, setTick] = useState(0);
		const log = props.log;
		if (props.watch !== 'none') {
			useEffect(() => {
				log('watch:' + tick);
				return () => log('unwatch:' + tick);
			});
		}
		<section id="panel" data-tick={tick as number}>
			<button id="tick" onClick={() => setTick(tick + 1)}>{'tick'}</button>
			@if (props.show) {
				<Counter name="a" watch={true} log={props.log} cell={props.cell} />
			}
			<Counter name="b" watch={props.watch === 'all'} log={props.log} />
		</section>
	}

	const Frame = memo(function Frame(props) @{
		<div id="frame"><Counter name="m" watch={false} log={props.log} /></div>
	});

	export function App(props) @{
		<Theme value={props.theme}>
			<Activity mode={props.mode}>
				<Panel show={props.show} watch={props.watch} log={props.log} cell={props.cell} />
			</Activity>
			<Frame log={props.log} />
		</Theme>
	}
`;

type StrongMode = 'strong' | 'default';

function strongHookfulSource(mode: StrongMode): string {
	return mode === 'strong'
		? STRONG_HOOKFUL_LITE_SOURCE
		: STRONG_HOOKFUL_LITE_SOURCE.replace('"use strong";', '');
}

function loadStrongHookfulApp(mode: StrongMode, environment: 'client' | 'server' = 'client') {
	return loadCompiledFixtureSource(strongHookfulSource(mode), {
		id: `strong-hookful-lite-${mode}.tsrx`,
		mode: environment,
		compileOptions: { hmr: false, dev: false },
	});
}

describe('Strong hookful lite edges', () => {
	it('lowers hookful callees to lite edges only in Strong mode', () => {
		const lite = /_\$componentSlotLite\(\s*__s,\s*\d+,\s*[^,]+,\s*Counter,/g;
		const strong = compile(strongHookfulSource('strong'), 'strong-hookful.tsrx', {
			hmr: false,
			dev: false,
		}).code;
		expect(strong.match(lite)).toHaveLength(3);
		const compatible = compile(strongHookfulSource('default'), 'default-hookful.tsrx', {
			hmr: false,
			dev: false,
		}).code;
		expect(compatible.match(lite)).toBeNull();
	});

	function runHookfulScenario(mode: StrongMode): string[] {
		const client = loadStrongHookfulApp(mode);
		const log: string[] = [];
		const cell = (el: Element | null) => log.push('ref:' + (el === null ? null : el.id));
		const props = {
			theme: 'light',
			mode: 'visible',
			show: true,
			watch: 'all',
			log: log.push.bind(log),
			cell,
		};
		const root = mount(client.App, props);
		const transcript: string[] = [];
		const step = (label: string) => {
			flushEffects();
			const text = root.findAll('button[data-uid]').map((el) => el.textContent);
			transcript.push(`${label} | ${text.join(' ')} | ${log.splice(0).join(' ')}`);
		};
		step('mount');
		const panel = root.find('#panel');
		const b = root.find('#b');
		root.click('#a');
		step('own update');
		root.click('#tick');
		step('parent update');
		expect(root.find('#b')).toBe(b);
		root.update(client.App, { ...props, theme: 'dark' });
		step('context');
		root.update(client.App, { ...props, theme: 'dark', watch: 'panel' });
		step('skip child effect');
		root.update(client.App, { ...props, theme: 'dark', watch: 'none' });
		step('skip parent effect');
		root.update(client.App, { ...props, theme: 'dark', watch: 'none', show: false });
		step('arm off');
		root.update(client.App, { ...props, theme: 'dark', show: true });
		step('arm on');
		root.update(client.App, { ...props, theme: 'dark', mode: 'hidden' });
		step('hide');
		root.update(client.App, { ...props, theme: 'dark' });
		step('reveal');
		expect(root.find('#panel')).toBe(panel);
		expect(root.find('#b')).toBe(b);
		root.unmount();
		step('unmount');
		// Passive mount effects are still queued when the root unmounts.
		const early = mount(client.App, props);
		early.unmount();
		step('unmount before passive flush');
		return transcript;
	}

	it('keeps state, effects, refs and context of hookful lite callees', () => {
		const strong = runHookfulScenario('strong');
		expect(strong).toEqual(runHookfulScenario('default'));
		expect(strong).toEqual([
			'mount | a:light:0 b:light:0 m:light:0 | ref:a layout:a0 layout:b0 layout:m0 effect:a0 effect:b0 watch:0',
			'own update | a:light:1 b:light:0 m:light:0 | layout-cleanup:a0 layout:a1 cleanup:a0 effect:a1',
			'parent update | a:light:1 b:light:0 m:light:0 | unwatch:0 watch:1',
			'context | a:dark:1 b:dark:0 m:dark:0 | ',
			'skip child effect | a:dark:1 b:dark:0 m:dark:0 | cleanup:b0',
			'skip parent effect | a:dark:1 b:dark:0 m:dark:0 | unwatch:1',
			'arm off | b:dark:0 m:dark:0 | layout-cleanup:a1 ref:null cleanup:a1',
			'arm on | a:dark:0 b:dark:0 m:dark:0 | ref:a layout:a0 effect:a0 effect:b0 watch:1',
			'hide | a:dark:0 b:dark:0 m:dark:0 | unwatch:1 layout-cleanup:a0 cleanup:a0 layout-cleanup:b0 cleanup:b0 ref:null',
			'reveal | a:dark:0 b:dark:0 m:dark:0 | ref:a layout:a0 layout:b0 effect:a0 effect:b0 watch:1',
			'unmount |  | layout-cleanup:a0 layout-cleanup:b0 layout-cleanup:m0 ref:null unwatch:1 cleanup:a0 cleanup:b0',
			'unmount before passive flush |  | ref:a layout:a0 layout:b0 layout:m0 layout-cleanup:a0 layout-cleanup:b0 layout-cleanup:m0 ref:null',
		]);
	});

	// Child owns state its parent's stable-hookful region does not witness, so
	// the region must cover a Block that its own update re-renders directly,
	// including when a hookless Wrap stands between them.
	it.each<[StrongMode, boolean]>([
		['strong', false],
		['strong', true],
		['default', false],
		['default', true],
	])(
		'keeps a stable hookful region over a state owner fresh in %s mode (wrapped: %s)',
		(mode, wrapped) => {
			const child = wrapped ? '<Wrap label={props.label} />' : '<Child label={props.label} />';
			const source = `${mode === 'strong' ? '"use strong";' : ''}
				import { useState } from 'octane';
				let parentSetter = null;
				let childSetter = null;
				export function bumpParent() { parentSetter((value) => value + 1); }
				export function bumpChild() { childSetter((value) => value + 1); }
				function Child(props) @{
					const [own, setOwn] = useState(0);
					childSetter = setOwn;
					<b id="stable-child">{(props.label + ':' + own) as string}</b>
				}
				function Wrap(props) @{ <i><Child label={props.label} /></i> }
				function Parent(props) @{
					const [tick, setTick] = useState(0);
					parentSetter = setTick;
					<p id="stable-parent" data-tick={tick as number}>${child}</p>
				}
				export function App(props) @{ <Parent label={props.label} /> }`;
			const options = { hmr: false, dev: false };
			const parent = compile(source, `stable-hookful-${mode}.tsrx`, options).code;
			// The region also witnesses the published setter. Only a default-mode
			// Wrap may stay lite under it: there, Child keeps a Block of its own.
			const slot = mode === 'default' && wrapped ? 'Lite' : 'Void';
			expect(parent).toMatch(
				new RegExp(
					`\\|\\| _mc\\d+\\[\\d+\\] !== childSetter\\) \\{\\s+_\\$componentSlot${slot}\\(__s, 1,`,
				),
			);
			const client = loadCompiledFixtureSource(source, {
				id: `stable-hookful-${mode}.tsrx`,
				mode: 'client',
				compileOptions: options,
			});
			const root = mount(client.App, { label: 'x' });
			const leaf = root.find('#stable-child');
			flushSync(() => client.bumpChild());
			expect(leaf.textContent).toBe('x:1');
			flushSync(() => client.bumpParent());
			expect(root.find('#stable-parent').getAttribute('data-tick')).toBe('1');
			flushSync(() => client.bumpChild());
			expect(root.find('#stable-child')).toBe(leaf);
			expect(leaf.textContent).toBe('x:2');
			// The single-root callee still needs no markers.
			const html = '<b id="stable-child">x:2</b>';
			expect(root.find('#stable-parent').innerHTML).toBe(wrapped ? `<i>${html}</i>` : html);
			root.unmount();
		},
	);

	// Reader registers an effect and then suspends through a legacy resource read,
	// which keeps it lite. The inner boundary must catch it, discard the
	// uncommitted attempt, and keep Counter's committed state across a re-suspend.
	async function runSuspenseScenario(mode: StrongMode): Promise<string[]> {
		const source = `${mode === 'strong' ? '"use strong";' : ''}
			import { useEffect, useLayoutEffect, useState } from 'octane';
			function Counter(props) @{
				const [count, setCount] = useState(0);
				const log = props.log;
				useLayoutEffect(() => {
					log('layout:' + count);
					return () => log('layout-cleanup:' + count);
				});
				useEffect(() => {
					log('effect:' + count);
					return () => log('cleanup:' + count);
				});
				<button id="suspense-counter" onClick={() => setCount(count + 1)}>
					{('count:' + count) as string}
				</button>
			}
			function Reader(props) @{
				const [seen] = useState(() => props.resource.label);
				const log = props.log;
				useEffect(() => {
					log('read:' + seen);
					return () => log('unread:' + seen);
				});
				const value = props.resource.read();
				<i id="suspense-value">{(seen + '=' + value) as string}</i>
			}
			export function App(props) @{
				@try {
					<section>
						@try {
							<>
								<Counter log={props.log} />
								<Reader resource={props.resource} log={props.log} />
							</>
						} @pending {
							<p id="inner-pending">{'inner'}</p>
						}
					</section>
				} @pending {
					<p id="outer-pending">{'outer'}</p>
				}
			}`;
		const lite = /_\$componentSlotLite\(\s*__s,\s*\d+,\s*[^,]+,\s*(Counter|Reader),/g;
		const code = compile(source, `suspense-${mode}.tsrx`, { hmr: false, dev: false }).code;
		expect(code.match(lite)?.length ?? 0).toBe(mode === 'strong' ? 2 : 0);
		const client = loadCompiledFixtureSource(source, {
			id: `suspense-${mode}.tsrx`,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const resource = (label: string) => {
			let settle!: () => void;
			const promise = new Promise<void>((resolve) => (settle = resolve));
			let done = false;
			return {
				label,
				read() {
					if (!done) throw promise;
					return 'ready';
				},
				async resolve() {
					done = true;
					settle();
					await act(async () => {
						await promise;
					});
				},
			};
		};
		const log: string[] = [];
		const transcript: string[] = [];
		const first = resource('first');
		const root = mount<Record<string, unknown>>(client.App, {
			resource: first,
			log: log.push.bind(log),
		});
		const step = (label: string) => {
			flushEffects();
			const shown = root.findAll('p, button, i').map((el) => el.textContent);
			transcript.push(`${label} | ${shown.join(' ')} | ${log.splice(0).join(' ')}`);
		};
		step('suspended mount');
		await first.resolve();
		step('revealed');
		root.click('#suspense-counter');
		step('own update');
		const second = resource('second');
		root.update(client.App, { resource: second, log: log.push.bind(log) });
		step('re-suspended');
		await second.resolve();
		step('re-revealed');
		root.unmount();
		step('unmount');
		return transcript;
	}

	it('suspends the nearest boundary from a hookful lite callee', async () => {
		const strong = await runSuspenseScenario('strong');
		expect(strong).toEqual(await runSuspenseScenario('default'));
		expect(strong).toEqual([
			'suspended mount | count:0 inner | ',
			'revealed | count:0 first=ready | layout:0 effect:0 read:first',
			'own update | count:1 first=ready | layout-cleanup:0 layout:1 cleanup:0 effect:1',
			're-suspended | count:1 first=ready inner | layout-cleanup:1',
			're-revealed | count:1 first=ready | layout:1 cleanup:1 unread:first effect:1 read:first',
			'unmount |  | layout-cleanup:1 cleanup:1 unread:first',
		]);
	});

	it.each<StrongMode>(['strong', 'default'])(
		'hydrates hookful lite callees in place in %s mode',
		(mode) => {
			const server = loadStrongHookfulApp(mode, 'server');
			const client = loadStrongHookfulApp(mode);
			const log: string[] = [];
			const cell = (el: Element | null) => log.push('ref:' + (el === null ? null : el.id));
			const props = {
				theme: 'light',
				mode: 'visible',
				show: true,
				watch: 'all',
				log: log.push.bind(log),
				cell,
			};
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
			expect(log).toEqual([]);
			const buttons = Array.from(container.querySelectorAll('button[data-uid]'));
			const ids = buttons.map((el) => el.getAttribute('data-uid'));
			expect(buttons.map((el) => el.textContent)).toEqual(['a:light:0', 'b:light:0', 'm:light:0']);
			const root = hydrateRoot(container, client.App, props);
			flushEffects();
			const hydrated = Array.from(container.querySelectorAll('button[data-uid]'));
			expect(hydrated).toHaveLength(3);
			hydrated.forEach((el, index) => expect(el).toBe(buttons[index]));
			expect(hydrated.map((el) => el.getAttribute('data-uid'))).toEqual(ids);
			expect(log.splice(0)).toEqual([
				'ref:a',
				'layout:a0',
				'layout:b0',
				'layout:m0',
				'effect:a0',
				'effect:b0',
				'watch:0',
			]);
			flushSync(() => (buttons[0] as HTMLButtonElement).click());
			flushSync(() => root.render(client.App, { ...props, theme: 'dark' }));
			flushEffects();
			expect(hydrated.map((el) => el.textContent)).toEqual(['a:dark:1', 'b:dark:0', 'm:dark:0']);
			expect(log.splice(0)).toEqual(['layout-cleanup:a0', 'layout:a1', 'cleanup:a0', 'effect:a1']);
			root.unmount();
			expect(container.innerHTML).toBe('');
		},
	);

	// Strong modules publish exports whose lite subtree holds hook state on a
	// list of their own. Only a Strong importer runs them without a Block: a
	// default importer's Block must not re-render for its child's update.
	const STRONG_LITE_MODULES = {
		counter: `"use strong";
			import { useState } from 'octane';
			export function Counter(props) @{
				const [count, setCount] = useState(0);
				<button class={props.name} onClick={() => setCount(count + 1)}>
					{(props.name + ':' + count) as string}
				</button>
			}
			export function Shell() @{ <p><Counter name="shell" /></p> }`,
		// The ref keeps Wrap out of compiler regions, so it can publish a lite proof.
		wrap: `"use strong";
			import { Counter } from './counter';
			export function Wrap(props) @{ <div ref={props.cell}><Counter name="wrapped" /></div> }`,
		leaf: `"use strong";
			export function Leaf(props) @{ <span class="leaf">{props.text as string}</span> }`,
		app: `import { Counter, Shell } from './counter';
			import { Wrap } from './wrap';
			import { Leaf } from './leaf';
			export function App(props) @{
				props.onRender();
				<section>
					<Counter name="direct" />
					<Shell />
					<Wrap cell={props.cell} />
					<Leaf text={props.text} />
				</section>
			}`,
	};

	// Only the pure Leaf publishes a compiler memo proof, as a production build does.
	type StrongLiteProofs = Readonly<Record<string, readonly string[]>>;
	function strongLiteOptions(lite: LiteProofs, strongLite: StrongLiteProofs) {
		return {
			...liteCompileOptions(lite),
			isCompilerMemoImport: (request: string) => request === './leaf',
			isStrongLiteComponentImport: (request: string, imported: string) =>
				strongLite[request]?.includes(imported) === true,
		};
	}

	it.each<StrongMode>(['strong', 'default'])(
		'runs Strong hookful exports through lite edges only from a %s importer',
		(mode) => {
			const sources = STRONG_LITE_MODULES;
			const listsOf = (
				source: string,
				id: string,
				lite: LiteProofs,
				strongLite: StrongLiteProofs,
			) => {
				const result = compile(source, id, strongLiteOptions(lite, strongLite)) as {
					liteComponentExports?: string[];
					strongLiteComponentExports?: string[];
				};
				return [result.liteComponentExports ?? [], result.strongLiteComponentExports ?? []];
			};
			const [counterLite, counterStrong] = listsOf(sources.counter, 'sl-counter.tsrx', {}, {});
			expect([counterLite, counterStrong]).toEqual([[], ['Counter', 'Shell']]);
			// A default module's hookful export keeps its Block, so Shell stays stateless.
			expect(
				listsOf(sources.counter.replace('"use strong";', ''), 'sl-counter-default.tsrx', {}, {}),
			).toEqual([['Shell'], []]);
			const [leafLite, leafStrong] = listsOf(sources.leaf, 'sl-leaf.tsrx', {}, {});
			expect([leafLite, leafStrong]).toEqual([['Leaf'], []]);
			// Shell and Wrap are hookless, but a lite edge to Counter brings its state along.
			const strongLite = { './counter': counterStrong };
			expect(listsOf(sources.wrap, 'sl-wrap.tsrx', {}, strongLite)).toEqual([[], ['Wrap']]);
			const proofs = {
				lite: { './leaf': { lite: leafLite, anchorless: [] } },
				strongLite: { ...strongLite, './wrap': ['Wrap'] },
			};
			const app = mode === 'strong' ? `"use strong";\n${sources.app}` : sources.app;
			const code = compile(
				app,
				`sl-app-${mode}.tsrx`,
				strongLiteOptions(proofs.lite, proofs.strongLite),
			).code;
			const liteTags = (
				code.match(/_\$componentSlotLite\(\s*__s,\s*\d+,\s*[^,]+,\s*(\w+),/g) ?? []
			).map((call: string) => call.match(/(\w+),$/)![1]);
			expect(liteTags).toEqual(mode === 'strong' ? ['Counter', 'Shell', 'Wrap', 'Leaf'] : ['Leaf']);

			const load = (source: string, id: string, runtimeModules?: Record<string, any>) =>
				loadCompiledFixtureSource(source, {
					id,
					mode: 'client',
					compileOptions: strongLiteOptions(proofs.lite, proofs.strongLite),
					runtimeModules,
				});
			const counter = load(sources.counter, 'sl-counter.tsrx');
			const modules = {
				'./counter': counter,
				'./wrap': load(sources.wrap, 'sl-wrap.tsrx', { './counter': counter }),
				'./leaf': load(sources.leaf, 'sl-leaf.tsrx'),
			};
			const client = load(app, `sl-app-${mode}.tsrx`, modules);
			let renders = 0;
			const cell = () => {};
			const root = mount(client.App, { text: 'a', cell, onRender: () => renders++ });
			const leaf = root.find('.leaf');
			root.click('.direct');
			root.click('.shell');
			root.click('.wrapped');
			root.click('.wrapped');
			expect(root.find('.direct').textContent).toBe('direct:1');
			expect(root.find('.shell').textContent).toBe('shell:1');
			expect(root.find('.wrapped').textContent).toBe('wrapped:2');
			if (mode === 'default') expect(renders).toBe(1);
			root.update(client.App, { text: 'b', cell, onRender: () => renders++ });
			expect(root.find('.leaf')).toBe(leaf);
			expect(leaf.textContent).toBe('b');
			expect(root.find('.wrapped').textContent).toBe('wrapped:2');
			root.unmount();
		},
	);

	// Compiles a scenario in `mode` and names the callees it lowered to lite
	// edges, so each parity scenario proves that Strong really ran them lite.
	function loadLiteScenario(source: string, mode: StrongMode, id: string) {
		const authored = mode === 'strong' ? `"use strong";\n${source}` : source;
		const options = { hmr: false, dev: false };
		const code = compile(authored, `${id}-${mode}.tsrx`, options).code;
		const lite = (code.match(/_\$componentSlotLite\(\s*__s,\s*\d+,\s*[^,]+,\s*\w+,/g) ?? []).map(
			(call: string) => call.match(/(\w+),$/)![1],
		);
		const client = loadCompiledFixtureSource(authored, {
			id: `${id}-${mode}.tsrx`,
			mode: 'client',
			compileOptions: options,
		});
		return { client, lite };
	}

	// Two Probe instances share one owner Block, so a cell or handle keyed on that
	// Block instead of the lite Scope collides between them.
	const EFFECT_HOOKS_SOURCE = `
		import { Activity, useEffect, useEffectEvent, useImperativeHandle, useInsertionEffect, useLayoutSnapshot, useLazyRef, useState } from 'octane';

		function Probe(props) @{
			const [count, setCount] = useState(0);
			const log = props.log;
			const name = props.name;
			const clicks = useLazyRef(() => ({ name, total: 0 }));
			useInsertionEffect(() => {
				log('insert:' + name + count);
				return () => log('uninsert:' + name + count);
			});
			const report = useEffectEvent(() => log('event:' + name + count));
			useEffect(() => {
				if (props.ping > 0) report();
			});
			useImperativeHandle(props.handle, () => ({ read: () => name + count }));
			const shown = useLayoutSnapshot(() => props.measure(name), { initial: '-' });
			<button
				id={props.prefix + name}
				data-shown={shown}
				onClick={() => {
					clicks.current.total++;
					log('click:' + clicks.current.name + clicks.current.total);
					setCount(count + 1);
				}}
			>
				{(name + ':' + count) as string}
			</button>
		}

		export function App(props) @{
			<Activity mode={props.mode}>
				<section>
					<Probe name="a" prefix={props.prefix} ping={props.ping} log={props.log} handle={props.handles.a} measure={props.measure} />
					<Probe name="b" prefix={props.prefix} ping={props.ping} log={props.log} handle={props.handles.b} measure={props.measure} />
					@if (props.showC) {
						<Probe name="c" prefix={props.prefix} ping={props.ping} log={props.log} handle={props.handles.c} measure={props.measure} />
					}
				</section>
			</Activity>
		}
	`;

	function runEffectHooksScenario(mode: StrongMode): string[] {
		const { client, lite } = loadLiteScenario(EFFECT_HOOKS_SOURCE, mode, 'lite-effect-hooks');
		expect(lite).toEqual(mode === 'strong' ? ['Probe', 'Probe', 'Probe'] : []);
		const prefix = `effect-hooks-${mode}-`;
		const log: string[] = [];
		const handles = {
			a: { current: null as { read(): string } | null },
			b: { current: null as { read(): string } | null },
			c: { current: null as { read(): string } | null },
		};
		const props = {
			prefix,
			mode: 'visible',
			ping: 0,
			showC: true,
			log: log.push.bind(log),
			handles,
			measure: (name: string) => document.getElementById(prefix + name)?.textContent ?? '?',
		};
		const root = mount(client.App, props);
		const transcript: string[] = [];
		const step = (label: string) => {
			flushEffects();
			const shown = root
				.findAll('button')
				.map((el) => `${el.textContent}[${el.getAttribute('data-shown')}]`);
			const read = Object.entries(handles).map(
				([name, ref]) => `${name}=${ref.current === null ? null : ref.current.read()}`,
			);
			transcript.push(
				`${label} | ${shown.join(' ')} | ${read.join(' ')} | ${log.splice(0).join(' ')}`,
			);
		};
		step('mount');
		root.click(`#${prefix}a`);
		step('own update');
		root.update(client.App, { ...props, ping: 1 });
		step('effect event');
		root.click(`#${prefix}b`);
		root.update(client.App, { ...props, ping: 2 });
		step('sibling update');
		root.update(client.App, { ...props, ping: 2, showC: false });
		step('arm off');
		root.update(client.App, { ...props, ping: 2, showC: false, mode: 'hidden' });
		step('hide');
		root.update(client.App, { ...props, ping: 2, showC: false });
		step('reveal');
		root.click(`#${prefix}a`);
		step('update after reveal');
		root.unmount();
		step('unmount');
		return transcript;
	}

	it('keeps lazy refs, insertion effects, Effect Events, handles and snapshots per lite callee', () => {
		const strong = runEffectHooksScenario('strong');
		expect(strong).toEqual(runEffectHooksScenario('default'));
		expect(strong).toEqual([
			'mount | a:0[a:0] b:0[b:0] c:0[c:0] | a=a0 b=b0 c=c0 | insert:a0 insert:b0 insert:c0',
			'own update | a:1[a:1] b:0[b:0] c:0[c:0] | a=a1 b=b0 c=c0 | click:a1 uninsert:a0 insert:a1',
			'effect event | a:1[a:1] b:0[b:0] c:0[c:0] | a=a1 b=b0 c=c0 | event:a1 event:b0 event:c0',
			'sibling update | a:1[a:1] b:1[b:1] c:0[c:0] | a=a1 b=b1 c=c0 | click:b1 uninsert:b0 insert:b1 event:a1 event:b1 event:c0',
			'arm off | a:1[a:1] b:1[b:1] | a=a1 b=b1 c=null | uninsert:c0',
			'hide | a:1[a:1] b:1[b:1] | a=null b=null c=null | ',
			'reveal | a:1[a:1] b:1[b:1] | a=a1 b=b1 c=null | event:a1 event:b1',
			'update after reveal | a:2[a:2] b:1[b:1] | a=a2 b=b1 c=null | click:a2 uninsert:a1 insert:a2',
			'unmount |  | a=null b=null c=null | uninsert:a2 uninsert:b1',
		]);
	});

	// Each Mirror subscribes to its own store and links an editable draft to the
	// store's value; the conditional one unsubscribes when its arm turns off.
	const STORE_HOOKS_SOURCE = `
		import { useLinkedState, useSyncExternalStore } from 'octane';

		function Mirror(props) @{
			const value = useSyncExternalStore(props.store.subscribe, props.store.read, props.store.server);
			const [draft, setDraft] = useLinkedState(value, (source) => source * 10);
			<button class={props.name} onClick={() => setDraft((current) => current + 1)}>
				{(props.name + ':' + value + '/' + draft) as string}
			</button>
		}

		export function App(props) @{
			<section>
				<Mirror name="a" store={props.stores.a} />
				<Mirror name="b" store={props.stores.b} />
				@if (props.showC) {
					<Mirror name="c" store={props.stores.c} />
				}
			</section>
		}
	`;

	function testStore<T = number>(name: string, log: string[], value = 0 as T, server = value) {
		const listeners = new Set<() => void>();
		return {
			read: () => value,
			server: () => server,
			subscribe(listener: () => void) {
				listeners.add(listener);
				log.push('subscribe:' + name);
				return () => {
					listeners.delete(listener);
					log.push('unsubscribe:' + name);
				};
			},
			set(next: T) {
				value = next;
				listeners.forEach((listener) => listener());
			},
		};
	}

	function runStoreHooksScenario(mode: StrongMode): string[] {
		const { client, lite } = loadLiteScenario(STORE_HOOKS_SOURCE, mode, 'lite-store-hooks');
		expect(lite).toEqual(mode === 'strong' ? ['Mirror', 'Mirror', 'Mirror'] : []);
		const log: string[] = [];
		const stores = { a: testStore('a', log), b: testStore('b', log), c: testStore('c', log) };
		const props = { stores, showC: true };
		const root = mount(client.App, props);
		const transcript: string[] = [];
		const step = (label: string) => {
			flushEffects();
			const shown = root.findAll('button').map((el) => el.textContent);
			transcript.push(`${label} | ${shown.join(' ')} | ${log.splice(0).join(' ')}`);
		};
		step('mount');
		stores.a.set(1);
		step('store a');
		root.click('.a');
		step('edit a');
		root.click('.b');
		root.click('.b');
		step('edit b');
		stores.b.set(2);
		step('store b relinks');
		root.click('.c');
		stores.c.set(3);
		step('store c');
		root.update(client.App, { ...props, showC: false });
		step('arm off');
		stores.c.set(4);
		step('store c after unmount');
		root.unmount();
		step('unmount');
		return transcript;
	}

	it('keeps external-store subscriptions and linked state per lite callee', () => {
		const strong = runStoreHooksScenario('strong');
		expect(strong).toEqual(runStoreHooksScenario('default'));
		expect(strong).toEqual([
			'mount | a:0/0 b:0/0 c:0/0 | subscribe:a subscribe:b subscribe:c',
			'store a | a:1/10 b:0/0 c:0/0 | ',
			'edit a | a:1/11 b:0/0 c:0/0 | ',
			'edit b | a:1/11 b:0/2 c:0/0 | ',
			'store b relinks | a:1/11 b:2/20 c:0/0 | ',
			'store c | a:1/11 b:2/20 c:3/30 | ',
			'arm off | a:1/11 b:2/20 | unsubscribe:c',
			'store c after unmount | a:1/11 b:2/20 | ',
			'unmount |  | unsubscribe:a unsubscribe:b',
		]);
	});

	// The server renders each store's server snapshot. Hydration adopts that DOM,
	// then the commit-time store check moves every Mirror to its client value.
	it.each<StrongMode>(['strong', 'default'])(
		'hydrates external-store and linked-state lite callees in %s mode',
		(mode) => {
			const authored =
				mode === 'strong' ? `"use strong";\n${STORE_HOOKS_SOURCE}` : STORE_HOOKS_SOURCE;
			const load = (environment: 'client' | 'server') =>
				loadCompiledFixtureSource(authored, {
					id: `lite-store-hydrate-${mode}.tsrx`,
					mode: environment,
					compileOptions: { hmr: false, dev: false },
				});
			const log: string[] = [];
			const stores = {
				a: testStore('a', log, 7, 5),
				b: testStore('b', log, 5, 5),
				c: testStore('c', log, 7, 5),
			};
			const props = { stores, showC: true };
			const container = document.createElement('div');
			container.innerHTML = ServerRuntime.renderToString(load('server').App, props).html;
			const buttons = Array.from(container.querySelectorAll('button'));
			expect(buttons.map((el) => el.textContent)).toEqual(['a:5/50', 'b:5/50', 'c:5/50']);
			const root = hydrateRoot(container, load('client').App, props);
			flushEffects();
			const hydrated = Array.from(container.querySelectorAll('button'));
			expect(hydrated).toHaveLength(3);
			hydrated.forEach((el, index) => expect(el).toBe(buttons[index]));
			expect(hydrated.map((el) => el.textContent)).toEqual(['a:7/70', 'b:5/50', 'c:7/70']);
			expect(log.splice(0)).toEqual(['subscribe:a', 'subscribe:b', 'subscribe:c']);
			flushSync(() => (buttons[1] as HTMLButtonElement).click());
			stores.a.set(8);
			flushEffects();
			expect(hydrated.map((el) => el.textContent)).toEqual(['a:8/80', 'b:5/51', 'c:7/70']);
			root.unmount();
			expect(log).toEqual(['unsubscribe:a', 'unsubscribe:b', 'unsubscribe:c']);
		},
	);

	// Panel keeps a Block because it calls use(), so lite Probe's Effect Event
	// versions Panel. Panel and Reader update from their own stores in one flush:
	// Panel completes with a new event body, then Reader suspends the shared
	// boundary. Until it reveals, the event keeps its committed body even when
	// called from outside the hidden primary.
	const HIDDEN_EFFECT_EVENT_SOURCE = `
		import { use, useEffectEvent, useLayoutEffect, useSyncExternalStore } from 'octane';

		function Probe(props) @{
			const report = useEffectEvent(() => props.log('event:' + props.label));
			useLayoutEffect(() => {
				props.expose(report);
			});
			<b>{props.label as string}</b>
		}

		function Panel(props) @{
			const suffix = use(props.ready);
			const label = useSyncExternalStore(props.labels.subscribe, props.labels.read);
			<div>
				<Probe label={label + suffix} log={props.log} expose={props.expose} />
			</div>
		}

		function Reader(props) @{
			const promise = useSyncExternalStore(props.promises.subscribe, props.promises.read);
			const value = use(promise);
			<i>{value as string}</i>
		}

		export function App(props) @{
			@try {
				<section>
					<Panel ready={props.ready} labels={props.labels} log={props.log} expose={props.expose} />
					<Reader promises={props.promises} />
				</section>
			} @pending {
				<p>{'pending'}</p>
			}
		}
	`;

	async function runHiddenEffectEventScenario(mode: StrongMode): Promise<string[]> {
		const { client, lite } = loadLiteScenario(
			HIDDEN_EFFECT_EVENT_SOURCE,
			mode,
			'lite-hidden-event',
		);
		expect(lite).toEqual(mode === 'strong' ? ['Probe'] : []);
		const settled = (value: string) =>
			Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
		const log: string[] = [];
		let report = () => {};
		const labels = testStore('labels', [], 'a');
		const promises = testStore<Promise<string>>('promises', [], settled('one'));
		const props = {
			ready: settled('!'),
			labels,
			promises,
			log: log.push.bind(log),
			expose: (fn: () => void) => (report = fn),
		};
		const root = mount(client.App, props);
		const transcript: string[] = [];
		const step = (label: string) => {
			flushEffects();
			report();
			const shown = root.findAll('b, i, p').map((el) => el.textContent);
			transcript.push(`${label} | ${shown.join(' ')} | ${log.splice(0).join(' ')}`);
		};
		step('mount');
		let resolve!: (value: string) => void;
		labels.set('b');
		promises.set(new Promise<string>((done) => (resolve = done)));
		step('hidden update');
		await act(async () => resolve('two'));
		step('revealed');
		root.unmount();
		return transcript;
	}

	it('keeps a lite Effect Event body parked while its boundary hides the primary', async () => {
		const strong = await runHiddenEffectEventScenario('strong');
		expect(strong).toEqual(await runHiddenEffectEventScenario('default'));
		expect(strong).toEqual([
			'mount | a! one | event:a!',
			'hidden update | b! one pending | event:a!',
			'revealed | b! two | event:b!',
		]);
	});

	// Status reads the <form> its owner renders around it, while Todo never sees
	// the form it renders itself. Each Todo owns its Action queue, optimistic
	// count, transition and deferred query.
	const ACTION_HOOKS_SOURCE = `
		import { useActionState, useDeferredValue, useFormState, useFormStatus, useOptimistic, useTransition } from 'octane';

		function Status(props) @{
			const status = useFormStatus();
			<i class={'status-' + props.name}>{(status.pending ? 'pending' : 'idle') as string}</i>
		}

		function Todo(props) @{
			const [saved, save, saving] = useActionState(async (count, step) => {
				await props.gate();
				return count + step;
			}, 0);
			const [shown, addOptimistic] = useOptimistic(saved, (count, step) => count + step);
			const [busy, start] = useTransition();
			const query = useDeferredValue(props.query);
			const own = useFormStatus();
			const [resets, reset] = useFormState((count) => count + 1, 0);
			<form
				class={'form-' + props.name}
				action={() => {
					addOptimistic(1);
					return save(1);
				}}
			>
				<Status name={props.name} />
				<b>
					{(props.name + ':' + shown + '/' + saved + (saving ? ' saving' : '') + (busy ? ' busy' : '') + (own.pending ? ' own' : '') + ' r=' + resets + ' q=' + query) as string}
				</b>
				<button class={'go-' + props.name} type="button" onClick={() => start(async () => { await props.gate(); })}>
					{'go'}
				</button>
				<button class={'reset-' + props.name} type="button" onClick={() => reset()}>
					{'reset'}
				</button>
			</form>
		}

		export function App(props) @{
			<section>
				<Todo name="a" gate={props.gate} query={props.query} />
				<Todo name="b" gate={props.gate} query={props.query + '!'} />
			</section>
		}
	`;

	async function runActionHooksScenario(mode: StrongMode): Promise<string[]> {
		const { client, lite } = loadLiteScenario(ACTION_HOOKS_SOURCE, mode, 'lite-action-hooks');
		expect(lite).toEqual(mode === 'strong' ? ['Status', 'Todo', 'Todo'] : []);
		const gates: Array<() => void> = [];
		const gate = () => new Promise<void>((resolve) => gates.push(resolve));
		const props = { gate, query: 'x' };
		const root = mount(client.App, props);
		const transcript: string[] = [];
		const step = async (label: string) => {
			await act(async () => {});
			flushEffects();
			const shown = root.findAll('i, b').map((el) => el.textContent);
			transcript.push(`${label} | ${shown.join(' ')}`);
		};
		await step('mount');
		flushSync(() =>
			root
				.find('.form-a')
				.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })),
		);
		await step('submit a');
		gates.shift()!();
		await step('saved a');
		root.click('.go-b');
		await step('transition b');
		gates.shift()!();
		await step('transition b done');
		root.click('.reset-b');
		await step('form state b');
		root.update(client.App, { ...props, query: 'y' });
		const stale = root.findAll('b').map((el) => el.textContent);
		transcript.push(`urgent query | ${stale.join(' ')}`);
		await step('deferred query');
		root.unmount();
		return transcript;
	}

	it('keeps Actions, optimistic state, transitions, deferred values and form status per lite callee', async () => {
		const strong = await runActionHooksScenario('strong');
		expect(strong).toEqual(await runActionHooksScenario('default'));
		expect(strong).toEqual([
			'mount | idle a:0/0 r=0 q=x idle b:0/0 r=0 q=x!',
			'submit a | pending a:1/0 saving r=0 q=x idle b:0/0 r=0 q=x!',
			'saved a | idle a:1/1 r=0 q=x idle b:0/0 r=0 q=x!',
			'transition b | idle a:1/1 r=0 q=x idle b:0/0 busy r=0 q=x!',
			'transition b done | idle a:1/1 r=0 q=x idle b:0/0 r=0 q=x!',
			'form state b | idle a:1/1 r=0 q=x idle b:0/0 r=1 q=x!',
			'urgent query | a:1/1 r=0 q=x b:0/0 r=1 q=x!',
			'deferred query | idle a:1/1 r=0 q=y idle b:0/0 r=1 q=y!',
		]);
	});

	// use() stores thenables by call order on the rendering Block. Maybe calls it
	// only while its store is on. A resume that lands in the same task as the
	// store turning off replays Later's use() first in the sequence, where a
	// shared sequence would still hold Maybe's promise.
	const USE_SEQUENCE_SOURCE = `
		import { use, useLayoutEffect, useSyncExternalStore } from 'octane';

		function Maybe(props) @{
			const on = useSyncExternalStore(props.toggle.subscribe, props.toggle.read);
			const label = on ? use(props.promise) : 'off';
			useLayoutEffect(() => {
				props.log('maybe:' + label);
			});
			<i>{('maybe:' + label) as string}</i>
		}

		function Later(props) @{
			const label = use(props.promise);
			useLayoutEffect(() => {
				props.log('later:' + label);
			});
			<b>{('later:' + label) as string}</b>
		}

		export function App(props) @{
			@try {
				<section>
					<Maybe promise={props.first} toggle={props.toggle} log={props.log} />
					<Later promise={props.second} log={props.log} />
				</section>
			} @pending {
				<p>{'pending'}</p>
			}
		}
	`;

	async function runUseSequenceScenario(mode: StrongMode): Promise<string[]> {
		const { client } = loadLiteScenario(USE_SEQUENCE_SOURCE, mode, 'lite-use-sequence');
		const pending = () => {
			let resolve!: (value: string) => void;
			const promise = new Promise<string>((done) => (resolve = done));
			return { promise, resolve };
		};
		const log: string[] = [];
		const toggle = testStore('toggle', [], 1);
		const first = pending();
		const second = pending();
		const props = {
			first: first.promise,
			second: second.promise,
			toggle,
			log: log.push.bind(log),
		};
		const root = mount(client.App, props);
		const transcript: string[] = [];
		const step = (label: string) => {
			flushEffects();
			const shown = root.findAll('i, b, p').map((el) => el.textContent);
			transcript.push(`${label} | ${shown.join(' ')} | ${log.splice(0).join(' ')}`);
		};
		await act(async () => first.resolve('one'));
		await act(async () => second.resolve('two'));
		step('mount');
		const third = pending();
		root.update(client.App, { ...props, second: third.promise });
		step('suspended update');
		await act(async () => {
			third.resolve('three');
			toggle.set(0);
		});
		step('resolved while turning off');
		root.unmount();
		return transcript;
	}

	it('keeps use() callees on their own thenable sequence across a resume', async () => {
		const strong = await runUseSequenceScenario('strong');
		expect(strong).toEqual(await runUseSequenceScenario('default'));
		expect(strong).toEqual([
			'mount | maybe:one later:two | maybe:one later:two',
			'suspended update | maybe:one later:two pending | ',
			'resolved while turning off | maybe:off later:three | maybe:off later:three',
		]);
	});
});

describe('compiler-owned component-region memoization', () => {
	it('keeps alternate Provider children distinct while retaining live form state', () => {
		const client = loadCompiledFixtureSource(
			`import { useMemo } from 'octane';
			function Child(props) @{ <span id="shared-label">{props.label}</span> }
			function Alternate(props) @{ <span id="shared-label">{'alternate:' + props.label}</span> }
			export function First() @{
				const memo = useMemo(() => ({ label: 'first' }), []);
				<div id="shared-host"><input defaultValue="draft"/><Child label={memo.label}/></div>
			}
			export function Second() @{
				const memo = useMemo(() => ({ label: 'second' }), []);
				<div id="shared-host"><input defaultValue="draft"/><Child label={memo.label}/></div>
			}
			export function AutoFirst() @{
				const memo = useMemo(() => ({ label: 'same' }), []);
				<div id="shared-host"><input defaultValue="draft"/><Child label={memo.label}/></div>
			}
			export function AutoSecond() @{
				const memo = useMemo(() => ({ label: 'same' }), []);
				<div id="shared-host"><input defaultValue="draft"/><Alternate label={memo.label}/></div>
			}
			export function Combined(props) @{
				const memo = useMemo(() => ({ label: props.label }), [props.label]);
				props.observe(memo);
				<div id="shared-host" data-tick={props.tick}><input defaultValue="draft"/><Child label={memo.label}/></div>
			}`,
			{
				id: 'provider-body-memo-lifetimes.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			},
		);
		const Context = createContext('default');
		const root = mount(Context, { value: 'initial', children: client.First });
		const input = root.find('input') as HTMLInputElement;
		const label = root.find('#shared-label');
		expect(label.textContent).toBe('first');
		input.value = 'typed';
		input.focus();

		root.update(Context, { value: 'updated', children: client.Second });
		expect(root.find('input')).toBe(input);
		expect(input.value).toBe('typed');
		expect(document.activeElement).toBe(input);
		expect(root.find('#shared-label')).toBe(label);
		expect(label.textContent).toBe('second');

		root.update(Context, { value: 'again', children: client.Second });
		expect(root.find('input')).toBe(input);
		expect(input.value).toBe('typed');
		expect(root.find('#shared-label')).toBe(label);
		expect(label.textContent).toBe('second');
		root.unmount();

		const alternate = mount(Context, { value: 'initial', children: client.AutoFirst });
		const alternateInput = alternate.find('input') as HTMLInputElement;
		const firstLabel = alternate.find('#shared-label');
		expect(firstLabel.textContent).toBe('same');
		alternateInput.value = 'edited';
		alternateInput.focus();
		alternate.update(Context, { value: 'updated', children: client.AutoSecond });
		expect(alternate.find('input')).toBe(alternateInput);
		expect(alternateInput.value).toBe('edited');
		expect(document.activeElement).toBe(alternateInput);
		expect(alternate.find('#shared-label').textContent).toBe('alternate:same');
		expect(alternate.find('#shared-label')).not.toBe(firstLabel);
		alternate.unmount();

		const observed: object[] = [];
		const capture = (value: object) => observed.push(value);
		const combined = mount(client.Combined, { label: 'same', tick: 0, observe: capture });
		const combinedInput = combined.find('input') as HTMLInputElement;
		combinedInput.value = 'kept';
		combinedInput.focus();
		const initialMemo = observed.at(-1);
		const initialObservations = observed.length;
		combined.update(client.Combined, { label: 'same', tick: 1, observe: capture });
		expect(combined.find('#shared-host').getAttribute('data-tick')).toBe('1');
		expect(observed.length).toBeGreaterThan(initialObservations);
		expect(observed.at(-1)).toBe(initialMemo);
		expect(combined.find('input')).toBe(combinedInput);
		expect(combinedInput.value).toBe('kept');
		expect(document.activeElement).toBe(combinedInput);
		const stableMemo = observed.at(-1);
		combined.update(client.Combined, { label: 'next', tick: 2, observe: capture });
		expect(observed.at(-1)).not.toBe(stableMemo);
		expect(combined.find('#shared-label').textContent).toBe('next');
		combined.unmount();
	});

	it('preserves an independently updating pure hookful child under its hookful parent', () => {
		const source = `
			import { useState } from 'octane';

			function Child(props) @{
				const [own, setOwn] = useState(0);
				<button id="hookful-pure-child" onClick={() => setOwn(own + 1)}>
					{props.label + ':' + own}
				</button>
			}

			function Parent(props) @{
				const [tick, setTick] = useState(0);
				<section id="hookful-pure-parent" data-tick={tick as number}>
					<button id="hookful-pure-parent-update" onClick={() => setTick(tick + 1)}>
						{'parent'}
					</button>
					<Child label={props.label} />
				</section>
			}

			export function App(props) @{
				<Parent label={props.label} />
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-pure-parent-child.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App, { label: 'initial' });
		const parent = root.find('#hookful-pure-parent');
		const child = root.find('#hookful-pure-child');
		expect(child.textContent).toBe('initial:0');

		root.click('#hookful-pure-parent-update');
		expect(root.find('#hookful-pure-parent')).toBe(parent);
		expect(parent.getAttribute('data-tick')).toBe('1');
		expect(root.find('#hookful-pure-child')).toBe(child);
		expect(child.textContent).toBe('initial:0');

		root.click('#hookful-pure-child');
		expect(child.textContent).toBe('initial:1');
		root.click('#hookful-pure-parent-update');
		expect(parent.getAttribute('data-tick')).toBe('2');
		expect(root.find('#hookful-pure-child')).toBe(child);
		expect(child.textContent).toBe('initial:1');

		root.update(client.App, { label: 'changed' });
		expect(root.find('#hookful-pure-child')).toBe(child);
		expect(child.textContent).toBe('changed:1');
		root.unmount();
	});

	it('preserves hookful child setters, context, effects, and changed props', () => {
		const source = `
			import { useContext, useEffect, useState } from 'octane';

			let parentSetter = null;
			let childSetter = null;

			export function bumpParent() {
				if (parentSetter) parentSetter((value) => value + 1);
			}

			export function bumpChild() {
				if (childSetter) childSetter((value) => value + 1);
			}

			function Child(props) @{
				const [own, setOwn] = useState(0);
				childSetter = setOwn;
				<button id="hookful-child-own" onClick={() => setOwn(own + 1)}>
					{props.label + ':' + own}
				</button>
			}

			function ContextReader(props) @{
				const theme = useContext(props.context);
				<output id="hookful-child-context">{theme as string}</output>
			}

			function EffectChild(props) @{
				useEffect(() => {
					props.onEffect('mount:' + props.label);
					return () => props.onEffect('cleanup:' + props.label);
				}, [props.label, props.onEffect]);
				<span id="hookful-child-effect">{props.label as string}</span>
			}

			function Parent(props) @{
				const [tick, setTick] = useState(0);
				parentSetter = setTick;
				<section id="hookful-child-parent" data-tick={tick as number}>
					<Child label={props.label} />
					<ContextReader context={props.context} />
					<EffectChild label={props.label} onEffect={props.onEffect} />
				</section>
			}

			export function App(props) @{
				const [theme, setTheme] = useState('light');
				const Theme = props.context;
				<main>
					<button id="hookful-child-theme" onClick={() => setTheme('dark')}>{'theme'}</button>
					<Theme value={theme}>
						<Parent label={props.label} context={Theme} onEffect={props.onEffect} />
					</Theme>
				</main>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-child-state-context-effects.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const effects: string[] = [];
		const context = createContext('default');
		const props = {
			context,
			label: 'first',
			onEffect: (event: string) => effects.push(event),
		};
		const root = mount(client.App, props);
		flushEffects();
		const parent = root.find('#hookful-child-parent');
		const child = root.find('#hookful-child-own');
		expect(child.textContent).toBe('first:0');
		expect(root.find('#hookful-child-context').textContent).toBe('light');
		expect(effects).toEqual(['mount:first']);

		flushSync(() => client.bumpParent());
		expect(root.find('#hookful-child-parent')).toBe(parent);
		expect(parent.getAttribute('data-tick')).toBe('1');
		expect(root.find('#hookful-child-own')).toBe(child);

		flushSync(() => client.bumpChild());
		expect(child.textContent).toBe('first:1');
		root.click('#hookful-child-own');
		expect(child.textContent).toBe('first:2');

		root.click('#hookful-child-theme');
		expect(root.find('#hookful-child-context').textContent).toBe('dark');
		expect(root.find('#hookful-child-own')).toBe(child);
		expect(child.textContent).toBe('first:2');

		root.update(client.App, { ...props, label: 'changed' });
		flushEffects();
		expect(root.find('#hookful-child-own')).toBe(child);
		expect(child.textContent).toBe('changed:2');
		expect(root.find('#hookful-child-effect').textContent).toBe('changed');
		expect(effects).toEqual(['mount:first', 'cleanup:first', 'mount:changed']);

		root.unmount();
		flushEffects();
		expect(effects).toEqual(['mount:first', 'cleanup:first', 'mount:changed', 'cleanup:changed']);
	});

	it('preserves hookful child external-store updates and subscription ownership', () => {
		const source = `
			import { useState, useSyncExternalStore } from 'octane';

			function StoreChild(props) @{
				const value = useSyncExternalStore(props.store.subscribe, props.store.getSnapshot);
				<output id="hookful-store-value">{value as number}</output>
			}

			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section data-tick={tick as number}>
					<button id="hookful-store-parent" onClick={() => setTick(tick + 1)}>{'parent'}</button>
					<StoreChild store={props.store} />
				</section>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-child-external-store.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const createStore = (initial: number) => {
			let value = initial;
			const listeners = new Set<() => void>();
			return {
				getSnapshot: () => value,
				subscribe(listener: () => void) {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				set(next: number) {
					value = next;
					for (const listener of listeners) listener();
				},
				listenerCount: () => listeners.size,
			};
		};
		const first = createStore(1);
		const second = createStore(10);
		const root = mount(client.App, { store: first });
		flushEffects();
		const output = root.find('#hookful-store-value');
		expect(output.textContent).toBe('1');
		expect(first.listenerCount()).toBe(1);

		root.click('#hookful-store-parent');
		expect(root.find('#hookful-store-value')).toBe(output);
		flushSync(() => first.set(2));
		expect(output.textContent).toBe('2');

		root.update(client.App, { store: second });
		flushEffects();
		expect(root.find('#hookful-store-value')).toBe(output);
		expect(output.textContent).toBe('10');
		expect(first.listenerCount()).toBe(0);
		expect(second.listenerCount()).toBe(1);

		flushSync(() => first.set(99));
		expect(output.textContent).toBe('10');
		flushSync(() => second.set(11));
		expect(output.textContent).toBe('11');

		root.unmount();
		flushEffects();
		expect(second.listenerCount()).toBe(0);
	});

	it('repoints a hookful child setter to the most recently rerendered root', () => {
		const source = `
			import { useState } from 'octane';

			let childSetter = null;

			export function bumpChild() {
				if (childSetter) childSetter((value) => value + 1);
			}

			function Child(props) @{
				const [own, setOwn] = useState(0);
				childSetter = setOwn;
				<output class="hookful-shared-child">{props.label + ':' + own}</output>
			}

			function Parent(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button class="hookful-shared-parent" onClick={() => setTick(tick + 1)}>
						{tick as number}
					</button>
					<Child label={props.label} />
				</section>
			}

			export function App(props) @{
				<Parent label={props.label} />
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-child-multi-root-publication.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const first = mount(client.App, { label: 'first' });
		const second = mount(client.App, { label: 'second' });
		const firstChild = first.find('.hookful-shared-child');
		const secondChild = second.find('.hookful-shared-child');

		flushSync(() => client.bumpChild());
		expect(firstChild.textContent).toBe('first:0');
		expect(secondChild.textContent).toBe('second:1');

		first.click('.hookful-shared-parent');
		flushSync(() => client.bumpChild());
		expect(first.find('.hookful-shared-child')).toBe(firstChild);
		expect(firstChild.textContent).toBe('first:1');
		expect(secondChild.textContent).toBe('second:1');

		second.click('.hookful-shared-parent');
		flushSync(() => client.bumpChild());
		expect(firstChild.textContent).toBe('first:1');
		expect(second.find('.hookful-shared-child')).toBe(secondChild);
		expect(secondChild.textContent).toBe('second:2');
		first.unmount();
		second.unmount();
	});

	it('preserves hookful child setter publication through an observable Proxy', () => {
		const source = `
			import { useState } from 'octane';

			function Child(props) @{
				const [value, setValue] = useState(0);
				props.target.setter = setValue;
				<output id="hookful-proxy-value">{value as number}</output>
			}

			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="hookful-proxy-parent" onClick={() => setTick(tick + 1)}>
						{tick as number}
					</button>
					<Child target={props.target} />
				</section>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-child-proxy-publication.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		let wasPublished = false;
		let update: ((next: (value: number) => number) => void) | undefined;
		const target = new Proxy<Record<string, unknown>>(
			{},
			{
				set(_target, key, value) {
					if (key !== 'setter') return false;
					wasPublished = true;
					update = value as (next: (current: number) => number) => void;
					return true;
				},
			},
		);
		const root = mount(client.App, { target });
		const output = root.find('#hookful-proxy-value');
		expect(wasPublished).toBe(true);
		expect(output.textContent).toBe('0');

		wasPublished = false;
		root.click('#hookful-proxy-parent');
		expect(wasPublished).toBe(true);
		expect(root.find('#hookful-proxy-value')).toBe(output);

		flushSync(() => update?.((value) => value + 1));
		expect(output.textContent).toBe('1');
		root.unmount();
	});

	it('retries a suspended hookful child before preserving its own state', async () => {
		const source = `
			import { Suspense, use, useState } from 'octane';

			function AwaitingChild(props) @{
				const [own, setOwn] = useState(0);
				const value = use(props.promise);
				<button id="hookful-suspense-value" onClick={() => setOwn(own + 1)}>
					{value + ':' + own}
				</button>
			}

			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="hookful-suspense-parent" onClick={() => setTick(tick + 1)}>
						{tick as number}
					</button>
					<Suspense fallback={<span id="hookful-suspense-pending">{'loading'}</span>}>
						<AwaitingChild promise={props.promise} />
					</Suspense>
				</section>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-child-suspense-retry.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((complete) => {
			resolve = complete;
		});
		const root = mount(client.App, { promise });
		expect(root.find('#hookful-suspense-pending').textContent).toBe('loading');
		root.click('#hookful-suspense-parent');
		expect(root.find('#hookful-suspense-pending').textContent).toBe('loading');

		await act(() => resolve('ready'));
		const child = root.find('#hookful-suspense-value');
		expect(child.textContent).toBe('ready:0');
		root.click('#hookful-suspense-value');
		expect(child.textContent).toBe('ready:1');
		root.click('#hookful-suspense-parent');
		expect(root.find('#hookful-suspense-value')).toBe(child);
		expect(child.textContent).toBe('ready:1');
		root.unmount();
	});

	it('preserves hookful child custom comparisons, refs, effects, and key resets', () => {
		const source = `
			import { memo, useEffect, useState } from 'octane';

			function Child(props) @{
				const [own, setOwn] = useState(0);
				useEffect(() => {
					props.onEffect('mount:' + props.label);
					return () => props.onEffect('cleanup:' + props.label);
				}, [props.label, props.onEffect]);
				<button id="hookful-keyed-value" ref={props.ref} onClick={() => setOwn(own + 1)}>
					{props.label + ':' + own}
				</button>
			}

			const Compared = memo(
				Child,
				(previous, next) => previous.label.toLowerCase() === next.label.toLowerCase()
					&& previous.ref === next.ref,
			);

			export function App(props) @{
				const [tick, setTick] = useState(0);
				<section>
					<button id="hookful-keyed-parent" onClick={() => setTick(tick + 1)}>
						{tick as number}
					</button>
					<Compared
						key={props.identity}
						label={props.label}
						ref={props.onRef}
						onEffect={props.onEffect}
					/>
				</section>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'hookful-child-keys-refs-comparator.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const effects: string[] = [];
		const refs: string[] = [];
		const makeRef = (label: string) => (element: Element | null) => {
			if (element !== null) {
				refs.push('attach:' + label);
				return () => refs.push('detach:' + label);
			}
		};
		const firstRef = makeRef('first');
		const secondRef = makeRef('second');
		const onEffect = (event: string) => effects.push(event);
		const root = mount(client.App, {
			identity: 'a',
			label: 'first',
			onRef: firstRef,
			onEffect,
		});
		flushEffects();
		const original = root.find('#hookful-keyed-value');
		expect(refs).toEqual(['attach:first']);
		expect(effects).toEqual(['mount:first']);
		root.click('#hookful-keyed-value');
		expect(original.textContent).toBe('first:1');

		root.update(client.App, {
			identity: 'a',
			label: 'FIRST',
			onRef: firstRef,
			onEffect,
		});
		expect(root.find('#hookful-keyed-value')).toBe(original);
		expect(original.textContent).toBe('first:1');

		root.update(client.App, {
			identity: 'a',
			label: 'second',
			onRef: secondRef,
			onEffect,
		});
		flushEffects();
		expect(root.find('#hookful-keyed-value')).toBe(original);
		expect(original.textContent).toBe('second:1');
		expect(refs).toEqual(['attach:first', 'detach:first', 'attach:second']);
		expect(effects).toEqual(['mount:first', 'cleanup:first', 'mount:second']);

		root.update(client.App, {
			identity: 'b',
			label: 'third',
			onRef: secondRef,
			onEffect,
		});
		flushEffects();
		const replacement = root.find('#hookful-keyed-value');
		expect(replacement).not.toBe(original);
		expect(replacement.textContent).toBe('third:0');
		expect(refs).toEqual([
			'attach:first',
			'detach:first',
			'attach:second',
			'detach:second',
			'attach:second',
		]);
		expect(effects).toEqual([
			'mount:first',
			'cleanup:first',
			'mount:second',
			'cleanup:second',
			'mount:third',
		]);

		root.unmount();
		flushEffects();
		expect(refs.at(-1)).toBe('detach:second');
		expect(effects.at(-1)).toBe('cleanup:third');
	});

	it('hydrates hookful child setters and preserves state and provider updates', () => {
		const source = `
			import { createContext, useContext, useState } from 'octane';

			let parentSetter = null;
			let childSetter = null;
			export const Theme = createContext('default');

			export function bumpParent() {
				if (parentSetter) parentSetter((value) => value + 1);
			}

			export function bumpChild() {
				if (childSetter) childSetter((value) => value + 1);
			}

			function Child(props) @{
				const [own, setOwn] = useState(0);
				childSetter = setOwn;
				<button id="hookful-hydrated-child">{props.label + ':' + own}</button>
			}

			function ContextReader(props) @{
				const theme = useContext(props.context);
				<span id="hookful-hydrated-context">{theme as string}</span>
			}

			function Parent(props) @{
				const [tick, setTick] = useState(0);
				parentSetter = setTick;
				<section id="hookful-hydrated-parent" data-tick={tick as number}>
					<Child label={props.label} />
					<ContextReader context={props.context} />
				</section>
			}

			export function App(props) @{
				const Context = props.context;
				<Context value={props.theme}>
					<Parent label={props.label} context={Context} />
				</Context>
			}
		`;
		const id = 'hookful-child-hydration.tsrx';
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, {
			context: server.Theme,
			label: 'server',
			theme: 'light',
		}).html;
		const originalParent = container.querySelector('#hookful-hydrated-parent');
		const originalChild = container.querySelector('#hookful-hydrated-child');
		const originalContext = container.querySelector('#hookful-hydrated-context');
		const root = hydrateRoot(container, client.App, {
			context: client.Theme,
			label: 'server',
			theme: 'light',
		});
		expect(container.querySelector('#hookful-hydrated-parent')).toBe(originalParent);
		expect(container.querySelector('#hookful-hydrated-child')).toBe(originalChild);
		expect(container.querySelector('#hookful-hydrated-context')).toBe(originalContext);
		expect(originalChild?.textContent).toBe('server:0');
		expect(originalContext?.textContent).toBe('light');

		flushSync(() => client.bumpParent());
		expect(originalParent?.getAttribute('data-tick')).toBe('1');
		expect(container.querySelector('#hookful-hydrated-child')).toBe(originalChild);

		flushSync(() => client.bumpChild());
		expect(originalChild?.textContent).toBe('server:1');

		flushSync(() =>
			root.render(client.App, {
				context: client.Theme,
				label: 'changed',
				theme: 'dark',
			}),
		);
		expect(container.querySelector('#hookful-hydrated-parent')).toBe(originalParent);
		expect(container.querySelector('#hookful-hydrated-child')).toBe(originalChild);
		expect(container.querySelector('#hookful-hydrated-context')).toBe(originalContext);
		expect(originalChild?.textContent).toBe('changed:1');
		expect(originalContext?.textContent).toBe('dark');
		root.unmount();
	});

	it('hydrates a pure hookful child and preserves both independent state updates', () => {
		const source = `
			import { useState } from 'octane';

			function Child(props) @{
				const [own, setOwn] = useState(0);
				<button id="hookful-pure-hydrated-child" onClick={() => setOwn(own + 1)}>
					{props.label + ':' + own}
				</button>
			}

			function Parent(props) @{
				const [tick, setTick] = useState(0);
				<section id="hookful-pure-hydrated-parent" data-tick={tick as number}>
					<button id="hookful-pure-hydrated-parent-update" onClick={() => setTick(tick + 1)}>
						{'parent'}
					</button>
					<Child label={props.label} />
				</section>
			}

			export function App(props) @{
				<Parent label={props.label} />
			}
		`;
		const id = 'hookful-pure-parent-child-hydration.tsrx';
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, { label: 'initial' }).html;
		const parent = container.querySelector('#hookful-pure-hydrated-parent');
		const child = container.querySelector('#hookful-pure-hydrated-child');
		const parentUpdate = container.querySelector(
			'#hookful-pure-hydrated-parent-update',
		) as HTMLButtonElement;
		const root = hydrateRoot(container, client.App, { label: 'initial' });
		expect(container.querySelector('#hookful-pure-hydrated-parent')).toBe(parent);
		expect(container.querySelector('#hookful-pure-hydrated-child')).toBe(child);
		expect(child?.textContent).toBe('initial:0');

		flushSync(() => parentUpdate.click());
		expect(parent?.getAttribute('data-tick')).toBe('1');
		expect(container.querySelector('#hookful-pure-hydrated-child')).toBe(child);

		flushSync(() => (child as HTMLButtonElement).click());
		expect(child?.textContent).toBe('initial:1');
		flushSync(() => parentUpdate.click());
		expect(parent?.getAttribute('data-tick')).toBe('2');
		expect(child?.textContent).toBe('initial:1');

		flushSync(() => root.render(client.App, { label: 'changed' }));
		expect(container.querySelector('#hookful-pure-hydrated-parent')).toBe(parent);
		expect(container.querySelector('#hookful-pure-hydrated-child')).toBe(child);
		expect(child?.textContent).toBe('changed:1');
		root.unmount();
	});

	const CONTEXT_READER = `import { useContext, useState } from 'octane';
		 import { Theme } from './theme';
		 export function Reader(props) @{
			const theme = useContext(Theme);
			<b>{(props.label + ':' + theme) as string}</b>
		 }`;

	// A component a body names through a binding, or returns from its props, is
	// unknown to the cache over that body, so it must still see a Provider change.
	it.each([
		['a local', `function Tag(props) @{ const C = props.comp; <i><C label="tag" /></i> }`],
		['a destructured prop', `function Tag({ comp: C }) @{ <i><C label="tag" /></i> }`],
		[
			'a local at the body root',
			`function Tag(props) @{ const C = props.comp; <C label="tag" /> }`,
		],
		[
			'a local inside @if',
			`function Tag(props) @{ const C = props.comp; <i>@if (C) { <C label="tag" /> }</i> }`,
		],
		[
			'a returned prop value',
			`function Tag(props) { if (props.content) return props.content; return <i>{'off'}</i>; }`,
		],
		[
			'a @switch case hole',
			`function Tag(props) @{ <i>@switch (props.content ? 'shown' : 'hidden') { @case 'shown': { {props.content} } @default: { <s /> } }</i> }`,
		],
	])('refreshes a context consumer a cached callee renders through %s', (shape, tag) => {
		const { App, Reader } = loadCompiledFixtureSource(
			`${CONTEXT_READER}
			 ${tag}
			 export function App(props) @{
				<Theme value={props.theme}><p><Tag comp={props.comp} content={props.content} /></p></Theme>
			 }`,
			{
				id: `auto-memo-bound-tag-${shape.replaceAll(' ', '-')}.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './theme': { Theme: createContext('t0') } },
			},
		);
		const content = createElement(Reader, { label: 'tag' });
		const root = mount(App, { comp: Reader, content, theme: 't1' });
		try {
			expect(root.find('b').textContent).toBe('tag:t1');
			root.update(App, { comp: Reader, content, theme: 't2' });
			expect(root.find('b').textContent).toBe('tag:t2');
		} finally {
			root.unmount();
		}
	});

	it('refreshes a context consumer an imported cached callee renders through a local tag', () => {
		const tag = loadImportedModule(
			`export function Tag(props) @{ const C = props.comp; <i><C label="tag" /></i> }`,
			'imported-bound-tag.tsrx',
		);
		const { App, Reader } = loadImportedModule(
			`${CONTEXT_READER}
			 import { Tag } from './tag';
			 export function App(props) @{
				<Theme value={props.theme}><p><Tag comp={props.comp} /></p></Theme>
			 }`,
			'imported-bound-tag-parent.tsrx',
			{ './tag': tag, './theme': { Theme: createContext('t0') } },
		);
		const root = mount(App, { comp: Reader, theme: 't1' });
		try {
			expect(root.find('b').textContent).toBe('tag:t1');
			root.update(App, { comp: Reader, theme: 't2' });
			expect(root.find('b').textContent).toBe('tag:t2');
		} finally {
			root.unmount();
		}
	});

	// The hook keeps List itself uncached, so only its whole-list cache, or the
	// row cache under an iterable the list cannot cache, skips the rows.
	it.each([
		[
			'a row local tag',
			'props.items',
			'',
			`const C = item.comp; <li><C label={item.label} /></li>`,
		],
		[
			'a parent local tag',
			'props.items',
			'const C = props.comp;',
			`<li><C label={item.label} /></li>`,
		],
		['a value hole', 'props.items', '', `<li>{item.content}</li>`],
		[
			'a parent local tag in uncached rows',
			'props.items.filter(Boolean)',
			'const C = props.comp;',
			`<li><C label={item.label} /></li>`,
		],
	])(
		'refreshes a context consumer cached list rows render through %s',
		(shape, iterable, setup, row) => {
			const { App, Reader } = loadCompiledFixtureSource(
				`${CONTEXT_READER}
			 function List(props) @{
				const [count] = useState(0);
				${setup}
				<ul data-count={count as number}>
					@for (const item of ${iterable}; key item.id) { ${row} }
				</ul>
			 }
			 export function App(props) @{
				<Theme value={props.theme}><List comp={props.comp} items={props.items} /></Theme>
			 }`,
				{
					id: `auto-memo-bound-row-${shape.replaceAll(' ', '-')}.tsrx`,
					mode: 'client',
					compileOptions: { hmr: false, dev: false },
					runtimeModules: { './theme': { Theme: createContext('t0') } },
				},
			);
			const items = [
				{ id: 1, label: 'row', comp: Reader, content: createElement(Reader, { label: 'row' }) },
			];
			const root = mount(App, { comp: Reader, items, theme: 't1' });
			try {
				expect(root.find('b').textContent).toBe('row:t1');
				root.update(App, { comp: Reader, items, theme: 't2' });
				expect(root.find('b').textContent).toBe('row:t2');
			} finally {
				root.unmount();
			}
		},
	);

	// The owner's own update clears its context aggregate, then hits the cache.
	// The hit must restore the skipped consumer's reads, or the next Provider
	// change lets the owner's memo wall bail over it.
	it.each([
		[
			'a list row hole',
			`@for (const item of props.items; key item.id) { <li>{item.content}</li> }`,
		],
		[
			'a list row tag',
			`@for (const item of props.items; key item.id) { const C = item.comp; <li><C label="r" /></li> }`,
		],
		['a callee hole', `<Slot content={props.content} />`],
		['a callee local tag', `<Tag comp={props.comp} />`],
		['a memo() consumer below a callee', `<Wrapper label={props.content} />`],
	])(
		'refreshes context below a cache hit inside a re-rendered memo() owner through %s',
		(shape, body) => {
			const { App, Reader } = loadCompiledFixtureSource(
				`import { memo } from 'octane';
			 ${CONTEXT_READER}
			 const MemoReader = memo(Reader);
			 function Slot(props) @{ <span>{props.content}</span> }
			 function Tag(props) @{ const C = props.comp; <span><C label="r" /></span> }
			 function Wrapper(props) @{ <span><MemoReader label="r" /></span> }
			 function List(props) @{
				const [tick, setTick] = useState(0);
				<ul data-tick={tick as number} onClick={() => setTick(tick + 1)}>${body}</ul>
			 }
			 const MemoList = memo(List);
			 export function App(props) @{
				<Theme value={props.theme}><MemoList items={props.items} content={props.content} comp={props.comp} /></Theme>
			 }`,
				{
					id: `auto-memo-owner-hit-${shape.replaceAll(' ', '-').replace(/[()]/g, '')}.tsrx`,
					mode: 'client',
					compileOptions: { hmr: false, dev: false },
					runtimeModules: { './theme': { Theme: createContext('t0') } },
				},
			);
			const content = createElement(Reader, { label: 'r' });
			const props = { items: [{ id: 1, comp: Reader, content }], content, comp: Reader };
			const root = mount(App, { ...props, theme: 't1' });
			try {
				root.click('ul');
				expect(root.find('ul').getAttribute('data-tick')).toBe('1');
				expect(root.find('b').textContent).toBe('r:t1');
				root.update(App, { ...props, theme: 't2' });
				expect(root.find('b').textContent).toBe('r:t2');
			} finally {
				root.unmount();
			}
		},
	);

	it('refreshes hydrated context consumers behind cached local tags and returns', () => {
		const source = `${CONTEXT_READER}
			 function Tag(props) @{ const C = props.comp; <i><C label="tag" /></i> }
			 function Returned(props) { if (props.content) return props.content; return <i>{'off'}</i>; }
			 function List(props) @{
				const [count] = useState(0);
				<ul data-count={count as number}>
					@for (const item of props.items; key item.id) {
						const C = item.comp;
						<li><C label={item.label} /></li>
					}
				</ul>
			 }
			 export function App(props) @{
				<Theme value={props.theme}>
					<p><Tag comp={props.comp} /></p>
					<List items={props.items} />
					<p><Returned content={props.content} /></p>
				</Theme>
			 }`;
		const id = 'auto-memo-bound-tag-hydration.tsrx';
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
			runtimeModules: { './theme': { Theme: ServerRuntime.createContext('t0') } },
		});
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
			runtimeModules: { './theme': { Theme: createContext('t0') } },
		});
		const props = (Reader: any, theme: string) => ({
			comp: Reader,
			content: createElement(Reader, { label: 'returned' }),
			items: [{ id: 1, label: 'row', comp: Reader }],
			theme,
		});
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, props(server.Reader, 't1')).html;
		const consumers = Array.from(container.querySelectorAll('b'));
		const clientProps = props(client.Reader, 't1');
		const root = hydrateRoot(container, client.App, clientProps);
		const texts = () =>
			Array.from(container.querySelectorAll('b'), (node, index) => {
				expect(node).toBe(consumers[index]);
				return node.textContent;
			});
		try {
			expect(texts()).toEqual(['tag:t1', 'row:t1', 'returned:t1']);
			flushSync(() => root.render(client.App, { ...clientProps, theme: 't2' }));
			expect(texts()).toEqual(['tag:t2', 'row:t2', 'returned:t2']);
		} finally {
			root.unmount();
		}
	});

	it('keeps a pure callee lite inside its cache unless the cache must refresh context', () => {
		const code = compile(LITE_CALLEE_REGION_SOURCE, 'lite-callee-region.tsrx', {
			hmr: false,
			dev: false,
		}).code;
		const middle = code.slice(code.indexOf('function Middle('), code.indexOf('const Themed'));
		expectCompilerRegion(middle);
		expect(middle).toContain('_$componentSlotLite(__s, 1, _b.a, Leaf,');
		const shell = code.slice(code.indexOf('function Shell('), code.indexOf('function App('));
		expect(shell).toMatch(/_\$componentSlotVoid\(__s, \d+, [^,]+, Frame,/);
		expect(shell).toContain('_$compilerCacheContext(');

		const client = loadCompiledFixtureSource(LITE_CALLEE_REGION_SOURCE, {
			id: 'lite-callee-region.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App, { label: 'a', theme: 'light', tick: 0, on: false });
		const leaf = root.find('#lite-region-leaf');
		const counter = root.find('#lite-region-counter');
		const themed = root.find('#lite-region-themed');
		const middleChildren = () =>
			Array.from(root.find('#lite-region-middle').children, (child) => child.id);
		expect(middleChildren()).toEqual(['lite-region-leaf', 'lite-region-counter']);
		expect(leaf.textContent).toBe('a');
		expect(counter.textContent).toBe('a/0:0');
		expect(themed.textContent).toBe('light');

		// Middle re-renders while its cache over Leaf hits.
		root.update(client.App, { label: 'a', theme: 'light', tick: 1, on: false });
		expect(root.find('#lite-region-leaf')).toBe(leaf);
		expect(leaf.textContent).toBe('a');
		expect(root.find('#lite-region-counter')).toBe(counter);
		expect(counter.textContent).toBe('a/1:0');

		root.click('#lite-region-counter');
		expect(counter.textContent).toBe('a/1:1');
		root.update(client.App, { label: 'a', theme: 'light', tick: 2, on: false });
		expect(counter.textContent).toBe('a/2:1');
		expect(root.find('#lite-region-leaf')).toBe(leaf);

		root.update(client.App, { label: 'b', theme: 'light', tick: 2, on: false });
		expect(root.find('#lite-region-leaf')).toBe(leaf);
		expect(leaf.textContent).toBe('b');
		expect(counter.textContent).toBe('b/2:1');

		root.update(client.App, { label: 'b', theme: 'light', tick: 2, on: true });
		expect(middleChildren()).toEqual([
			'lite-region-leaf',
			'lite-region-badge',
			'lite-region-counter',
		]);
		root.update(client.App, { label: 'b', theme: 'light', tick: 3, on: true });
		expect(middleChildren()).toEqual([
			'lite-region-leaf',
			'lite-region-badge',
			'lite-region-counter',
		]);
		root.update(client.App, { label: 'b', theme: 'light', tick: 3, on: false });
		expect(middleChildren()).toEqual(['lite-region-leaf', 'lite-region-counter']);
		expect(root.find('#lite-region-leaf')).toBe(leaf);
		expect(root.find('#lite-region-counter')).toBe(counter);

		// Frame's cache hits, so only its context refresh reaches the memo wall.
		root.update(client.App, { label: 'b', theme: 'dark', tick: 3, on: false });
		expect(root.find('#lite-region-themed')).toBe(themed);
		expect(themed.textContent).toBe('dark');
		expect(leaf.textContent).toBe('b');

		const container = root.container;
		root.unmount();
		expect(container.innerHTML).toBe('');
	});

	it('hydrates a pure callee kept lite inside its cache', () => {
		const id = 'lite-callee-region-hydration.tsrx';
		const server = loadCompiledFixtureSource(LITE_CALLEE_REGION_SOURCE, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadCompiledFixtureSource(LITE_CALLEE_REGION_SOURCE, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const props = { label: 'a', theme: 'light', tick: 0, on: true };
		const container = document.createElement('div');
		container.innerHTML = ServerRuntime.renderToString(server.App, props).html;
		const leaf = container.querySelector('#lite-region-leaf');
		const counter = container.querySelector('#lite-region-counter') as HTMLButtonElement;
		const themed = container.querySelector('#lite-region-themed');
		const root = hydrateRoot(container, client.App, props);
		expect(container.querySelector('#lite-region-leaf')).toBe(leaf);
		expect(container.querySelector('#lite-region-counter')).toBe(counter);
		expect(container.querySelector('#lite-region-themed')).toBe(themed);
		const badge = container.querySelector('#lite-region-badge');
		expect(badge?.previousElementSibling).toBe(leaf);
		expect(badge?.nextElementSibling).toBe(counter);

		flushSync(() => root.render(client.App, { ...props, tick: 1 }));
		expect(container.querySelector('#lite-region-badge')).toBe(badge);
		flushSync(() => counter.click());
		expect(counter.textContent).toBe('a/1:1');
		expect(container.querySelector('#lite-region-leaf')).toBe(leaf);

		flushSync(() => root.render(client.App, { label: 'b', theme: 'dark', tick: 1, on: false }));
		expect(container.querySelector('#lite-region-badge')).toBe(null);
		expect(container.querySelector('#lite-region-leaf')).toBe(leaf);
		expect(leaf?.textContent).toBe('b');
		expect(counter.textContent).toBe('b/1:1');
		expect(themed?.textContent).toBe('dark');
		root.unmount();
		expect(container.innerHTML).toBe('');
	});

	it('refreshes a context consumer a cached callee renders from a prop', () => {
		const Theme = createContext('t0');
		const { App, Reader } = loadCompiledFixtureSource(
			`import { useContext } from 'octane';
			 import { Theme } from './theme';
			 export function Reader(props) @{
				const theme = useContext(Theme);
				<b>{(props.label + ':' + theme) as string}</b>
			 }
			 function Slot(props) @{ <span>{props.content}</span> }
			 export function App(props) @{
				<Theme value={props.theme}><p><Slot content={props.content} /></p></Theme>
			 }`,
			{
				id: 'auto-memo-prop-renderable.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './theme': { Theme } },
			},
		);
		// The parent passes the same element down, so Slot's cache hits.
		const content = createElement(Reader, { label: 'slot' });
		const root = mount(App, { content, theme: 't1' });
		try {
			expect(root.find('b').textContent).toBe('slot:t1');
			root.update(App, { content, theme: 't2' });
			expect(root.find('b').textContent).toBe('slot:t2');
		} finally {
			root.unmount();
		}
	});

	// Each list skips its unchanged rows, and a filtered iterable or a selection
	// change keeps any whole-list cache from covering them. Only that skip can
	// then refresh a consumer a row renders from a value hole.
	const FILTERED = '@for (const item of props.items.filter(Boolean); key item.id)';
	const KEYED_ROWS = `@for (const item of props.items; key item.id) {
		<li class={selected === item.id ? 'on' : ''}>{item.content}</li>
	}`;
	const MAPPED_ROWS = `{props.items.filter(Boolean).map((item) => <li key={item.id}>{item.content}</li>)}`;
	function loadSkippedRows(shape: string, source: string) {
		return loadCompiledFixtureSource(
			`import { memo, useContext, useState } from 'octane';
			 import { Theme } from './theme';
			 export function Reader(props) @{
				const theme = useContext(Theme);
				<b>{(props.label + ':' + theme) as string}</b>
			 }
			 ${source}`,
			{
				id: `auto-memo-skipped-${shape.replaceAll(' ', '-')}.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './theme': { Theme: createContext('t0') } },
			},
		);
	}

	it.each([
		['item-only @for rows', `${FILTERED} { <li>{item.content}</li> }`],
		[
			'@for rows with a parent capture',
			`${FILTERED} { <li data-count={count}>{item.content}</li> }`,
		],
		['component @for rows', `${FILTERED} { <Row content={item.content} /> }`],
		['keyed selection rows', KEYED_ROWS],
		['mapped rows', MAPPED_ROWS],
	])('refreshes context consumers skipped %s render from value holes', (shape, rows) => {
		const { App, Reader } = loadSkippedRows(
			shape,
			`function Row(props) @{ <li>{props.content}</li> }
			 function List(props) @{
				const [count] = useState(0);
				const selected = props.selected;
				<ul data-count={count as number}>${rows}</ul>
			 }
			 export function App(props) @{
				<Theme value={props.theme}><List items={props.items} selected={props.selected} /></Theme>
			 }`,
		);
		const items = [1, 2, 3].map((id) => ({
			id,
			content: createElement(Reader, { label: 'r' + id }),
		}));
		const root = mount(App, { items, selected: 1, theme: 't1' });
		const texts = () =>
			Array.from(root.container.querySelectorAll('b'), (node) => node.textContent);
		try {
			expect(texts()).toEqual(['r1:t1', 'r2:t1', 'r3:t1']);
			root.update(App, { items, selected: 2, theme: 't2' });
			expect(texts()).toEqual(['r1:t2', 'r2:t2', 'r3:t2']);
		} finally {
			root.unmount();
		}
	});

	// A memoized owner's own update clears the context reads it recorded while
	// every consumer row is skipped. Unless the skipped rows restore them, the
	// owner's later bail on a Provider change strands the consumer.
	it.each([
		['@for rows', `${FILTERED} { <li>{item.content}</li> }`],
		['keyed selection rows', KEYED_ROWS],
		['mapped rows', MAPPED_ROWS],
	])('refreshes consumers in skipped %s below a locally updated memo owner', (shape, rows) => {
		const { App, Reader } = loadSkippedRows(
			`memo-owner ${shape}`,
			`function List(props) @{
				const [selected, setSelected] = useState(1);
				<ul onClick={() => setSelected(3 - selected)}>${rows}</ul>
			 }
			 const MemoList = memo(List);
			 export function App(props) @{
				<Theme value={props.theme}><MemoList items={props.items} /></Theme>
			 }`,
		);
		// Only the third row holds a consumer, so selecting the first two rows
		// never renders it.
		const items = [1, 2, 3].map((id) => ({
			id,
			content: id === 3 ? createElement(Reader, { label: 'r3' }) : 'r' + id,
		}));
		const root = mount(App, { items, theme: 't1' });
		try {
			root.click('ul');
			root.click('ul');
			expect(root.find('b').textContent).toBe('r3:t1');
			root.update(App, { items, theme: 't2' });
			expect(root.find('b').textContent).toBe('r3:t2');
		} finally {
			root.unmount();
		}
	});

	it('preserves dependency, context, child-state, and custom-comparator behavior', () => {
		const root = mount(AutoMemoApp);
		const initialOpaqueVersion = trailingVersion(root.find('.opaque').textContent);
		const initialTransitiveVersion = trailingVersion(
			root.find('#auto-transitive-live').textContent,
		);
		expect(root.find('.own-1').textContent).toBe('t0:a:0');
		// The destructured-param twin renders through the same cached-region
		// machinery and must be behaviorally indistinguishable from the
		// props-object form throughout this scenario.
		expect(root.find('.own-d1').textContent).toBe('t0:a:0');
		expect(trailingVersion(root.find('.custom').textContent)).toBe(initialOpaqueVersion);
		expect(trailingVersion(root.find('.returned-opaque-a').textContent)).toBe(initialOpaqueVersion);

		root.click('#auto-tick');
		// Opaque imports, custom comparators, and imported return-JSX components all
		// retain ordinary parent-entry semantics when a module value changes.
		expect(trailingVersion(root.find('.opaque').textContent)).toBe(initialOpaqueVersion + 1);
		expect(trailingVersion(root.find('.custom').textContent)).toBe(initialOpaqueVersion + 1);
		expect(trailingVersion(root.find('.returned-opaque-a').textContent)).toBe(
			initialOpaqueVersion + 1,
		);
		expect(trailingVersion(root.find('#auto-transitive-live').textContent)).toBe(
			initialTransitiveVersion + 1,
		);

		root.click('.own-1');
		expect(root.find('.own-1').textContent).toBe('t0:a:1');
		root.click('.own-d1');
		expect(root.find('.own-d1').textContent).toBe('t0:a:1');

		root.click('#auto-context');
		expect(root.find('.own-1').textContent).toBe('t0!:a:1');
		expect(root.find('.own-d1').textContent).toBe('t0!:a:1');
		expect(root.find('#auto-returned').textContent).toBe('returned t0!');

		root.click('#auto-item');
		expect(root.find('.own-1').textContent).toBe('t0!:a!:1');
		expect(root.find('.own-d1').textContent).toBe('t0!:a!:1');

		// A dependency miss and Provider change can commit in the same render. The
		// changed row re-enters through the keyed list, while the unchanged row must
		// still receive the context refresh despite its PURE survivor bailout.
		root.click('#auto-item-context');
		expect(root.find('.own-1').textContent).toBe('t0!!:a!!:1');
		expect(root.find('.own-2').textContent).toBe('t0!!:b:0');
		expect(root.find('.own-d1').textContent).toBe('t0!!:a!!:1');
		expect(root.find('.own-d2').textContent).toBe('t0!!:b:0');

		root.unmount();
	});

	it('keeps imported memoized row hosts focused and stateful across parent and context updates', () => {
		const root = mount(AutoMemoApp);
		const firstRow = root.find('#auto-memo-rows > li');
		const firstButton = root.find('.own-1') as HTMLButtonElement;

		root.click('.own-1');
		firstButton.focus();
		expect(document.activeElement).toBe(firstButton);

		root.click('#auto-tick');
		expect(root.find('#auto-memo-rows > li')).toBe(firstRow);
		expect(root.find('.own-1')).toBe(firstButton);
		expect(document.activeElement).toBe(firstButton);
		expect(firstButton.textContent).toBe('t0:a:1');

		root.click('#auto-item-context');
		expect(root.find('#auto-memo-rows > li')).toBe(firstRow);
		expect(root.find('.own-1')).toBe(firstButton);
		expect(document.activeElement).toBe(firstButton);
		expect(firstButton.textContent).toBe('t0!:a!:1');

		root.click('.own-1');
		expect(firstButton.textContent).toBe('t0!:a!:2');
		root.unmount();
	});

	it('re-renders keyed survivors when a captured parent local changes', () => {
		const root = mount(ParentCaptureApp);
		const cells = () =>
			[...root.container.querySelectorAll('.cell')].map((node) => node.textContent);
		expect(cells()).toEqual(['a!', 'b!']);

		// Identity-equal items, changed parent capture: every survivor re-renders.
		root.click('#capture-suffix');
		expect(cells()).toEqual(['a!!', 'b!!']);

		// Changed item, unchanged capture: only the keyed identity drives the miss.
		root.click('#capture-item');
		expect(cells()).toEqual(['ax!!', 'b!!']);

		root.unmount();
	});

	it('preserves keyed rows while switching between native, custom, and subclass map receivers', () => {
		const events: string[] = [];
		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				if (this !== customRows) throw new Error('custom map lost its receiver');
				events.push('custom:start');
				const mapped = [callback(items[1]!, 6), callback(items[0]!, 3)];
				const descriptor = mapped[0] as {
					type: unknown;
					key: unknown;
					props: { 'data-callback': unknown };
				};
				events.push(
					`custom:descriptor:${String(descriptor.type)}:${String(descriptor.key)}:${String(
						descriptor.props['data-callback'],
					)}`,
				);
				events.push('custom:end');
				return mapped;
			},
		};

		class SubclassRows extends Array<(typeof items)[number]> {
			override map<T>(
				callback: (
					item: (typeof items)[number],
					index: number,
					array: (typeof items)[number][],
				) => T,
				thisArg?: unknown,
			): T[] {
				if (this !== subclassRows) throw new Error('subclass map lost its receiver');
				events.push('subclass:start');
				const mapped = [
					callback.call(thisArg, this[0]!, 8, this),
					callback.call(thisArg, this[1]!, 4, this),
				];
				events.push('subclass:end');
				return mapped;
			}
		}

		const subclassRows = new SubclassRows(items[0]!, items[1]!);
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows: items, prefix: 'native', onItem });
		const originalRows = root.findAll('#tsx-custom-map-rows li');
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows: customRows, prefix: 'custom', onItem });
		expect(events).toEqual([
			'custom:start',
			'callback:2:6',
			'callback:1:3',
			'custom:descriptor:li:2:2:6',
			'custom:end',
		]);
		expect(root.findAll('#tsx-custom-map-rows li')).toEqual([originalRows[1], originalRows[0]]);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'custom:6:second',
			'custom:3:first',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows: subclassRows, prefix: 'subclass', onItem });
		expect(events).toEqual(['subclass:start', 'callback:1:8', 'callback:2:4', 'subclass:end']);
		expect(root.findAll('#tsx-custom-map-rows li')).toEqual(originalRows);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'subclass:8:first',
			'subclass:4:second',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows: items, prefix: 'native again', onItem });
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-custom-map-rows li')).toEqual(originalRows);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'native again:0:first',
			'native again:1:second',
		]);
		root.unmount();
	});

	it('replaces incompatible keyed host rows when a custom map switches to native rendering', () => {
		const source = `
			function TaggedMapApp(props) {
				const rows = props.rows;
				return (
					<ul id="tsx-tagged-map-rows">
						{rows.map((item, index) => (
							<li
								key={item.id}
								data-native={props.onItem(item.id, index)}
								onClick={() => props.onClick(item.id)}
							>
								{props.prefix + ':' + index + ':' + item.label}
							</li>
						))}
					</ul>
				);
			}
			export const App = TaggedMapApp;
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'tsx-tagged-map-transition.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const events: string[] = [];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				if (this !== customRows) throw new Error('tagged map lost its receiver');
				events.push('custom:start');
				callback(items[0]!, 7);
				const compatible = callback(items[1]!, 3);
				events.push('custom:end');
				return [
					createElement(
						'span',
						{
							key: 1,
							'data-custom': 'wrong-tag',
							onClick: () => events.push('custom:click'),
						},
						'custom:first',
					) as T,
					compatible,
				];
			},
		};
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const onClick = (id: number) => events.push(`native:click:${id}`);
		const root = mount(client.App, { rows: customRows, prefix: 'custom', onItem, onClick });
		expect(events).toEqual(['custom:start', 'callback:1:7', 'callback:2:3', 'custom:end']);
		const originalRows = root.findAll('#tsx-tagged-map-rows > *');
		expect(originalRows.map((row) => row.tagName)).toEqual(['SPAN', 'LI']);
		expect(originalRows.map((row) => row.textContent)).toEqual(['custom:first', 'custom:3:second']);
		root.click('[data-custom="wrong-tag"]');
		expect(events.at(-1)).toBe('custom:click');

		events.length = 0;
		root.update(client.App, { rows: items, prefix: 'native', onItem, onClick });
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);
		const nativeRows = root.findAll('#tsx-tagged-map-rows > *');
		expect(nativeRows.map((row) => row.tagName)).toEqual(['LI', 'LI']);
		expect(nativeRows[0]).not.toBe(originalRows[0]);
		expect(nativeRows[1]).toBe(originalRows[1]);
		expect(nativeRows.map((row) => row.getAttribute('data-native'))).toEqual(['1:0', '2:1']);
		expect(nativeRows.map((row) => row.textContent)).toEqual(['native:0:first', 'native:1:second']);
		root.click('[data-native="1:0"]');
		expect(events.at(-1)).toBe('native:click:1');
		root.unmount();
	});

	it.each([
		{
			shape: 'dynamic text',
			content: "{props.prefix + ':' + index + ':' + item.label}",
			expected: ['native:0:first', 'native:1:second'],
		},
		{
			shape: 'empty content',
			content: '',
			expected: ['', ''],
		},
		{
			shape: 'nested static host and dynamic text',
			content: '<strong data-child="native">{item.label}</strong>{props.prefix + \':\' + index}',
			expected: ['firstnative:0', 'secondnative:1'],
		},
	])(
		'repairs $shape inside preserved keyed hosts when a custom map switches to native rendering',
		({ shape, content, expected }) => {
			const source = `
				function StructuredMapApp(props) {
					const rows = props.rows;
					return (
						<ul id="tsx-structured-map-rows">
							{rows.map((item, index) => (
								<li
									key={item.id}
									data-native={props.onItem(item.id, index)}
									onClick={() => props.onClick(item.id)}
								>${content}</li>
							))}
						</ul>
					);
				}
				export const App = StructuredMapApp;
			`;
			const client = loadCompiledFixtureSource(source, {
				id: `tsx-structured-map-${shape.replaceAll(' ', '-')}.tsx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const items = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			const events: string[] = [];
			const staleRefs: (Element | null)[] = [];
			const customRows = {
				map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
					if (this !== customRows) throw new Error('structured map lost its receiver');
					events.push('custom:start');
					callback(items[0]!, 7);
					const compatible = callback(items[1]!, 3);
					events.push('custom:end');
					return [
						createElement(
							'li',
							{
								key: 1,
								'data-custom': 'stale',
								onClick: () => events.push('custom:click'),
							},
							createElement(
								'span',
								{
									'data-stale': 'child',
									ref: (value: Element | null) => staleRefs.push(value),
								},
								'stale',
							),
							'legacy',
						) as T,
						compatible,
					];
				},
			};
			const onItem = (id: number, index: number): string => {
				events.push(`callback:${id}:${index}`);
				return `${id}:${index}`;
			};
			const onClick = (id: number) => events.push(`native:click:${id}`);
			const root = mount(client.App, { rows: customRows, prefix: 'custom', onItem, onClick });
			expect(events).toEqual(['custom:start', 'callback:1:7', 'callback:2:3', 'custom:end']);
			const originalRows = root.findAll('#tsx-structured-map-rows > li');
			const staleChild = root.find('[data-stale="child"]');
			expect(staleRefs).toEqual([staleChild]);
			expect(originalRows[0]?.textContent).toBe('stalelegacy');
			root.click('[data-custom="stale"]');
			expect(events.at(-1)).toBe('custom:click');

			events.length = 0;
			root.update(client.App, { rows: items, prefix: 'native', onItem, onClick });
			expect(events).toEqual(['callback:1:0', 'callback:2:1']);
			const nativeRows = root.findAll('#tsx-structured-map-rows > li');
			expect(nativeRows).toEqual(originalRows);
			expect(nativeRows.map((row) => row.textContent)).toEqual(expected);
			expect(nativeRows.map((row) => row.getAttribute('data-native'))).toEqual(['1:0', '2:1']);
			expect(root.findAll('[data-stale="child"]')).toHaveLength(0);
			expect(staleRefs).toEqual([staleChild, null]);
			if (shape === 'nested static host and dynamic text') {
				expect(nativeRows.map((row) => row.querySelector('strong')?.textContent)).toEqual([
					'first',
					'second',
				]);
			}
			root.click('[data-native="1:0"]');
			expect(events.at(-1)).toBe('native:click:1');
			root.unmount();
		},
	);

	it('preserves child state, context, and callback indices while map receivers change', () => {
		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				return [callback(items[1]!, 7), callback(items[0]!, 3)];
			},
		};
		const root = mount(TsxStatefulMappedApp, {
			rows: items,
			prefix: 'native',
			theme: 't0',
		});
		const first = root.find('.own-1');
		const second = root.find('.own-2');
		root.click('.own-1');
		expect(first.textContent).toBe('t0:native:0:first:1');

		root.update(TsxStatefulMappedApp, {
			rows: customRows,
			prefix: 'custom',
			theme: 't1',
		});
		expect(root.findAll('#tsx-stateful-mapped-rows button')).toEqual([second, first]);
		expect(first.textContent).toBe('t1:custom:3:first:1');
		expect(second.textContent).toBe('t1:custom:7:second:0');

		root.update(TsxStatefulMappedApp, {
			rows: items,
			prefix: 'native again',
			theme: 't2',
		});
		expect(root.findAll('#tsx-stateful-mapped-rows button')).toEqual([first, second]);
		expect(first.textContent).toBe('t2:native again:0:first:1');
		expect(second.textContent).toBe('t2:native again:1:second:0');
		root.unmount();
	});

	it('preserves keyed component state and effects across native and custom map receivers', () => {
		const compiled = compile(
			`import { Row } from './row';
			export function App(props) {
				const rows = props.rows;
				return <ul>{rows.map((item, index) => <Row key={item.id} label={index} />)}</ul>;
			}`,
			'tsx-mapped-component-roundtrip.tsx',
			{ hmr: false, dev: false },
		).code;
		expect(compiled).toContain('mapSlot');
		expect(compiled).toContain('componentSlot');

		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const calls: string[] = [];
		const effects: string[] = [];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				if (this !== customRows) throw new Error('component map lost its receiver');
				calls.push('custom:start');
				const mapped = [callback(items[1]!, 7), callback(items[0]!, 3)];
				const first = mapped[0] as { type: unknown; key: unknown; props: { id: unknown } };
				calls.push(`custom:component:${typeof first.type}:${String(first.key)}:${first.props.id}`);
				calls.push('custom:end');
				return mapped;
			},
		};
		const onEffect = (event: string) => effects.push(event);
		const onItem = (id: number, index: number): string => {
			calls.push(`callback:${id}:${index}`);
			return String(index);
		};
		const root = mount(TsxMappedComponentApp, {
			rows: items,
			prefix: 'native',
			theme: 't0',
			onEffect,
			onItem,
		});
		flushEffects();
		const first = root.find('.tracked-own-1');
		const second = root.find('.tracked-own-2');
		expect(calls).toEqual(['callback:1:0', 'callback:2:1']);
		expect(effects).toEqual(['mount:1', 'mount:2']);
		root.click('.tracked-own-1');
		expect(first.textContent).toBe('t0:native:0:first:1');

		calls.length = 0;
		root.update(TsxMappedComponentApp, {
			rows: customRows,
			prefix: 'custom',
			theme: 't1',
			onEffect,
			onItem,
		});
		flushEffects();
		expect(calls).toEqual([
			'custom:start',
			'callback:2:7',
			'callback:1:3',
			'custom:component:function:2:2',
			'custom:end',
		]);
		expect(root.findAll('#tsx-mapped-component-rows button')).toEqual([second, first]);
		expect(first.textContent).toBe('t1:custom:3:first:1');
		expect(second.textContent).toBe('t1:custom:7:second:0');
		expect(effects).toEqual(['mount:1', 'mount:2']);

		calls.length = 0;
		root.update(TsxMappedComponentApp, {
			rows: items,
			prefix: 'native again',
			theme: 't2',
			onEffect,
			onItem,
		});
		flushEffects();
		expect(calls).toEqual(['callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-mapped-component-rows button')).toEqual([first, second]);
		expect(first.textContent).toBe('t2:native again:0:first:1');
		expect(second.textContent).toBe('t2:native again:1:second:0');
		expect(effects).toEqual(['mount:1', 'mount:2']);

		root.unmount();
		flushEffects();
		expect(effects.slice(2).toSorted()).toEqual(['cleanup:1', 'cleanup:2']);
	});

	it('preserves components first mounted by a custom map when native maps take ownership', () => {
		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const calls: string[] = [];
		const effects: string[] = [];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				if (this !== customRows) throw new Error('initial component map lost its receiver');
				calls.push('custom:map');
				return [callback(items[1]!, 8), callback(items[0]!, 4)];
			},
		};
		const onEffect = (event: string) => effects.push(event);
		const onItem = (id: number, index: number): string => {
			calls.push(`callback:${id}:${index}`);
			return String(index);
		};
		const root = mount(TsxMappedComponentApp, {
			rows: customRows,
			prefix: 'custom',
			theme: 't0',
			onEffect,
			onItem,
		});
		flushEffects();
		const first = root.find('.tracked-own-1');
		const second = root.find('.tracked-own-2');
		expect(calls).toEqual(['custom:map', 'callback:2:8', 'callback:1:4']);
		expect(root.findAll('#tsx-mapped-component-rows button')).toEqual([second, first]);
		expect(effects).toEqual(['mount:2', 'mount:1']);
		root.click('.tracked-own-2');
		expect(second.textContent).toBe('t0:custom:8:second:1');

		calls.length = 0;
		root.update(TsxMappedComponentApp, {
			rows: items,
			prefix: 'native',
			theme: 't1',
			onEffect,
			onItem,
		});
		flushEffects();
		expect(calls).toEqual(['callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-mapped-component-rows button')).toEqual([first, second]);
		expect(first.textContent).toBe('t1:native:0:first:0');
		expect(second.textContent).toBe('t1:native:1:second:1');
		expect(effects).toEqual(['mount:2', 'mount:1']);

		root.unmount();
		flushEffects();
		expect(effects.slice(2).toSorted()).toEqual(['cleanup:1', 'cleanup:2']);
	});

	it('reconciles mixed custom-map host and empty results before restoring keyed components', () => {
		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const effects: string[] = [];
		const customRows = {
			map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
				if (this !== customRows) throw new Error('mixed component map lost its receiver');
				const first = callback(items[0]!, 0);
				callback(items[1]!, 1);
				return [
					first,
					createElement('li', { key: 2, 'data-mixed': 'host' }, 'host replacement') as T,
					null as T,
				];
			},
		};
		const onEffect = (event: string) => effects.push(event);
		const onItem = (_id: number, index: number): string => String(index);
		const root = mount(TsxMappedComponentApp, {
			rows: items,
			prefix: 'native',
			theme: 't0',
			onEffect,
			onItem,
		});
		flushEffects();
		const first = root.find('.tracked-own-1');
		root.click('.tracked-own-1');
		expect(effects).toEqual(['mount:1', 'mount:2']);

		root.update(TsxMappedComponentApp, {
			rows: customRows,
			prefix: 'mixed',
			theme: 't1',
			onEffect,
			onItem,
		});
		flushEffects();
		expect(root.find('.tracked-own-1')).toBe(first);
		expect(first.textContent).toBe('t1:mixed:0:first:1');
		expect(root.findAll('.tracked-own-2')).toHaveLength(0);
		expect(root.find('[data-mixed="host"]').textContent).toBe('host replacement');
		expect(effects).toEqual(['mount:1', 'mount:2', 'cleanup:2']);

		root.update(TsxMappedComponentApp, {
			rows: items,
			prefix: 'restored',
			theme: 't2',
			onEffect,
			onItem,
		});
		flushEffects();
		expect(root.find('.tracked-own-1')).toBe(first);
		expect(first.textContent).toBe('t2:restored:0:first:1');
		expect(root.find('.tracked-own-2').textContent).toBe('t2:restored:1:second:0');
		expect(root.findAll('[data-mixed="host"]')).toHaveLength(0);
		expect(effects).toEqual(['mount:1', 'mount:2', 'cleanup:2', 'mount:2']);

		root.unmount();
		flushEffects();
		expect(effects.filter((event) => event === 'cleanup:1')).toHaveLength(1);
		expect(effects.filter((event) => event === 'cleanup:2')).toHaveLength(2);
	});

	// A custom map can turn a keyed host row into a component. A row first mounted
	// as host markup is its own range; a row that replaced a component sits in the
	// component's range. A held root render keeps the committed host row until the
	// component can commit.
	it.each([
		{ firstRows: 'host', hold: false },
		{ firstRows: 'host', hold: true },
		{ firstRows: 'components', hold: true },
	])(
		'replaces a keyed custom-map host row with a component (first rows: $firstRows, held: $hold)',
		async ({ firstRows, hold }) => {
			const items = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			let open!: (value: string) => void;
			const gate = new Promise<string>((resolve) => {
				open = resolve;
			});
			const Gate = (props: { gate: Promise<string> }) => {
				use(props.gate);
				return null;
			};
			const effects: string[] = [];
			const mixedRows = {
				map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
					return [
						callback(items[0]!, 0),
						createElement('li', { key: 2, 'data-mixed': 'host' }, 'host') as T,
					];
				},
			};
			const componentRows = {
				map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
					const rows = [callback(items[0]!, 0), callback(items[1]!, 1)];
					if (hold) rows.push(createElement(Gate, { key: 3, gate }) as T);
					return rows;
				},
			};
			const onEffect = (event: string) => effects.push(event);
			const onItem = (_id: number, index: number): string => String(index);
			const props = { prefix: 'mixed', theme: 't0', onEffect, onItem };
			const root = mount(TsxMappedComponentApp, {
				...props,
				rows: firstRows === 'host' ? mixedRows : items,
			});
			if (firstRows === 'components')
				root.update(TsxMappedComponentApp, { ...props, rows: mixedRows });
			flushEffects();
			const first = root.find('.tracked-own-1');
			root.click('.tracked-own-1');
			const host = root.find('[data-mixed="host"]');
			const committed = effects.length;

			root.update(TsxMappedComponentApp, {
				...props,
				rows: componentRows,
				prefix: 'components',
				theme: 't1',
			});
			flushEffects();
			if (hold) {
				expect(root.find('[data-mixed="host"]')).toBe(host);
				expect(first.textContent).toBe('t0:mixed:0:first:1');
				expect(root.findAll('.tracked-own-2')).toHaveLength(0);
				expect(effects.slice(committed)).toEqual([]);
				open('ready');
				await gate;
				await Promise.resolve();
				flushEffects();
			}
			expect(host.isConnected).toBe(false);
			expect(root.find('.tracked-own-1')).toBe(first);
			expect(first.textContent).toBe('t1:components:0:first:1');
			expect(root.find('.tracked-own-2').textContent).toBe('t1:components:1:second:0');
			expect(effects.slice(committed)).toEqual(['mount:2']);

			root.unmount();
			flushEffects();
			expect(effects.slice(committed + 1).toSorted()).toEqual(['cleanup:1', 'cleanup:2']);
		},
	);

	it.each([
		{ serverReceiver: 'native', clientReceiver: 'custom' },
		{ serverReceiver: 'custom', clientReceiver: 'native' },
	])(
		'adopts keyed component rows when server rendering uses $serverReceiver map and hydration uses $clientReceiver map',
		({ serverReceiver, clientReceiver }) => {
			const { server, client } = loadMappedComponentHydrationComponents();
			const items = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			const events: string[] = [];
			const customRows = {
				map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
					if (this !== customRows) throw new Error('hydrated component map lost its receiver');
					events.push('custom:start');
					const mapped = [callback(items[0]!, 0), callback(items[1]!, 1)];
					const first = mapped[0] as { type: unknown; key: unknown };
					events.push(`custom:component:${typeof first.type}:${String(first.key)}`);
					events.push('custom:end');
					return mapped;
				},
			};
			const onItem = (id: number, index: number): string => {
				events.push(`callback:${id}:${index}`);
				return String(index);
			};
			const serverRows = serverReceiver === 'native' ? items : customRows;
			const clientRows = clientReceiver === 'native' ? items : customRows;
			const serverProps = {
				rows: serverRows,
				prefix: 'hydrated',
				theme: 't0',
				onItem,
			};
			const clientProps = { ...serverProps, rows: clientRows };
			const { html } = ServerRuntime.renderToString(server.App, serverProps);
			expect(events).toEqual([
				...(serverReceiver === 'custom' ? ['custom:start'] : []),
				'callback:1:0',
				'callback:2:1',
				...(serverReceiver === 'custom' ? ['custom:component:function:1', 'custom:end'] : []),
			]);

			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			const originalRows = Array.from(container.querySelectorAll('li'));
			const originalButtons = Array.from(container.querySelectorAll('button'));
			expect(originalButtons.map((button) => button.textContent)).toEqual([
				't0:hydrated:0:first:0',
				't0:hydrated:1:second:0',
			]);

			events.length = 0;
			const root = hydrateRoot(container, client.App as any, clientProps);
			flushSync(() => {});
			expect(events).toEqual([
				...(clientReceiver === 'custom' ? ['custom:start'] : []),
				'callback:1:0',
				'callback:2:1',
				...(clientReceiver === 'custom' ? ['custom:component:function:1', 'custom:end'] : []),
			]);
			expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
			expect(Array.from(container.querySelectorAll('button'))).toEqual(originalButtons);

			flushSync(() => originalButtons[0]!.click());
			expect(originalButtons[0]!.textContent).toBe('t0:hydrated:0:first:1');

			events.length = 0;
			root.render(client.App, {
				...clientProps,
				rows: clientReceiver === 'native' ? customRows : items,
				prefix: 'switched',
				theme: 't1',
			});
			flushSync(() => {});
			expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
			expect(Array.from(container.querySelectorAll('button'))).toEqual(originalButtons);
			expect(originalButtons[0]!.textContent).toBe('t1:switched:0:first:1');

			root.render(client.App, {
				...clientProps,
				rows: [items[1]!, items[0]!],
				prefix: 'reordered',
				theme: 't2',
			});
			flushSync(() => {});
			expect(Array.from(container.querySelectorAll('li'))).toEqual([
				originalRows[1],
				originalRows[0],
			]);
			expect(Array.from(container.querySelectorAll('button'))).toEqual([
				originalButtons[1],
				originalButtons[0],
			]);
			expect(originalButtons[0]!.textContent).toBe('t2:reordered:1:first:1');
			root.unmount();
			container.remove();
		},
	);

	it('preserves keyed survivors and callback indices across dense and sparse array transitions', () => {
		const events: string[] = [];
		const denseRows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const sparseRows: typeof denseRows = [];
		sparseRows[1] = denseRows[0]!;
		sparseRows[3] = denseRows[1]!;
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows: denseRows, prefix: 'dense', onItem });
		const originalRows = root.findAll('#tsx-custom-map-rows li');
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows: sparseRows, prefix: 'sparse', onItem });
		expect(events).toEqual(['callback:1:1', 'callback:2:3']);
		expect(root.findAll('#tsx-custom-map-rows li')).toEqual(originalRows);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'sparse:1:first',
			'sparse:3:second',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows: denseRows, prefix: 'dense again', onItem });
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-custom-map-rows li')).toEqual(originalRows);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'dense again:0:first',
			'dense again:1:second',
		]);
		root.unmount();
	});

	it('adopts server-rendered custom map output without changing receiver or callback semantics', () => {
		const { server, client } = loadMappedHydrationComponents();
		const events: string[] = [];
		const rows = {
			map<T>(callback: (item: { id: number; label: string }, index: number) => T): T[] {
				if (this !== rows) throw new Error('hydration map lost its receiver');
				events.push('map:start');
				const output = [
					callback({ id: 2, label: 'second' }, 6),
					callback({ id: 1, label: 'first' }, 2),
				];
				events.push('map:end');
				return output;
			},
		};
		const onItem = (itemId: number, index: number): string => {
			events.push(`callback:${itemId}:${index}`);
			return `${itemId}:${index}`;
		};
		const props = { rows, prefix: 'hydrated', onItem };
		const { html } = ServerRuntime.renderToString(server.App, props);
		expect(events).toEqual(['map:start', 'callback:2:6', 'callback:1:2', 'map:end']);

		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML = html;
		const originalRows = Array.from(container.querySelectorAll('li'));
		expect(originalRows.map((row) => row.textContent)).toEqual([
			'hydrated:6:second',
			'hydrated:2:first',
		]);

		events.length = 0;
		const root = hydrateRoot(container, client.App as any, props);
		flushSync(() => {});
		expect(events).toEqual(['map:start', 'callback:2:6', 'callback:1:2', 'map:end']);
		expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
		expect(originalRows.map((row) => row.getAttribute('data-callback'))).toEqual(['2:6', '1:2']);
		root.unmount();
		container.remove();
	});

	it.each(['native', 'custom', 'inherited'] as const)(
		'hydrates packed rows from a %s sparse map without replacing server-rendered nodes',
		(receiver) => {
			const { server, client } = loadMappedHydrationComponents();
			const items = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
				{ id: 3, label: 'third' },
			];
			const events: string[] = [];
			let rows: unknown;
			let expectedEvents: string[];
			let expectedText: string[];

			if (receiver === 'native') {
				const sparse: (typeof items)[number][] = [];
				sparse[1] = items[0]!;
				sparse[3] = items[1]!;
				rows = sparse;
				expectedEvents = ['callback:1:1', 'callback:2:3'];
				expectedText = ['hydrated:1:first', 'hydrated:3:second'];
			} else if (receiver === 'custom') {
				const customRows = {
					map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
						if (this !== customRows) throw new Error('sparse map lost its receiver');
						events.push('custom:start');
						const sparse: T[] = [];
						sparse[1] = callback(items[1]!, 7);
						sparse[3] = callback(items[0]!, 3);
						events.push('custom:end');
						return sparse;
					},
				};
				rows = customRows;
				expectedEvents = ['custom:start', 'callback:2:7', 'callback:1:3', 'custom:end'];
				expectedText = ['hydrated:7:second', 'hydrated:3:first'];
			} else {
				const inherited = Object.create(Array.prototype) as object;
				Object.defineProperty(inherited, '1', {
					configurable: true,
					get() {
						events.push('get:inherited');
						return items[1]!;
					},
				});
				const sparse: (typeof items)[number][] = [];
				sparse[0] = items[0]!;
				sparse[3] = items[2]!;
				Object.setPrototypeOf(sparse, inherited);
				rows = sparse;
				expectedEvents = ['callback:1:0', 'get:inherited', 'callback:2:1', 'callback:3:3'];
				expectedText = ['hydrated:0:first', 'hydrated:1:second', 'hydrated:3:third'];
			}

			const onItem = (itemId: number, index: number): string => {
				events.push(`callback:${itemId}:${index}`);
				return `${itemId}:${index}`;
			};
			const props = { rows, prefix: 'hydrated', onItem };
			const { html } = ServerRuntime.renderToString(server.App, props);
			expect(events).toEqual(expectedEvents);

			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			const list = container.querySelector('ul')!;
			const originalRows = Array.from(list.querySelectorAll('li'));
			expect(originalRows.map((row) => row.textContent)).toEqual(expectedText);

			events.length = 0;
			const root = hydrateRoot(container, client.App as any, props);
			flushSync(() => {});
			expect(events).toEqual(expectedEvents);
			expect(Array.from(list.querySelectorAll('li'))).toEqual(originalRows);
			expect(originalRows.map((row) => row.textContent)).toEqual(expectedText);
			root.unmount();
			container.remove();
		},
	);

	it('serializes native mapped host rows without per-item hydration comments', () => {
		const { server } = loadMappedHydrationComponents();
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
			{ id: 3, label: 'third' },
		];
		const { html } = ServerRuntime.renderToString(server.App, {
			rows,
			prefix: 'server',
			onItem: (id: number, index: number) => `${id}:${index}`,
		});
		const container = document.createElement('div');
		container.innerHTML = html;
		const list = container.querySelector('ul')!;

		expect(Array.from(list.children).map((row) => row.textContent)).toEqual([
			'server:0:first',
			'server:1:second',
			'server:2:third',
		]);
		expect(Array.from(list.childNodes).filter((node) => node.nodeType === 8)).toHaveLength(2);
	});

	it.each([
		{ serverReceiver: 'native', clientReceiver: 'custom' },
		{ serverReceiver: 'custom', clientReceiver: 'native' },
	])(
		'adopts keyed rows when server rendering uses $serverReceiver map and hydration uses $clientReceiver map',
		({ serverReceiver, clientReceiver }) => {
			const { server, client } = loadMappedHydrationComponents();
			const items = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			const events: string[] = [];
			const customRows = {
				map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
					events.push('custom:map');
					return items.map(callback);
				},
			};
			const onItem = (itemId: number, index: number): string => {
				events.push(`callback:${itemId}:${index}`);
				return `${itemId}:${index}`;
			};
			const serverRows = serverReceiver === 'native' ? items : customRows;
			const clientRows = clientReceiver === 'native' ? items : customRows;
			const serverProps = { rows: serverRows, prefix: 'hydrated', onItem };
			const clientProps = { rows: clientRows, prefix: 'hydrated', onItem };
			const { html } = ServerRuntime.renderToString(server.App, serverProps);
			expect(events).toEqual([
				...(serverReceiver === 'custom' ? ['custom:map'] : []),
				'callback:1:0',
				'callback:2:1',
			]);

			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			const originalRows = Array.from(container.querySelectorAll('li'));
			expect(originalRows.map((row) => row.textContent)).toEqual([
				'hydrated:0:first',
				'hydrated:1:second',
			]);

			events.length = 0;
			const root = hydrateRoot(container, client.App as any, clientProps);
			flushSync(() => {});
			expect(events).toEqual([
				...(clientReceiver === 'custom' ? ['custom:map'] : []),
				'callback:1:0',
				'callback:2:1',
			]);
			expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);

			events.length = 0;
			root.render(client.App, {
				rows: [items[1], items[0]],
				prefix: 'reordered',
				onItem,
			});
			flushSync(() => {});
			expect(events.toSorted()).toEqual(['callback:1:1', 'callback:2:0']);
			expect(Array.from(container.querySelectorAll('li'))).toEqual([
				originalRows[1],
				originalRows[0],
			]);
			expect(Array.from(container.querySelectorAll('li')).map((row) => row.textContent)).toEqual([
				'reordered:0:second',
				'reordered:1:first',
			]);
			root.unmount();
			container.remove();
		},
	);

	it.each(['Array', 'Object', 'Reflect', 'globalThis'])(
		'preserves client rendering and server hydration when a module binding shadows %s',
		(binding) => {
			const source = `
				const ${binding} = null;
				function ShadowedMapApp(props) {
					return (
						<ul id="tsx-shadowed-map">
							{props.rows.map((item, index) => (
								<li key={item.id}>{props.prefix + ':' + index + ':' + item.label}</li>
							))}
						</ul>
					);
				}
				export const App = ShadowedMapApp;
			`;
			const id = `tsx-shadowed-${binding}.tsx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const rows = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];

			const mounted = mount(client.App, { rows, prefix: 'mounted' });
			expect(mounted.findAll('#tsx-shadowed-map li').map((row) => row.textContent)).toEqual([
				'mounted:0:first',
				'mounted:1:second',
			]);
			mounted.update(client.App, { rows, prefix: 'updated' });
			expect(mounted.findAll('#tsx-shadowed-map li').map((row) => row.textContent)).toEqual([
				'updated:0:first',
				'updated:1:second',
			]);
			mounted.unmount();

			const server = loadCompiledFixtureSource(source, {
				id,
				mode: 'server',
				compileOptions: { hmr: false, dev: false },
			});
			const props = { rows, prefix: 'hydrated' };
			const { html } = ServerRuntime.renderToString(server.App, props);
			const container = document.createElement('div');
			document.body.appendChild(container);
			container.innerHTML = html;
			const originalRows = Array.from(container.querySelectorAll('li'));
			expect(originalRows.map((row) => row.textContent)).toEqual([
				'hydrated:0:first',
				'hydrated:1:second',
			]);

			const root = hydrateRoot(container, client.App as any, props);
			flushSync(() => {});
			expect(Array.from(container.querySelectorAll('li'))).toEqual(originalRows);
			root.render(client.App, { rows: [rows[1], rows[0]], prefix: 'reordered' });
			flushSync(() => {});
			expect(Array.from(container.querySelectorAll('li'))).toEqual([
				originalRows[1],
				originalRows[0],
			]);
			expect(Array.from(container.querySelectorAll('li')).map((row) => row.textContent)).toEqual([
				'reordered:0:second',
				'reordered:1:first',
			]);
			root.unmount();
			container.remove();
		},
	);

	it('honors an own map override on an ordinary Array instance', () => {
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];

		Object.defineProperty(rows, 'map', {
			configurable: true,
			get() {
				events.push('instance:get');
				return function map<T>(
					this: typeof rows,
					callback: (item: (typeof rows)[number], index: number, array: typeof rows) => T,
					thisArg?: unknown,
				): T[] {
					if (this !== rows) throw new Error('instance map lost its receiver');
					events.push('instance:start');
					const result = [
						callback.call(thisArg, rows[1]!, 5, rows),
						callback.call(thisArg, rows[0]!, 2, rows),
					];
					events.push('instance:end');
					return result;
				};
			},
		});

		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows, prefix: 'instance', onItem });
		expect(events).toEqual([
			'instance:get',
			'instance:start',
			'callback:2:5',
			'callback:1:2',
			'instance:end',
		]);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'instance:5:second',
			'instance:2:first',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows, prefix: 'updated instance', onItem });
		expect(events).toEqual([
			'instance:get',
			'instance:start',
			'callback:2:5',
			'callback:1:2',
			'instance:end',
		]);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'updated instance:5:second',
			'updated instance:2:first',
		]);
		root.unmount();
	});

	it('restores native mapped order when a stable array loses its own map override', () => {
		const source = `
			function StableMapReceiverApp(props) {
				const rows = props.rows;
				return (
					<ul id="tsx-stable-map-receiver">
						{rows.map((item) => <li key={item.id}>{item.label}</li>)}
					</ul>
				);
			}
			export const App = StableMapReceiverApp;
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'tsx-stable-map-receiver.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const props = { rows };
		const events: string[] = [];
		const root = mount(client.App, props);
		const originalRows = root.findAll('#tsx-stable-map-receiver li');
		expect(originalRows.map((row) => row.textContent)).toEqual(['first', 'second']);

		try {
			Object.defineProperty(rows, 'map', {
				configurable: true,
				value<T>(
					this: typeof rows,
					callback: (item: (typeof rows)[number], index: number, array: typeof rows) => T,
					thisArg?: unknown,
				): T[] {
					if (this !== rows) throw new Error('stable map lost its receiver');
					events.push('custom:start');
					events.push('callback:2:1');
					const second = callback.call(thisArg, rows[1]!, 1, rows);
					events.push('callback:1:0');
					const first = callback.call(thisArg, rows[0]!, 0, rows);
					events.push('custom:end');
					return [second, first];
				},
			});

			root.update(client.App, props);
			expect(events).toEqual(['custom:start', 'callback:2:1', 'callback:1:0', 'custom:end']);
			expect(root.findAll('#tsx-stable-map-receiver li')).toEqual([
				originalRows[1],
				originalRows[0],
			]);

			events.length = 0;
			delete (rows as { map?: unknown }).map;
			root.update(client.App, props);
			expect(events).toEqual([]);
			expect(root.findAll('#tsx-stable-map-receiver li')).toEqual(originalRows);
			expect(root.findAll('#tsx-stable-map-receiver li').map((row) => row.textContent)).toEqual([
				'first',
				'second',
			]);
		} finally {
			delete (rows as { map?: unknown }).map;
			root.unmount();
		}
	});

	it('honors an Array.prototype.map replacement installed after the component module loads', () => {
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const originalMap = Array.prototype.map;
		const patchedMap = function <Item, Result>(
			this: Item[],
			callback: (item: Item, index: number, items: Item[]) => Result,
			thisArg?: unknown,
		): Result[] {
			if ((this as unknown) === rows) events.push('prototype:map');
			return originalMap.call(this, callback, thisArg) as Result[];
		};
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows, prefix: 'native', onItem });
		const originalRows = root.findAll('#tsx-custom-map-rows li');
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);

		events.length = 0;
		Array.prototype.map = patchedMap;
		try {
			root.update(TsxCustomMapApp, { rows, prefix: 'patched', onItem });
			expect(events).toEqual(['prototype:map', 'callback:1:0', 'callback:2:1']);
			expect(root.findAll('#tsx-custom-map-rows li')).toEqual(originalRows);
			expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
				'patched:0:first',
				'patched:1:second',
			]);

			events.length = 0;
			Array.prototype.map = originalMap;
			root.update(TsxCustomMapApp, { rows, prefix: 'native again', onItem });
			expect(events).toEqual(['callback:1:0', 'callback:2:1']);
			expect(root.findAll('#tsx-custom-map-rows li')).toEqual(originalRows);
			expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
				'native again:0:first',
				'native again:1:second',
			]);
		} finally {
			Array.prototype.map = originalMap;
			root.unmount();
		}
	});

	// Octane recognizes the native map by the intrinsics present when it loaded.
	// A replacement installed afterwards, even before anything has rendered, is
	// user code that every render must call.
	it('calls an Array.prototype.map replacement installed before the first mapped render', async () => {
		const { server, client, ClientRuntime, ServerRuntime } = await loadFreshMappedRuntimes();
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const onItem = (id: number, index: number): string => `${id}:${index}`;
		const originalMap = Array.prototype.map;
		Array.prototype.map = function <Item, Result>(
			this: Item[],
			callback: (item: Item, index: number, items: Item[]) => Result,
			thisArg?: unknown,
		): Result[] {
			if ((this as unknown) === rows) events.push('prototype:map');
			return originalMap.call(this, callback, thisArg) as Result[];
		};
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = ClientRuntime.createRoot(container);
		try {
			const { html } = ServerRuntime.renderToString(server.App, { rows, prefix: 'server', onItem });
			expect(events).toEqual(['prototype:map']);
			expect(mappedRowTexts(html)).toEqual(['server:0:first', 'server:1:second']);

			events.length = 0;
			root.render(client.App as any, { rows, prefix: 'client', onItem });
			expect(events).toEqual(['prototype:map']);
			expect(mappedRowTexts(container.innerHTML)).toEqual(['client:0:first', 'client:1:second']);
		} finally {
			Array.prototype.map = originalMap;
			root.unmount();
			container.remove();
		}
	});

	it('consults an Array[Symbol.species] replacement installed before the first mapped render', async () => {
		const { server, client, ClientRuntime, ServerRuntime } = await loadFreshMappedRuntimes();
		const events: string[] = [];
		// Only the authored map's ArraySpeciesCreate step reads the receiver's
		// constructor and then its species, so record the species lookup that
		// follows that read rather than every array the renderers create.
		let afterConstructor = false;
		const rows = new Proxy(
			[
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			],
			{
				get(target, key, receiver) {
					if (key === 'constructor') afterConstructor = true;
					return Reflect.get(target, key, receiver);
				},
			},
		);
		const onItem = (id: number, index: number): string => `${id}:${index}`;
		const nativeSpecies = Object.getOwnPropertyDescriptor(Array, Symbol.species)!;
		Object.defineProperty(Array, Symbol.species, {
			...nativeSpecies,
			get(this: unknown) {
				if (afterConstructor) {
					afterConstructor = false;
					events.push('species:get');
				}
				return this;
			},
		});
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = ClientRuntime.createRoot(container);
		try {
			const { html } = ServerRuntime.renderToString(server.App, { rows, prefix: 'server', onItem });
			expect(events).toEqual(['species:get']);
			expect(mappedRowTexts(html)).toEqual(['server:0:first', 'server:1:second']);

			events.length = 0;
			root.render(client.App as any, { rows, prefix: 'client', onItem });
			expect(events).toEqual(['species:get']);
			expect(mappedRowTexts(container.innerHTML)).toEqual(['client:0:first', 'client:1:second']);
		} finally {
			Object.defineProperty(Array, Symbol.species, nativeSpecies);
			root.unmount();
			container.remove();
		}
	});

	it('preserves map callback receiver binding and callback side effects', () => {
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};

		const root = mount(TsxBoundMapApp, {
			rows,
			receiver: { prefix: 'bound' },
			onItem,
		});
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-bound-map-rows li').map((row) => row.textContent)).toEqual([
			'bound:0:first',
			'bound:1:second',
		]);

		events.length = 0;
		root.update(TsxBoundMapApp, {
			rows,
			receiver: { prefix: 'rebound' },
			onItem,
		});
		expect(events).toEqual(['callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-bound-map-rows li').map((row) => row.textContent)).toEqual([
			'rebound:0:first',
			'rebound:1:second',
		]);
		root.unmount();
	});

	it.each([
		{
			kind: 'defaulted item',
			callback:
				"(item = { id: 2, label: 'default' }, index) => <li key={item.id}>{index + ':' + item.label}</li>",
			rows: [{ id: 1, label: 'first' }, undefined],
			expected: ['0:first', '1:default'],
		},
		{
			kind: 'rest arguments',
			callback:
				"(...args) => <li key={args[0].id}>{args.length + ':' + args[1] + ':' + args[0].label}</li>",
			rows: [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			],
			expected: ['3:0:first', '3:1:second'],
		},
		{
			kind: 'destructured item',
			callback: "({ id, label }, index) => <li key={id}>{index + ':' + label}</li>",
			rows: [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			],
			expected: ['0:first', '1:second'],
		},
	])(
		'preserves $kind map callback parameters on the client and server',
		({ callback, rows, expected }) => {
			const source = `
			function CallbackShapeApp(props) {
				return <ul id="tsx-map-callback-shape">{props.rows.map(${callback})}</ul>;
			}
			export const App = CallbackShapeApp;
		`;
			const client = loadCompiledFixtureSource(source, {
				id: 'tsx-map-callback-shape.tsx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const root = mount(client.App, { rows });
			expect(root.findAll('#tsx-map-callback-shape li').map((row) => row.textContent)).toEqual(
				expected,
			);
			root.unmount();

			const server = loadCompiledFixtureSource(source, {
				id: 'tsx-map-callback-shape.tsx',
				mode: 'server',
				compileOptions: { hmr: false, dev: false },
			});
			const { html } = ServerRuntime.renderToString(server.App, { rows });
			const container = document.createElement('div');
			container.innerHTML = html;
			expect(Array.from(container.querySelectorAll('li')).map((row) => row.textContent)).toEqual(
				expected,
			);
		},
	);

	it('preserves promise-valued children from async map callbacks', async () => {
		const source = `
			import { Suspense } from 'octane';
			function AsyncMapApp(props) {
				return (
					<Suspense fallback={<span id="tsx-async-map-pending">pending</span>}>
						<ul id="tsx-async-map-rows">
							{props.rows.map(async (item) => (
								<li key={item.id} data-callback={props.onItem(item.id)}>{item.label}</li>
							))}
						</ul>
					</Suspense>
				);
			}
			export const App = AsyncMapApp;
		`;
		const rows = [{ id: 1, label: 'first' }];
		const events: string[] = [];
		const onItem = (id: number): string => {
			events.push(`callback:${id}`);
			return String(id);
		};
		const client = loadCompiledFixtureSource(source, {
			id: 'tsx-async-map.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const rendered = mount(client.App, { rows, onItem });
		try {
			expect(rendered.container.textContent).toBe('pending');
			expect(events).toEqual(['callback:1']);
			await act(async () => {});
			expect(rendered.find('li').textContent).toBe('first');
			expect(rendered.find('li').getAttribute('data-callback')).toBe('1');
		} finally {
			rendered.unmount();
		}

		events.length = 0;
		const server = loadCompiledFixtureSource(source, {
			id: 'tsx-async-map.tsx',
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const result = await prerender(server.App, { rows, onItem });
		const container = document.createElement('div');
		container.innerHTML = result.html;
		expect(container.querySelector('li')?.textContent).toBe('first');
		expect(container.querySelector('li')?.getAttribute('data-callback')).toBe('1');
		expect(events.length).toBeGreaterThan(0);
	});

	it.each([
		{ capture: 'arguments', expression: 'arguments[0].prefix', receiver: 'native' },
		{ capture: 'arguments', expression: 'arguments[0].prefix', receiver: 'custom' },
		{
			capture: 'this',
			expression: "this === owner ? props.prefix : 'wrong-this'",
			receiver: 'native',
		},
		{
			capture: 'this',
			expression: "this === owner ? props.prefix : 'wrong-this'",
			receiver: 'custom',
		},
	])(
		'preserves lexical arrow $capture for $receiver map receivers on client and server',
		({ capture, expression, receiver }) => {
			const source = `
				function LexicalMapApp(props) {
					const owner = this;
					return (
						<ul id="tsx-lexical-map">
							{props.rows.map((item, index) => (
								<li key={item.id}>{(${expression}) + ':' + index + ':' + item.label}</li>
							))}
						</ul>
					);
				}
				export const App = LexicalMapApp;
			`;
			const items = [
				{ id: 1, label: 'first' },
				{ id: 2, label: 'second' },
			];
			const events: string[] = [];
			const customRows = {
				map<T>(callback: (item: (typeof items)[number], index: number) => T): T[] {
					if (this !== customRows) throw new Error('lexical map lost its receiver');
					events.push('custom:map');
					return items.map(callback);
				},
			};
			const rows = receiver === 'native' ? items : customRows;
			const client = loadCompiledFixtureSource(source, {
				id: `tsx-map-lexical-${capture}-${receiver}.tsx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const root = mount(client.App, { rows, prefix: 'client' });
			expect(root.findAll('#tsx-lexical-map li').map((row) => row.textContent)).toEqual([
				'client:0:first',
				'client:1:second',
			]);
			expect(events).toEqual(receiver === 'custom' ? ['custom:map'] : []);
			root.unmount();

			events.length = 0;
			const server = loadCompiledFixtureSource(source, {
				id: `tsx-map-lexical-${capture}-${receiver}.tsx`,
				mode: 'server',
				compileOptions: { hmr: false, dev: false },
			});
			const { html } = ServerRuntime.renderToString(server.App, { rows, prefix: 'server' });
			const container = document.createElement('div');
			container.innerHTML = html;
			expect(Array.from(container.querySelectorAll('li')).map((row) => row.textContent)).toEqual([
				'server:0:first',
				'server:1:second',
			]);
			expect(events).toEqual(receiver === 'custom' ? ['custom:map'] : []);
		},
	);

	it.each([
		{
			capture: 'object default using lexical this',
			callback: '({ id, label = this.prefix }) => <li key={id}>{label}</li>',
			rows: [{ id: 1 }],
			expected: (_prefix: string) => 'receiver',
		},
		{
			capture: 'array default using lexical this',
			callback: '([id, label = this.prefix]) => <li key={id}>{label}</li>',
			rows: [[1]],
			expected: (_prefix: string) => 'receiver',
		},
		{
			capture: 'object default using lexical arguments',
			callback: '({ id, label = arguments[0].prefix }) => <li key={id}>{label}</li>',
			rows: [{ id: 1 }],
			expected: (prefix: string) => prefix,
		},
		{
			capture: 'array default using lexical arguments',
			callback: '([id, label = arguments[0].prefix]) => <li key={id}>{label}</li>',
			rows: [[1]],
			expected: (prefix: string) => prefix,
		},
		{
			capture: 'computed object key using lexical this',
			callback: '({ id, [this.field]: label }) => <li key={id}>{label}</li>',
			rows: [{ id: 1, label: 'computed' }],
			expected: (_prefix: string) => 'computed',
		},
		{
			capture: 'computed object key using lexical arguments',
			callback: '({ id, [arguments[0].field]: label }) => <li key={id}>{label}</li>',
			rows: [{ id: 1, label: 'computed' }],
			expected: (_prefix: string) => 'computed',
		},
		{
			capture: 'computed object key using lexical this and arguments',
			callback:
				'({ id, [this.fieldStart + arguments[0].fieldEnd]: label }) => <li key={id}>{label}</li>',
			rows: [{ id: 1, label: 'computed' }],
			expected: (_prefix: string) => 'computed',
		},
	])(
		'preserves $capture in arrow map parameters on client and server',
		({ capture, callback, rows, expected }) => {
			const source = `
				const owner = { prefix: 'receiver', field: 'label', fieldStart: 'lab' };
				function LexicalParameterMapApp(props) {
					return <ul id="tsx-lexical-parameter-map">{props.rows.map(${callback})}</ul>;
				}
				export const App = LexicalParameterMapApp.bind(owner);
			`;
			const id = `tsx-map-lexical-parameter-${capture.replaceAll(' ', '-')}.tsx`;
			const client = loadCompiledFixtureSource(source, {
				id,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const root = mount(client.App, { rows, prefix: 'client', field: 'label', fieldEnd: 'el' });
			expect(root.findAll('#tsx-lexical-parameter-map li').map((row) => row.textContent)).toEqual([
				expected('client'),
			]);
			root.unmount();

			const compiled = compile(source, id, { hmr: false, dev: false }).code;
			expect(compiled).not.toContain('mapSlot');

			const server = loadCompiledFixtureSource(source, {
				id,
				mode: 'server',
				compileOptions: { hmr: false, dev: false },
			});
			const { html } = ServerRuntime.renderToString(server.App, {
				rows,
				prefix: 'server',
				field: 'label',
				fieldEnd: 'el',
			});
			const container = document.createElement('div');
			container.innerHTML = html;
			expect(Array.from(container.querySelectorAll('li')).map((row) => row.textContent)).toEqual([
				expected('server'),
			]);
		},
	);

	it.each([
		{
			kind: 'safe object destructuring',
			callback: '({ id, label }) => <li key={id}>{label}</li>',
			rows: [{ id: 1, label: 'safe' }],
			expected: 'safe',
		},
		{
			kind: 'safe array destructuring',
			callback: '([id, label]) => <li key={id}>{label}</li>',
			rows: [[1, 'safe']],
			expected: 'safe',
		},
		{
			kind: 'nested normal-function receiver and arguments',
			callback:
				"({ id, label = (function () { return this.prefix + ':' + arguments[0]; }).call({ prefix: 'nested' }, 'own') }) => <li key={id}>{label}</li>",
			rows: [{ id: 1 }],
			expected: 'nested:own',
		},
	])('keeps $kind in arrow map parameters optimized', ({ kind, callback, rows, expected }) => {
		const source = `
			function SafeParameterMapApp(props) {
				return <ul id="tsx-safe-parameter-map">{props.rows.map(${callback})}</ul>;
			}
			export const App = SafeParameterMapApp;
		`;
		const id = `tsx-map-safe-parameter-${kind.replaceAll(' ', '-')}.tsx`;
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App, { rows });
		expect(root.findAll('#tsx-safe-parameter-map li').map((row) => row.textContent)).toEqual([
			expected,
		]);
		root.unmount();
		expect(compile(source, id, { hmr: false, dev: false }).code).toContain('mapSlot');
	});

	it('reads native-array indexed getters exactly once in callback order on every render', () => {
		const events: string[] = [];
		const items = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const rows: typeof items = [];
		Object.defineProperty(rows, '0', {
			configurable: true,
			enumerable: true,
			get() {
				events.push('get:0');
				return items[0];
			},
		});
		Object.defineProperty(rows, '1', {
			configurable: true,
			enumerable: true,
			get() {
				events.push('get:1');
				return items[1];
			},
		});
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows, prefix: 'getter', onItem });
		expect(events).toEqual(['get:0', 'callback:1:0', 'get:1', 'callback:2:1']);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'getter:0:first',
			'getter:1:second',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows, prefix: 'updated getter', onItem });
		expect(events).toEqual(['get:0', 'callback:1:0', 'get:1', 'callback:2:1']);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'updated getter:0:first',
			'updated getter:1:second',
		]);
		root.unmount();
	});

	it('re-reads accessor-backed pure component rows when their array identity is unchanged', () => {
		const events: string[] = [];
		let current = { id: 1, label: 'first' };
		const rows: Array<typeof current> = [];
		Object.defineProperty(rows, '0', {
			configurable: true,
			enumerable: true,
			get() {
				events.push('get:0');
				return current;
			},
		});
		const props = { rows, prefix: 'stable', theme: 't0' };
		const root = mount(TsxStatefulMappedApp, props);
		const button = root.find('.own-1');
		expect(events).toEqual(['get:0']);
		expect(button.textContent).toBe('t0:stable:0:first:0');
		root.click('.own-1');
		expect(button.textContent).toBe('t0:stable:0:first:1');

		events.length = 0;
		current = { id: 1, label: 'updated' };
		root.update(TsxStatefulMappedApp, props);
		expect(events).toEqual(['get:0']);
		expect(root.find('.own-1')).toBe(button);
		expect(button.textContent).toBe('t0:stable:0:updated:1');
		root.unmount();
	});

	it('preserves returned-JSX provider component rows, context, state, keys, refs, and effects', () => {
		const source = `
			import { createContext, memo, useContext, useEffect, useState } from 'octane';

			const Theme = createContext('initial');

			function RowImpl(props) {
				const theme = useContext(Theme);
				const [own, setOwn] = useState(0);
				useEffect(() => {
					props.onEffect('mount:' + props.id);
					return () => props.onEffect('cleanup:' + props.id);
				}, [props.id, props.onEffect]);
				return (
					<button
						className={'provider-component-row-' + props.id}
						ref={props.onRef}
						onClick={() => setOwn(own + 1)}
					>
						{theme + ':' + props.label + ':' + own}
					</button>
				);
			}
			const Row = memo(RowImpl);

			function Rows(props) {
				return (
					<div id="provider-component-rows">
						{props.items.map((item) => (
							<Row
								key={item.id}
								id={item.id}
								label={item.label}
								onEffect={item.onEffect}
								onRef={item.onRef}
							/>
						))}
					</div>
				);
			}

			export function App(props) {
				const [items, setItems] = useState(props.items);
				const [theme, setTheme] = useState('initial');
				const [tick, setTick] = useState(0);
				return (
					<section>
						<button id="provider-component-tick" onClick={() => setTick(tick + 1)}>{tick}</button>
						<button id="provider-component-theme" onClick={() => setTheme('updated')}>theme</button>
						<button
							id="provider-component-change"
							onClick={() => setItems(items.map((item) => item.id === 1
								? { ...item, label: 'changed' }
								: item))}
						>change</button>
						<button id="provider-component-reorder" onClick={() => setItems(items.toReversed())}>
							reorder
						</button>
						<Theme value={theme}>
							<Rows items={items} />
						</Theme>
					</section>
				);
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'returned-provider-component-rows.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const effects: string[] = [];
		const attached: Element[] = [];
		const detached: Element[] = [];
		const onEffect = (event: string) => effects.push(event);
		const onRef = (element: Element | null) => {
			if (element !== null) {
				attached.push(element);
				return () => detached.push(element);
			}
		};
		const items = [
			{ id: 1, label: 'first', onEffect, onRef },
			{ id: 2, label: 'second', onEffect, onRef },
		];
		const root = mount(client.App, { items });
		flushEffects();
		const first = root.find('.provider-component-row-1');
		const second = root.find('.provider-component-row-2');
		expect(attached).toEqual([first, second]);
		expect(effects).toEqual(['mount:1', 'mount:2']);

		root.click('.provider-component-row-1');
		expect(first.textContent).toBe('initial:first:1');
		root.click('#provider-component-tick');
		expect(root.findAll('#provider-component-rows > button')).toEqual([first, second]);
		expect(first.textContent).toBe('initial:first:1');

		root.click('#provider-component-theme');
		expect(first.textContent).toBe('updated:first:1');
		expect(second.textContent).toBe('updated:second:0');
		root.click('#provider-component-change');
		expect(root.findAll('#provider-component-rows > button')).toEqual([first, second]);
		expect(first.textContent).toBe('updated:changed:1');
		root.click('#provider-component-reorder');
		expect(root.findAll('#provider-component-rows > button')).toEqual([second, first]);
		expect(first.textContent).toBe('updated:changed:1');
		expect(attached).toEqual([first, second]);
		expect(detached).toEqual([]);
		flushEffects();
		expect(effects).toEqual(['mount:1', 'mount:2']);

		root.unmount();
		flushEffects();
		expect(detached).toEqual(expect.arrayContaining([first, second]));
		expect(detached).toHaveLength(2);
		expect(effects.slice(2).toSorted()).toEqual(['cleanup:1', 'cleanup:2']);
	});

	it('reruns effects in unmemoized returned-JSX provider component rows', () => {
		const source = `
			import { createContext, useEffect, useState } from 'octane';

			const Theme = createContext(null);

			function Row(props) {
				useEffect(() => {
					props.onEffect('effect:' + props.label);
					return () => props.onEffect('cleanup:' + props.label);
				}, null);
				return <span id="provider-component-plain-row">{props.label}</span>;
			}

			function Rows(props) {
				return (
					<div id="provider-component-plain-rows">
						{props.items.map((item) => (
							<Row key={item.id} label={item.label} onEffect={item.onEffect} />
						))}
					</div>
				);
			}

			export function App(props) {
				const [tick, setTick] = useState(0);
				const items = props.items;
				return (
					<section>
						<button id="provider-component-plain-update" onClick={() => setTick(tick + 1)}>
							{tick}
						</button>
						<Theme value={null}>
							<Rows items={items} />
						</Theme>
					</section>
				);
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'returned-provider-component-plain-row-effect.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const effects: string[] = [];
		const root = mount(client.App, {
			items: [{ id: 1, label: 'row', onEffect: (event: string) => effects.push(event) }],
		});
		flushEffects();
		const row = root.find('#provider-component-plain-row');
		expect(effects).toEqual(['effect:row']);

		effects.length = 0;
		root.click('#provider-component-plain-update');
		flushEffects();
		expect(root.find('#provider-component-plain-row')).toBe(row);
		expect(effects).toEqual(['cleanup:row', 'effect:row']);
		root.unmount();
	});

	it('preserves observable returned-JSX provider component map accessors and receivers', () => {
		const client = loadReturnedProviderComponentMapFixture();
		const events: string[] = [];
		let label = 'initial';
		const items = [{ id: 1, label: 'ignored' }];
		Object.defineProperty(items, 'map', {
			configurable: true,
			get() {
				events.push('get:map');
				return function <Result>(
					this: typeof items,
					callback: (item: (typeof items)[number], index: number, array: typeof items) => Result,
				): Result[] {
					if (this !== items) throw new Error('custom map lost its receiver');
					events.push('call:map');
					return [callback({ id: 1, label }, 0, items)];
				};
			},
		});
		const root = mount(client.App, { items });
		const row = root.find('.returned-provider-map-row');
		expect(events).toEqual(['get:map', 'call:map']);
		expect(row.textContent).toBe('initial');

		events.length = 0;
		label = 'updated';
		root.click('#returned-provider-map-update');
		expect(events).toEqual(['get:map', 'call:map']);
		expect(root.find('.returned-provider-map-row')).toBe(row);
		expect(row.textContent).toBe('updated');
		root.unmount();
	});

	it('observes returned-JSX provider component map overrides installed after mounting', () => {
		const client = loadReturnedProviderComponentMapFixture();
		const items = [{ id: 1, label: 'native' }];
		const originalMap = Array.prototype.map;
		const root = mount(client.App, { items });
		const row = root.find('.returned-provider-map-row');
		expect(row.textContent).toBe('native');

		try {
			Object.defineProperty(items, 'map', {
				configurable: true,
				value<Result>(
					this: typeof items,
					callback: (item: (typeof items)[number], index: number, array: typeof items) => Result,
				): Result[] {
					if (this !== items) throw new Error('installed map lost its receiver');
					return [callback({ id: 1, label: 'own override' }, 0, items)];
				},
			});
			root.click('#returned-provider-map-update');
			expect(root.find('.returned-provider-map-row')).toBe(row);
			expect(row.textContent).toBe('own override');

			delete (items as { map?: unknown }).map;
			Array.prototype.map = function <Item, Result>(
				this: Item[],
				callback: (item: Item, index: number, array: Item[]) => Result,
				thisArg?: unknown,
			): Result[] {
				if ((this as unknown) === items) {
					return originalMap.call(
						[{ id: 1, label: 'prototype override' }],
						callback,
						thisArg,
					) as Result[];
				}
				return originalMap.call(this, callback, thisArg) as Result[];
			};
			root.click('#returned-provider-map-update');
			expect(root.find('.returned-provider-map-row')).toBe(row);
			expect(row.textContent).toBe('prototype override');

			Array.prototype.map = originalMap;
			root.click('#returned-provider-map-update');
			expect(root.find('.returned-provider-map-row')).toBe(row);
			expect(row.textContent).toBe('native');
		} finally {
			Array.prototype.map = originalMap;
			delete (items as { map?: unknown }).map;
			root.unmount();
		}
	});

	it('preserves returned-JSX provider component proxy-backed map behavior', () => {
		const client = loadReturnedProviderComponentMapFixture();
		const events: string[] = [];
		let label = 'initial';
		const target = [{ id: 1, label: 'ignored' }];
		const items = new Proxy(target, {
			get(current, property, receiver) {
				if (property === 'map') {
					events.push('get:map');
					return function <Result>(
						this: typeof target,
						callback: (
							item: (typeof target)[number],
							index: number,
							array: typeof target,
						) => Result,
					): Result[] {
						if (this !== items) throw new Error('proxy map lost its receiver');
						events.push('call:map');
						return [callback({ id: 1, label }, 0, items)];
					};
				}
				return Reflect.get(current, property, receiver);
			},
			getPrototypeOf(current) {
				events.push('get:prototype');
				return Reflect.getPrototypeOf(current);
			},
			getOwnPropertyDescriptor(current, property) {
				if (property === 'map') events.push('get:map descriptor');
				return Reflect.getOwnPropertyDescriptor(current, property);
			},
		});
		const root = mount(client.App, { items });
		const row = root.find('.returned-provider-map-row');
		expect(events).toEqual(['get:map', 'get:prototype', 'call:map']);
		expect(row.textContent).toBe('initial');

		events.length = 0;
		label = 'updated';
		root.click('#returned-provider-map-update');
		expect(events).toEqual(['get:map', 'get:prototype', 'call:map']);
		expect(root.find('.returned-provider-map-row')).toBe(row);
		expect(row.textContent).toBe('updated');
		root.unmount();
	});

	it.each(['sparse indexed accessor', 'custom array species'] as const)(
		'preserves returned-JSX provider component rows with a %s',
		(shape) => {
			const client = loadReturnedProviderComponentMapFixture();
			const events: string[] = [];
			let current = { id: 1, label: 'initial' };
			const items: Array<typeof current> = [];

			if (shape === 'sparse indexed accessor') {
				items.length = 2;
				Object.defineProperty(items, '1', {
					configurable: true,
					enumerable: true,
					get() {
						events.push('get:item');
						return current;
					},
				});
			} else {
				items.push(current);
				Object.defineProperty(items, 'constructor', {
					configurable: true,
					value: {
						[Symbol.species]: function (length: number) {
							events.push('species');
							return new Array(length);
						},
					},
				});
			}

			const expected = shape === 'sparse indexed accessor' ? ['get:item'] : ['species'];
			const root = mount(client.App, { items });
			const row = root.find('.returned-provider-map-row');
			expect(events).toEqual(expected);
			expect(row.textContent).toBe('initial');

			events.length = 0;
			current = { id: 1, label: 'updated' };
			root.click('#returned-provider-map-update');
			expect(events).toEqual(expected);
			expect(root.find('.returned-provider-map-row')).toBe(row);
			expect(row.textContent).toBe(shape === 'sparse indexed accessor' ? 'updated' : 'initial');
			root.unmount();
		},
	);

	it('observes inherited returned-JSX provider component defaultProps accessors', () => {
		const client = loadReturnedProviderComponentMapFixture();
		const items = [{ id: 1, label: 'initial' }];
		const events: string[] = [];
		const root = mount(client.App, { items });
		const row = root.find('.returned-provider-map-row');
		const original = Object.getOwnPropertyDescriptor(Function.prototype, 'defaultProps');

		try {
			Object.defineProperty(Function.prototype, 'defaultProps', {
				configurable: true,
				get(this: Function) {
					if (this.name === 'Rows') events.push('get:defaultProps');
					return undefined;
				},
			});

			root.click('#returned-provider-map-update');
			expect(events).toEqual(['get:defaultProps']);
			expect(root.find('.returned-provider-map-row')).toBe(row);
			expect(row.textContent).toBe('initial');

			events.length = 0;
			root.update(client.App, { items: [{ id: 1, label: 'updated' }] });
			expect(events).toEqual(['get:defaultProps']);
			expect(root.find('.returned-provider-map-row')).toBe(row);
			expect(row.textContent).toBe('updated');
		} finally {
			if (original === undefined) {
				delete (Function.prototype as { defaultProps?: unknown }).defaultProps;
			} else {
				Object.defineProperty(Function.prototype, 'defaultProps', original);
			}
			root.unmount();
		}
	});

	it('keeps returned-JSX provider component defaultProps accessors observable', () => {
		const source = `
			import { createContext, memo, useState } from 'octane';

			const Theme = createContext(null);
			let current = 'initial';
			export function updateDefault() {
				current = 'updated';
			}

			function RowImpl(props) {
				return <span id="provider-component-default-row">{props.label}</span>;
			}
			const Row = memo(RowImpl);

			function Rows(props) {
				return (
					<div id="provider-component-default-rows" data-default={props.suffix}>
						{props.items.map((item) => <Row key={item.id} label={item.label} />)}
					</div>
				);
			}
			Object.defineProperty(Rows, 'defaultProps', {
				configurable: true,
				get() {
					return { suffix: current };
				},
			});

			export function App(props) {
				const [tick, setTick] = useState(0);
				const items = props.items;
				return (
					<section>
						<button id="provider-component-default-update" onClick={() => setTick(tick + 1)}>
							{tick}
						</button>
						<Theme value={null}>
							<Rows items={items} />
						</Theme>
					</section>
				);
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'returned-provider-component-default-props.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App, { items: [{ id: 1, label: 'row' }] });
		const rows = root.find('#provider-component-default-rows');
		expect(rows.getAttribute('data-default')).toBe('initial');

		client.updateDefault();
		root.click('#provider-component-default-update');
		expect(root.find('#provider-component-default-rows')).toBe(rows);
		expect(rows.getAttribute('data-default')).toBe('updated');
		root.unmount();
	});

	it.each([
		{
			shape: 'ordinary object',
			wrapper: 'const Wrapper = { Provider: Fake };',
		},
		{
			shape: 'throwing provider accessor',
			wrapper: `
				let reads = 0;
				const Wrapper = Fake;
				Object.defineProperty(Wrapper, 'Provider', {
					get() {
						if (++reads !== 1) throw new Error('Provider getter read twice');
						return Wrapper;
					},
				});
			`,
		},
		{
			shape: 'throwing callable proxy',
			wrapper: `
				const Wrapper = new Proxy(Fake, {
					get(target, property, receiver) {
						if (property === 'Provider') return receiver;
						if (property === '$$kind') throw new Error('private brand getter must stay unread');
						return Reflect.get(target, property, receiver);
					},
				});
			`,
		},
	])(
		'preserves inspectable returned-JSX provider component children for a $shape',
		({ shape, wrapper }) => {
			const source = `
				import { isValidElement, useState } from 'octane';

				function Rows(props) {
					return (
						<div id="provider-component-fake-rows">
							{props.items.map((item) => <span key={item.id}>{item.label}</span>)}
						</div>
					);
				}

				function Fake(props) {
					const child = props.children;
					props.value(isValidElement(child), child.type.name === 'Rows');
					${shape === 'throwing provider accessor' ? 'reads = 0;' : ''}
					return child;
				}
				${wrapper}

				export function App(props) {
					const [tick, setTick] = useState(0);
					const items = props.items;
					const onChildren = props.onChildren;
					return (
						<section>
							<button id="provider-component-fake-update" onClick={() => setTick(tick + 1)}>
								{tick}
							</button>
							<Wrapper.Provider value={onChildren}>
								<Rows items={items} />
							</Wrapper.Provider>
						</section>
					);
				}
			`;
			const client = loadCompiledFixtureSource(source, {
				id: `returned-provider-component-${shape.replaceAll(' ', '-')}.tsx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const observations: Array<[boolean, boolean]> = [];
			const root = mount(client.App, {
				items: [{ id: 1, label: 'initial' }],
				onChildren: (valid: boolean, correctType: boolean) => {
					observations.push([valid, correctType]);
				},
			});
			const rows = root.find('#provider-component-fake-rows');
			expect(rows.textContent).toBe('initial');
			expect(observations.at(-1)).toEqual([true, true]);

			root.click('#provider-component-fake-update');
			expect(root.find('#provider-component-fake-rows')).toBe(rows);
			expect(observations.at(-1)).toEqual([true, true]);
			root.unmount();
		},
	);

	it('hydrates returned-JSX provider component rows and preserves nodes across updates', () => {
		const source = `
			import { createContext, memo, useContext, useState } from 'octane';

			const Theme = createContext('default');

			function RowImpl(props) {
				const theme = useContext(Theme);
				const [own, setOwn] = useState(0);
				return (
					<button id="provider-component-hydrated-row" onClick={() => setOwn(own + 1)}>
						{theme + ':' + props.label + ':' + own}
					</button>
				);
			}
			const Row = memo(RowImpl);

			function Rows(props) {
				return (
					<div id="provider-component-hydrated-rows">
						{props.items.map((item) => <Row key={item.id} label={item.label} />)}
					</div>
				);
			}

			export function App(props) {
				const [tick, setTick] = useState(0);
				const items = props.items;
				const theme = props.theme;
				return (
					<section>
						<button id="provider-component-hydrated-update" onClick={() => setTick(tick + 1)}>
							{tick}
						</button>
						<Theme value={theme}>
							<Rows items={items} />
						</Theme>
					</section>
				);
			}
		`;
		const id = 'returned-provider-component-hydration.tsx';
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const items = [{ id: 1, label: 'initial' }];
		const { html } = ServerRuntime.renderToString(server.App, { items, theme: 'initial' });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const rows = container.querySelector('#provider-component-hydrated-rows');
		const row = container.querySelector('#provider-component-hydrated-row');

		const root = hydrateRoot(container, client.App, { items, theme: 'initial' });
		flushSync(() => {});
		expect(container.querySelector('#provider-component-hydrated-rows')).toBe(rows);
		expect(container.querySelector('#provider-component-hydrated-row')).toBe(row);
		expect(row?.textContent).toBe('initial:initial:0');

		flushSync(() => (row as HTMLElement).click());
		expect(row?.textContent).toBe('initial:initial:1');
		flushSync(() =>
			(container.querySelector('#provider-component-hydrated-update') as HTMLElement).click(),
		);
		expect(container.querySelector('#provider-component-hydrated-row')).toBe(row);
		expect(row?.textContent).toBe('initial:initial:1');

		flushSync(() => root.render(client.App, { items, theme: 'updated' }));
		expect(container.querySelector('#provider-component-hydrated-rows')).toBe(rows);
		expect(container.querySelector('#provider-component-hydrated-row')).toBe(row);
		expect(row?.textContent).toBe('updated:initial:1');
		flushSync(() =>
			root.render(client.App, {
				items: [{ id: 1, label: 'changed' }],
				theme: 'updated',
			}),
		);
		expect(container.querySelector('#provider-component-hydrated-row')).toBe(row);
		expect(row?.textContent).toBe('updated:changed:1');
		root.unmount();
		container.remove();
	});

	it('preserves returned-JSX descriptor rows, context, state, keys, refs, and effects', () => {
		const source = `
			import { createContext, createElement, memo, useContext, useEffect, useState } from 'octane';

			const Theme = createContext('initial');

			function RowImpl(props) {
				const theme = useContext(Theme);
				const [own, setOwn] = useState(0);
				useEffect(() => {
					props.onEffect('mount:' + props.id);
					return () => props.onEffect('cleanup:' + props.id);
				}, [props.id, props.onEffect]);
				return (
					<button
						className={'returned-descriptor-row-' + props.id}
						data-id={props.id}
						ref={props.onRef}
						onClick={() => setOwn(own + 1)}
					>
						{theme + ':' + props.label + ':' + own}
					</button>
				);
			}
			const Row = memo(RowImpl);

			function selectRow(item, onEffect, onRef) {
				return createElement(Row, {
					key: item.id,
					id: item.id,
					label: item.label,
					onEffect,
					onRef,
				});
			}

			function selectRows(items, onEffect, onRef) {
				return [
					selectRow(items[0], onEffect, onRef),
					selectRow(items[1], onEffect, onRef),
				];
			}

			export function App(props) {
				const [items, setItems] = useState([
					{ id: 1, label: 'first' },
					{ id: 2, label: 'second' },
				]);
				const [theme, setTheme] = useState('initial');
				const [tick, setTick] = useState(0);
				const rows = selectRows(items, props.onEffect, props.onRef);
				return (
					<section>
						<button id="returned-descriptor-tick" onClick={() => setTick(tick + 1)}>{tick}</button>
						<button id="returned-descriptor-theme" onClick={() => setTheme('updated')}>theme</button>
						<button
							id="returned-descriptor-change"
							onClick={() => setItems(items.map((item) => item.id === 1
								? { ...item, label: 'changed' }
								: item))}
						>change</button>
						<button id="returned-descriptor-reorder" onClick={() => setItems(items.toReversed())}>
							reorder
						</button>
						<Theme value={theme}>
							<div id="returned-descriptor-rows">{rows}</div>
						</Theme>
					</section>
				);
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'returned-descriptor-rows.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const effects: string[] = [];
		const attached: Element[] = [];
		const detached: Element[] = [];
		const root = mount(client.App, {
			onEffect: (event: string) => effects.push(event),
			onRef: (element: Element | null) => {
				if (element !== null) {
					attached.push(element);
					return () => detached.push(element);
				}
			},
		});
		flushEffects();
		const first = root.find('.returned-descriptor-row-1');
		const second = root.find('.returned-descriptor-row-2');
		expect(attached).toEqual([first, second]);
		expect(effects).toEqual(['mount:1', 'mount:2']);
		expect(first.textContent).toBe('initial:first:0');
		expect(second.textContent).toBe('initial:second:0');

		root.click('.returned-descriptor-row-1');
		expect(first.textContent).toBe('initial:first:1');

		root.click('#returned-descriptor-tick');
		expect(root.findAll('#returned-descriptor-rows > button')).toEqual([first, second]);
		expect(first.textContent).toBe('initial:first:1');
		expect(attached).toEqual([first, second]);
		expect(detached).toEqual([]);

		root.click('#returned-descriptor-theme');
		expect(first.textContent).toBe('updated:first:1');
		expect(second.textContent).toBe('updated:second:0');

		root.click('#returned-descriptor-change');
		expect(root.findAll('#returned-descriptor-rows > button')).toEqual([first, second]);
		expect(first.textContent).toBe('updated:changed:1');
		expect(second.textContent).toBe('updated:second:0');

		root.click('#returned-descriptor-reorder');
		expect(root.findAll('#returned-descriptor-rows > button')).toEqual([second, first]);
		expect(first.textContent).toBe('updated:changed:1');
		expect(second.textContent).toBe('updated:second:0');
		flushEffects();
		expect(attached).toEqual([first, second]);
		expect(detached).toEqual([]);
		expect(effects).toEqual(['mount:1', 'mount:2']);

		root.unmount();
		flushEffects();
		expect(detached).toHaveLength(2);
		expect(detached).toEqual(expect.arrayContaining([first, second]));
		expect(effects.slice(2).toSorted()).toEqual(['cleanup:1', 'cleanup:2']);
	});

	it('hydrates returned-JSX descriptor rows and preserves their nodes through provider updates', () => {
		const source = `
			import { createContext, createElement, memo, useContext, useState } from 'octane';

			const Theme = createContext('default');

			function RowImpl(props) {
				const theme = useContext(Theme);
				return <span id="returned-hydrated-row">{theme + ':' + props.label}</span>;
			}
			const Row = memo(RowImpl);

			function selectRows(items) {
				return [createElement(Row, { key: items[0].id, label: items[0].label })];
			}

			export function App(props) {
				const [tick, setTick] = useState(0);
				const theme = props.theme;
				const rows = selectRows(props.items);
				return (
					<section>
						<button id="returned-hydrated-tick" onClick={() => setTick(tick + 1)}>{tick}</button>
						<Theme value={theme}>
							<div id="returned-hydrated-rows">{rows}</div>
						</Theme>
					</section>
				);
			}
		`;
		const id = 'returned-descriptor-hydration.tsx';
		const server = loadCompiledFixtureSource(source, {
			id,
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		const client = loadCompiledFixtureSource(source, {
			id,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const items = [{ id: 1, label: 'row' }];
		const { html } = ServerRuntime.renderToString(server.App, { items, theme: 'initial' });
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.appendChild(container);
		const row = container.querySelector('#returned-hydrated-row');
		const list = container.querySelector('#returned-hydrated-rows');

		const root = hydrateRoot(container, client.App, { items, theme: 'initial' });
		flushSync(() => {});
		expect(container.querySelector('#returned-hydrated-row')).toBe(row);
		expect(container.querySelector('#returned-hydrated-rows')).toBe(list);
		expect(row?.textContent).toBe('initial:row');

		flushSync(() => (container.querySelector('#returned-hydrated-tick') as HTMLElement).click());
		expect(container.querySelector('#returned-hydrated-row')).toBe(row);
		expect(row?.textContent).toBe('initial:row');

		flushSync(() => root.render(client.App, { items, theme: 'updated' }));
		expect(container.querySelector('#returned-hydrated-rows')).toBe(list);
		expect(container.querySelector('#returned-hydrated-row')).toBe(row);
		expect(row?.textContent).toBe('updated:row');
		root.unmount();
		container.remove();
	});

	it.each([
		{ shape: 'direct', shared: 'dynamic' },
		{ shape: 'nested', shared: '[dynamic]' },
		{
			shape: 'fragment-wrapped',
			shared: "[createElement(Fragment, { key: 'wrapper' }, dynamic)]",
		},
	])(
		'keeps $shape returned-JSX descriptor-array getters live across parent updates',
		({ shape, shared }) => {
			const source = `
				import { Fragment, createContext, createElement, useState } from 'octane';

				let label = 'initial';
				const dynamic = [];
				Object.defineProperty(dynamic, '0', {
					configurable: true,
					enumerable: true,
					get() {
						return createElement(Row, { key: 'row', label });
					},
				});
				const shared = ${shared};
				const Context = createContext(null);

				function Row(props) {
					return <span id="returned-accessor-row">{props.label}</span>;
				}

				function selectRows(items) {
					return shared;
				}

				export function App() {
					const [items] = useState([0]);
					const [tick, setTick] = useState(0);
					const rows = selectRows(items);
					return (
						<section>
							<button
								id="returned-accessor-update"
								onClick={() => {
									label = 'updated';
									setTick(tick + 1);
								}}
							>{tick}</button>
							<Context value={null}>
								<div>{rows}</div>
							</Context>
						</section>
					);
				}
			`;
			const client = loadCompiledFixtureSource(source, {
				id: `returned-${shape}-descriptor-accessor.tsx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const root = mount(client.App);
			const row = root.find('#returned-accessor-row');
			expect(row.textContent).toBe('initial');

			root.click('#returned-accessor-update');
			expect(root.find('#returned-accessor-row')).toBe(row);
			expect(row.textContent).toBe('updated');
			root.unmount();
		},
	);

	it.each([
		{
			shape: 'deferred component props',
			entry: '<Row key="row" label={use(Theme)} />',
		},
		{
			shape: 'deferred host children',
			entry: '<span key="row" id="returned-scoped-row">{use(Theme)}</span>',
		},
	])('keeps returned-JSX $shape reactive inside derived descriptor arrays', ({ shape, entry }) => {
		const source = `
			import { createContext, use, useState } from 'octane';

			const Theme = createContext('initial');

			function Row(props) {
				return <span id="returned-scoped-row">{props.label}</span>;
			}

			const shared = [${entry}];
			function selectRows(items) {
				return shared;
			}

			export function App() {
				const [items] = useState([0]);
				const [theme, setTheme] = useState('initial');
				const rows = selectRows(items);
				return (
					<section>
						<button id="returned-scoped-update" onClick={() => setTheme('updated')}>
							update context
						</button>
						<Theme value={theme}>
							<div>{rows}</div>
						</Theme>
					</section>
				);
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: `returned-${shape.replaceAll(' ', '-')}.tsx`,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App);
		const row = root.find('#returned-scoped-row');
		expect(row.textContent).toBe('initial');

		root.click('#returned-scoped-update');
		expect(root.find('#returned-scoped-row')).toBe(row);
		expect(row.textContent).toBe('updated');
		root.unmount();
	});

	it('observes mutations to returned-JSX descriptor arrays that escape into callbacks', () => {
		const source = `
			import { createContext, createElement, useState } from 'octane';

			const Context = createContext(null);

			function Row(props) {
				return <span id="returned-escaped-row">{props.label}</span>;
			}

			const shared = [createElement(Row, { key: 'row', label: 'initial' })];
			function selectRows(items) {
				return shared;
			}

			export function App() {
				const [items] = useState([0]);
				const [tick, setTick] = useState(0);
				const rows = selectRows(items);
				return (
					<section>
						<button
							id="returned-escaped-update"
							onClick={() => {
								rows[0] = createElement(Row, { key: 'row', label: 'updated' });
								setTick(tick + 1);
							}}
						>{tick}</button>
						<Context value={null}>
							<div>{rows}</div>
						</Context>
					</section>
				);
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: 'returned-escaped-descriptor-array.tsx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App);
		const row = root.find('#returned-escaped-row');
		expect(row.textContent).toBe('initial');

		root.click('#returned-escaped-update');
		expect(root.find('#returned-escaped-row')).toBe(row);
		expect(row.textContent).toBe('updated');
		root.unmount();
	});

	it.each([
		{
			shape: 'ordinary object',
			provider: `
				const Wrapper = {
					Provider(props) {
						props.value(isValidElement(props.children), props.children.type);
						return props.children;
					},
				};
			`,
		},
		{
			shape: 'self-aliased function',
			provider: `
				function Wrapper(props) {
					props.value(isValidElement(props.children), props.children.type);
					return props.children;
				}
				Wrapper.Provider = Wrapper;
			`,
		},
		{
			shape: 'callable accessor',
			provider: `
				let providerReads = 0;
				function Wrapper(props) {
					const child = props.children;
					props.value(isValidElement(child), child.type);
					providerReads = 0;
					return child;
				}
				Object.defineProperty(Wrapper, 'Provider', {
					configurable: true,
					get() {
						if (++providerReads !== 1) {
							throw new Error('Provider must only be read once');
						}
						return Wrapper;
					},
				});
			`,
		},
		{
			shape: 'throwing context-brand accessor',
			provider: `
				function Wrapper(props) {
					props.value(isValidElement(props.children), props.children.type);
					return props.children;
				}
				Wrapper.Provider = Wrapper;
				Object.defineProperty(Wrapper, '$$kind', {
					get() {
						throw new Error('Custom provider context brand must not be inspected');
					},
				});
			`,
		},
	])(
		'preserves inspectable descriptor children for $shape components named Provider',
		({ shape, provider }) => {
			const source = `
			import { createElement, isValidElement, useState } from 'octane';

			${provider}

			function Row(props) {
				return <span id="returned-custom-provider-row">{props.label}</span>;
			}

			function selectRows(items) {
				return [createElement(Row, { key: 'row', label: items[0] })];
			}

			export function App(props) {
				const [items] = useState(['initial']);
				const [tick, setTick] = useState(0);
				const onChildren = props.onChildren;
				const rows = selectRows(items);
				return (
					<section>
						<button id="returned-custom-provider-tick" onClick={() => setTick(tick + 1)}>
							{tick}
						</button>
						<Wrapper.Provider value={onChildren}>
							<div>{rows}</div>
						</Wrapper.Provider>
					</section>
				);
			}
		`;
			const client = loadCompiledFixtureSource(source, {
				id: `returned-${shape.replaceAll(' ', '-')}-provider-descriptor.tsx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const children: Array<[boolean, unknown]> = [];
			const root = mount(client.App, {
				onChildren: (valid: boolean, type: unknown) => children.push([valid, type]),
			});
			const row = root.find('#returned-custom-provider-row');
			expect(children.at(-1)).toEqual([true, 'div']);
			expect(row.textContent).toBe('initial');

			root.click('#returned-custom-provider-tick');
			expect(children.at(-1)).toEqual([true, 'div']);
			expect(root.find('#returned-custom-provider-row')).toBe(row);
			expect(row.textContent).toBe('initial');
			root.unmount();
		},
	);

	it.each([
		{ shape: 'direct', shared: 'dynamic' },
		{ shape: 'nested', shared: '[dynamic]' },
		{
			shape: 'fragment-wrapped',
			shared: "[createElement(Fragment, { key: 'wrapper' }, dynamic)]",
		},
	])(
		're-reads $shape derived renderable array getters on later parent renders',
		({ shape, shared }) => {
			const source = `
			import { Fragment, createContext, createElement, useState } from 'octane';

			let label = 'initial';
			const dynamic = [];
			Object.defineProperty(dynamic, '0', {
				configurable: true,
				enumerable: true,
				get() {
					return createElement(Row, { key: 'row', label });
				},
			});
			const shared = ${shared};
			const Context = createContext(null);

			function Row(props) @{
				<span id="derived-accessor-row">{props.label as string}</span>
			}

			function selectRows(items) {
				return shared;
			}

			export function App() @{
				const [items] = useState([0]);
				const [tick, setTick] = useState(0);
				const rows = selectRows(items);
				<section>
					<button
						id="derived-accessor-update"
						onClick={() => {
							label = 'updated';
							setTick(tick + 1);
						}}
					>{tick as number}</button>
					<Context value={null}>
						<div id="derived-accessor-rows">{rows}</div>
					</Context>
				</section>
			}
		`;
			const client = loadCompiledFixtureSource(source, {
				id: `derived-${shape}-array-accessor.tsrx`,
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			});
			const root = mount(client.App);
			const row = root.find('#derived-accessor-row');
			expect(row.textContent).toBe('initial');

			root.click('#derived-accessor-update');
			expect(root.find('#derived-accessor-row')).toBe(row);
			expect(row.textContent).toBe('updated');
			root.unmount();
		},
	);

	it.each([
		{
			shape: 'deferred component props',
			entry: '<Row key="row" label={use(Theme)} />',
		},
		{
			shape: 'deferred host children',
			entry: '<span key="row" id="derived-scoped-row">{use(Theme)}</span>',
		},
	])('keeps $shape inside derived renderable arrays reactive to context', ({ shape, entry }) => {
		const source = `
			import { createContext, use, useState } from 'octane';

			const Theme = createContext('initial');

			function Row(props) @{
				<span id="derived-scoped-row">{props.label as string}</span>
			}

			const shared = [${entry}];
			function selectRows(items) {
				return shared;
			}

			export function App() @{
				const [items] = useState([0]);
				const [theme, setTheme] = useState('initial');
				const rows = selectRows(items);
				<section>
					<button id="derived-scoped-update" onClick={() => setTheme('updated')}>
						{'update context'}
					</button>
					<Theme value={theme}>
						<div id="derived-scoped-rows">{rows}</div>
					</Theme>
				</section>
			}
		`;
		const client = loadCompiledFixtureSource(source, {
			id: `derived-${shape.replaceAll(' ', '-')}.tsrx`,
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});
		const root = mount(client.App);
		const row = root.find('#derived-scoped-row');
		expect(row.textContent).toBe('initial');

		root.click('#derived-scoped-update');
		expect(root.find('#derived-scoped-row')).toBe(row);
		expect(row.textContent).toBe('updated');
		root.unmount();
	});

	it('reads inherited sparse-array getters once without skipping their callback index', () => {
		const events: string[] = [];
		const first = { id: 1, label: 'first' };
		const inherited = { id: 2, label: 'inherited' };
		const third = { id: 3, label: 'third' };

		class InheritedRows extends Array<typeof first> {}
		const rows = new InheritedRows();
		rows[0] = first;
		rows[2] = third;
		Object.defineProperty(InheritedRows.prototype, '1', {
			configurable: true,
			get() {
				events.push('get:inherited');
				return inherited;
			},
		});
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows, prefix: 'inherited', onItem });
		expect(events).toEqual(['callback:1:0', 'get:inherited', 'callback:2:1', 'callback:3:2']);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'inherited:0:first',
			'inherited:1:inherited',
			'inherited:2:third',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows, prefix: 'updated inherited', onItem });
		expect(events).toEqual(['callback:1:0', 'get:inherited', 'callback:2:1', 'callback:3:2']);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'updated inherited:0:first',
			'updated inherited:1:inherited',
			'updated inherited:2:third',
		]);
		root.unmount();
	});

	it('re-reads inherited proxy-array values in a pure mapped list on every parent render', () => {
		const events: string[] = [];
		const first = { id: 1, label: 'first' };
		let inherited = { id: 2, label: 'inherited' };
		const target = [first];
		target.length = 2;
		const rows = new Proxy(target, {
			has(items, property) {
				return property === '1' || Reflect.has(items, property);
			},
			get(items, property, receiver) {
				if (property === '1') {
					events.push('get:inherited');
					return inherited;
				}
				return Reflect.get(items, property, receiver);
			},
		});
		const props = { rows, prefix: 'stable', theme: 't0' };
		const root = mount(TsxStatefulMappedApp, props);
		const button = root.find('.own-2');
		expect(events).toEqual(['get:inherited']);
		expect(button.textContent).toBe('t0:stable:1:inherited:0');
		root.click('.own-2');
		expect(button.textContent).toBe('t0:stable:1:inherited:1');

		events.length = 0;
		inherited = { id: 2, label: 'updated' };
		root.update(TsxStatefulMappedApp, props);
		expect(events).toEqual(['get:inherited']);
		expect(root.find('.own-2')).toBe(button);
		expect(button.textContent).toBe('t0:stable:1:updated:1');
		root.unmount();
	});

	it('preserves array constructor and Symbol.species side effects on every map render', () => {
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		function Species(length: number): unknown[] {
			events.push(`species:new:${length}`);
			return new Array(length);
		}
		const customConstructor = {
			get [Symbol.species]() {
				events.push('species:get');
				return Species;
			},
		};
		Object.defineProperty(rows, 'constructor', {
			configurable: true,
			get() {
				events.push('constructor:get');
				return customConstructor;
			},
		});
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};
		const root = mount(TsxCustomMapApp, { rows, prefix: 'species', onItem });
		expect(events).toEqual([
			'constructor:get',
			'species:get',
			'species:new:2',
			'callback:1:0',
			'callback:2:1',
		]);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'species:0:first',
			'species:1:second',
		]);

		events.length = 0;
		root.update(TsxCustomMapApp, { rows, prefix: 'updated species', onItem });
		expect(events).toEqual([
			'constructor:get',
			'species:get',
			'species:new:2',
			'callback:1:0',
			'callback:2:1',
		]);
		expect(root.findAll('#tsx-custom-map-rows li').map((row) => row.textContent)).toEqual([
			'updated species:0:first',
			'updated species:1:second',
		]);
		root.unmount();
	});

	it('evaluates a side-effecting map receiver getter exactly once per render', () => {
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const source = {
			get rows() {
				events.push('receiver:get');
				return rows;
			},
		};
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};

		const root = mount(TsxGetterMapApp, { source, prefix: 'initial', onItem });
		expect(events).toEqual(['receiver:get', 'callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-getter-map-rows li').map((row) => row.textContent)).toEqual([
			'initial:0:first',
			'initial:1:second',
		]);

		events.length = 0;
		root.update(TsxGetterMapApp, { source, prefix: 'updated', onItem });
		expect(events).toEqual(['receiver:get', 'callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-getter-map-rows li').map((row) => row.textContent)).toEqual([
			'updated:0:first',
			'updated:1:second',
		]);
		root.unmount();
	});

	it('evaluates a map thisArg expression before invoking its callback', () => {
		const events: string[] = [];
		const rows = [
			{ id: 1, label: 'first' },
			{ id: 2, label: 'second' },
		];
		const makeThisArg = () => {
			events.push('thisArg');
			return { prefix: 'ignored by arrow' };
		};
		const onItem = (id: number, index: number): string => {
			events.push(`callback:${id}:${index}`);
			return `${id}:${index}`;
		};

		const root = mount(TsxMapExtraArgumentApp, {
			rows,
			prefix: 'initial',
			makeThisArg,
			onItem,
		});
		expect(events).toEqual(['thisArg', 'callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-extra-map-rows li').map((row) => row.textContent)).toEqual([
			'initial:0:first',
			'initial:1:second',
		]);

		events.length = 0;
		root.update(TsxMapExtraArgumentApp, {
			rows,
			prefix: 'updated',
			makeThisArg,
			onItem,
		});
		expect(events).toEqual(['thisArg', 'callback:1:0', 'callback:2:1']);
		expect(root.findAll('#tsx-extra-map-rows li').map((row) => row.textContent)).toEqual([
			'updated:0:first',
			'updated:1:second',
		]);
		root.unmount();
	});

	it('keeps returned-JSX keyed children reactive to context, their own state, and changed items', () => {
		const root = mount(TsxAutoMemoApp);
		const first = root.find('.own-1');
		const second = root.find('.own-2');
		expect(first.textContent).toBe('t0:p0:0:a:0');
		expect(second.textContent).toBe('t0:p0:1:b:0');

		root.click('.own-1');
		expect(first.textContent).toBe('t0:p0:0:a:1');

		root.click('#tsx-auto-tick');
		expect(root.find('.own-1')).toBe(first);
		expect(root.find('.own-2')).toBe(second);
		expect(first.textContent).toBe('t0:p0:0:a:1');

		root.click('#tsx-auto-theme');
		expect(first.textContent).toBe('t0!:p0:0:a:1');
		expect(second.textContent).toBe('t0!:p0:1:b:0');

		root.click('#tsx-auto-item');
		expect(root.find('.own-1')).toBe(first);
		expect(root.find('.own-2')).toBe(second);
		expect(first.textContent).toBe('t0!:p0:0:a!:1');
		expect(second.textContent).toBe('t0!:p0:1:b:0');

		root.click('#tsx-auto-item-theme');
		expect(root.find('.own-1')).toBe(first);
		expect(root.find('.own-2')).toBe(second);
		expect(first.textContent).toBe('t0!!:p0:0:a!!:1');
		expect(second.textContent).toBe('t0!!:p0:1:b:0');
		root.unmount();
	});

	it('refreshes returned-JSX keyed survivors when a parent capture or their index changes', () => {
		const root = mount(TsxAutoMemoApp);
		const first = root.find('.own-1');
		const second = root.find('.own-2');

		root.click('.own-1');
		root.click('#tsx-auto-prefix');
		expect(root.find('.own-1')).toBe(first);
		expect(root.find('.own-2')).toBe(second);
		expect(first.textContent).toBe('t0:p0!:0:a:1');
		expect(second.textContent).toBe('t0:p0!:1:b:0');

		root.click('#tsx-auto-reorder');
		expect(root.findAll('#tsx-auto-rows button')).toEqual([second, first]);
		expect(second.textContent).toBe('t0:p0!:0:b:0');
		expect(first.textContent).toBe('t0:p0!:1:a:1');
		root.unmount();
	});

	it('re-reads mutable accessors in returned-JSX lists when item identities stay unchanged', () => {
		const root = mount(TsxImpureRowsApp);
		const rows = () => root.findAll('.tsx-impure-row').map((row) => row.textContent);
		expect(rows()).toEqual(['first:v0', 'second:v0']);

		root.click('#tsx-impure-advance');
		expect(rows()).toEqual(['first:v1', 'second:v1']);

		root.click('#tsx-impure-advance');
		expect(rows()).toEqual(['first:v2', 'second:v2']);
		root.unmount();
	});

	it('emits the full memo boundary by default only for a production-safe call', () => {
		const source = `
			function Rows(props) @{
				<ul>@for (const item of props.items; key item.id) { <li>{item.label as string}</li> }</ul>
			}
			function Returned(props) { return <p>{props.label}</p>; }
			export function App(props) @{ <><Rows items={props.items} /><Returned label={props.label} /></> }
		`;
		const defaultBuild = compile(source, 'auto-memo-codegen.tsrx', { hmr: false }).code;
		const optedOut = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: false,
			autoMemo: false,
		}).code;
		const hmrBuild = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: 'vite',
			autoMemo: true,
		}).code;
		const devBuild = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: false,
			dev: true,
			autoMemo: true,
		}).code;
		const profileBuild = compile(source, 'auto-memo-codegen.tsrx', {
			hmr: false,
			profile: true,
			autoMemo: true,
		}).code;
		const serverBuild = compile(source, 'auto-memo-codegen.tsrx', {
			mode: 'server',
			autoMemo: true,
		}).code;

		expectCompilerRegion(defaultBuild);
		// Rows is hookless and cannot read context, so its cache keeps it lite.
		expect(defaultBuild).toContain('componentSlotLite as');
		expect(defaultBuild).toContain('componentSlot as');
		expect(defaultBuild).toMatch(/const __memoDep[\w$]* = \(?props\.items\)?;/);
		expect(defaultBuild).toMatch(/const __memoDep[\w$]* = \(?props\.label\)?;/);
		expect(defaultBuild).not.toMatch(/const __memoDep[\w$]* = \(?props\)?;/);
		expect(defaultBuild).toMatch(
			/if \([^{}]*!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlotLite\([^;]*, Rows,/,
		);
		expect(defaultBuild).toMatch(
			/if \([^{}]*!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlot\([^;]*, Returned,/,
		);
		expectNoCompilerRegion(optedOut);
		expectNoCompilerRegion(hmrBuild);
		expectNoCompilerRegion(devBuild);
		expectNoCompilerRegion(profileBuild);
		expectNoCompilerRegion(serverBuild);

		const typed = compile(
			`import { type Foo, value } from './types';
			 function Child(props) @{ const x = props.x as Foo; <span>{x}</span> }
			 function App(props) @{ <Child x={props.x} /> }`,
			'auto-memo-types.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(typed);
		expect(typed).toContain('componentSlotVoid as');
		expect(typed).toMatch(
			/if \([^{}]*!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlotVoid\([^;]*, Child,/,
		);
		expect(typed).not.toMatch(/const __memoDep[\w$]* = \(?Foo\)?;/);

		const shadowed = compile(
			`function Other() @{ <i>{'module component'}</i> }
			 function Child(props) @{ <span>{props.value}</span> }
			 function App(props) @{ const Other = props.value; <Child value={Other} /> }`,
			'auto-memo-shadow.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(shadowed);
		expect(shadowed).toMatch(
			/const __memoDep[\w$]* = \(?Other\)?;[\s\S]*?_\$componentSlotVoid\([^;]*, Child, \{\s*['"]value['"]: \(?Other\)?\s*\}/,
		);

		const nestedDefaultMemo = compile(
			`import { memo } from 'octane';
			 function RowImpl(props) @{ <li>{props.value}</li> }
			 const Row = memo(RowImpl);
			 function Rows(props) @{ <ul><Row value={props.value} /></ul> }
			 function App(props) @{ <Rows value={props.value} /> }`,
			'auto-memo-nested-default.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(nestedDefaultMemo);
		expect(nestedDefaultMemo).toContain('componentSlotVoid as');
		expect(nestedDefaultMemo).toContain('compilerCacheContext as');
		expect(nestedDefaultMemo).toMatch(
			/if \([^{}]*!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlotVoid\([^;]*, Rows,/,
		);

		const nestedCustomMemo = compile(
			`import { memo } from 'octane';
			 function RowImpl(props) @{ <li>{props.value}</li> }
			 const Row = memo(RowImpl, () => false);
			 function Rows(props) @{ <ul><Row value={props.value} /></ul> }
			 function App(props) @{ <Rows value={props.value} /> }`,
			'auto-memo-nested-custom.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(nestedCustomMemo);

		const transitiveCapture = compile(
			`import { live } from './live';
			 function Inner() @{ <span>{live}</span> }
			 function Wrapper() @{ <div><Inner /></div> }
			 function App() @{ <Wrapper /> }`,
			'auto-memo-transitive-capture.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expect(transitiveCapture.match(/const __memoDep[\w$]* = \(?live\)?;/g)).toHaveLength(2);
	});

	it('classifies stable hookful dependency graphs independently of declaration order', () => {
		const compileGraph = (
			declarations: string,
			root = 'StableParent',
			privateLets = 'leafSetter',
		) =>
			compile(
				`import { useState } from 'octane';
				 import { live } from './live';
				 let ${privateLets
						.split(',')
						.map((name) => `${name} = null`)
						.join(', ')};
				 ${declarations}
				 function StableProbe() @{
					const [tick, setTick] = useState(0);
					<section><${root} /></section>
				 }
				 export function App() @{ <StableProbe /> }`,
				'auto-memo-stable-hookful-graph.tsrx',
				{ hmr: false, dev: false, autoMemo: true },
			).code;
		const graphSummary = (code: string, publications: string[]) => ({
			captures: code.match(/const __memoDep[\w$]* = \(?live\)?;/g)?.length ?? 0,
			publications: publications.reduce(
				(count, publication) =>
					count + (code.match(new RegExp(`!== ${publication}\\b`, 'g'))?.length ?? 0),
				0,
			),
		});
		const leaf = `function StableLeaf() @{
			const [value, setValue] = useState(0);
			leafSetter = setValue;
			<span>{live + value as string}</span>
		}`;
		const parent = `function StableParent() @{ <StableLeaf /> }`;

		expect(graphSummary(compileGraph(`${leaf}\n${parent}`), ['leafSetter'])).toEqual({
			captures: 1,
			publications: 1,
		});
		expect(graphSummary(compileGraph(`${parent}\n${leaf}`), ['leafSetter'])).toEqual({
			captures: 1,
			publications: 1,
		});

		const cycle = compileGraph(
			`function CycleA() @{
				const [value, setValue] = useState(0);
				leafSetter = setValue;
				<><CycleB /><span>{live + value as string}</span></>
			 }
			 function CycleB() @{ <><CycleA /><CycleA /></> }`,
			'CycleB',
		);
		expect(graphSummary(cycle, ['leafSetter'])).toEqual({
			captures: 2,
			publications: 2,
		});

		const publicationGraph = (count: number) => {
			const names = Array.from({ length: count }, (_, index) => `setter${index}`);
			const leaves = names
				.map(
					(name, index) => `function PublicationLeaf${index}() @{
						const [value, setValue] = useState(0);
						${name} = setValue;
						<span>{live + value as string}</span>
					}`,
				)
				.join('\n');
			const calls = names.map((_, index) => `<PublicationLeaf${index} />`).join('');
			return {
				code: compileGraph(
					`${leaves}\nfunction PublicationParent() @{ <>${calls}</> }`,
					'PublicationParent',
					names.join(','),
				),
				names,
			};
		};
		const atLimit = publicationGraph(16);
		const aboveLimit = publicationGraph(17);
		expect(graphSummary(atLimit.code, atLimit.names)).toEqual({
			captures: 1,
			publications: 16,
		});
		expect(graphSummary(aboveLimit.code, aboveLimit.names)).toEqual({
			captures: 0,
			publications: 0,
		});
	});

	it('preserves authored locals that overlap compiler-generated names', () => {
		const selections: string[] = [];
		const root = mount(CompilerNameCollisionApp, {
			first: 1,
			second: 2,
			third: 3,
			fourth: 4,
			fifth: 5,
			sixth: 6,
			onSelect: () => selections.push('selected'),
		});

		expect(root.find('#compiler-name-collision-total').textContent).toBe('21');
		root.click('#compiler-name-collision');
		expect(selections).toEqual(['selected']);

		root.update(CompilerNameCollisionApp, {
			first: 2,
			second: 3,
			third: 4,
			fourth: 5,
			fifth: 6,
			sixth: 7,
			onSelect: () => selections.push('updated'),
		});
		expect(root.find('#compiler-name-collision-total').textContent).toBe('27');
		root.click('#compiler-name-collision');
		expect(selections).toEqual(['selected', 'updated']);
		root.unmount();
	});

	it('memoizes destructured-props callees while pattern-evaluating shapes fall back', () => {
		// A destructuring param is the same one-props snapshot as `(props)`,
		// read once at entry, so these callees earn the region cache.
		const admitted = [
			`function Child({ rows }) @{ <ul>@for (const r of rows; key r.id) { <li>{r.label}</li> }</ul> }`,
			`function Child({ rows: list }) @{ <div>{list.length}</div> }`,
			`function Child({ data: { rows } }) @{ <div>{rows.length}</div> }`,
			`function Child({ label, ...rest }) @{ <div>{label + rest.suffix}</div> }`,
		];
		for (const child of admitted) {
			const code = compile(
				`${child}\nexport function App(props) @{ <Child rows={props.rows} label={props.label} data={props.data} /> }`,
				'auto-memo-destructured.tsrx',
				{ hmr: false, autoMemo: true },
			).code;
			expectCompilerRegion(code);
			expect(code).toMatch(
				/!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlot/,
			);
		}

		// Patterns that evaluate expressions of their own (defaults, computed
		// keys), read mutable ref contents (`current`), or run the iterator
		// protocol (array patterns) keep ordinary entry semantics.
		const rejected = [
			`import { fallback } from './live'; function Child({ label = fallback }) @{ <div>{label}</div> }`,
			`import { field } from './live'; function Child({ [field]: value }) @{ <div>{value}</div> }`,
			`function Child({ current }) @{ <div>{current}</div> }`,
			`function Child({ box: { current } }) @{ <div>{current}</div> }`,
			`function Child({ pair: [a, b] }) @{ <div>{a + b}</div> }`,
			`function Child({ label }, extra) @{ <div>{label}</div> }`,
		];
		for (const child of rejected) {
			// The caller passes only site-clean props, so a fallback here is the
			// CALLEE pattern's verdict, not a call-site rejection.
			const code = compile(
				`${child}\nexport function App(props) @{ <Child label={props.label} box={props.box} pair={props.pair} /> }`,
				'auto-memo-destructured-fallback.tsrx',
				{ hmr: false, autoMemo: true },
			).code;
			expectNoCompilerRegion(code);
		}
	});

	it('scopes ref and live-import laundering to the call sites that read it', () => {
		// A ref read elsewhere in the body must not veto an unrelated call site:
		// the site's own props are walked directly, and reads laundered through a
		// local are carried by the per-local hazard set.
		const unrelatedRefRead = compile(
			`import { useRef } from 'octane';
			 function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				const overlayRef = useRef(null);
				<div>
					<span ref={overlayRef}>{(overlayRef.current !== null ? 'y' : 'n') as string}</span>
					<Child value={props.value} />
				</div>
			 }`,
			'auto-memo-hazard-unrelated.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(unrelatedRefRead);
		expect(unrelatedRefRead).toMatch(
			/!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlot[\w$]*\([^;]*, Child,/,
		);

		// Laundering the read through locals — directly, transitively, or via a
		// reassignment whose write site the declaration no longer accounts for —
		// still keeps ordinary entry semantics for the sites that consume them.
		// The pattern side of a declaration can carry the read itself (a
		// `current` binding, a default reading a live import), and hazards can
		// route through nested-block or loop declarations before reaching a
		// top-level local; all of these must taint like their expression forms.
		const launderedLocals = [
			`function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				const { current: el } = props.refObj;
				<Child value={el} />
			 }`,
			`import { cell } from './live';
			 function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				const { label = cell.value } = props;
				<Child value={label} />
			 }`,
			`function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				let latest = null;
				for (const sample of props.refObj.current.samples) {
					latest = sample;
				}
				<Child value={latest} />
			 }`,
			`function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				let out = null;
				if (props.enabled) {
					const grabbed = props.refObj.current;
					out = grabbed;
				}
				<Child value={out} />
			 }`,
			`function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				const first = props.refObj.current;
				const second = first + 1;
				<Child value={second} />
			 }`,
			`import { cell } from './live';
			 function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				const base = cell.value;
				const derived = base + 1;
				<Child value={derived} />
			 }`,
			`function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				let value = props.base;
				if (props.useOverlay) value = props.refObj.current;
				<Child value={value} />
			 }`,
		];
		for (const source of launderedLocals) {
			const code = compile(source, 'auto-memo-hazard-laundered.tsrx', {
				hmr: false,
				autoMemo: true,
			}).code;
			expectNoCompilerRegion(code);
		}

		// A conditionally reassigned plain-value local stays a complete witness
		// of itself — locals re-initialize on every body entry — so the site
		// keeps its region.
		const reassignedClean = compile(
			`function Child(props) @{ <div>{props.value}</div> }
			 export function App(props) @{
				let value = props.base;
				if (props.flip) value = props.other;
				<Child value={value} />
			 }`,
			'auto-memo-hazard-clean-reassign.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectCompilerRegion(reassignedClean);
	});

	it('caches regions whose host elements take spread bags', () => {
		// A host spread is one runtime-diffed binding over a bag reachable only
		// from deps the region guard already witnesses — the same immutable-
		// snapshot read as a member-read attribute, so it cannot make a skip
		// observable. Component-tag spreads instead build a child's props
		// snapshot (getters run, prop names are hidden) and keep failing closed.
		const admitted = [
			`function Child(props) @{ <div class={props.cls} {...props.attrs}>{props.label}</div> }`,
			// The svg-dashboard Topology shape: keyed rows spreading per-item bags.
			`function Child({ topo }) @{
				<g class="t">
					@for (const e of topo.edges; key e.id) {
						<path class={e.cls} d={e.d} {...e.attrs}></path>
					}
				</g>
			 }`,
		];
		for (const child of admitted) {
			const code = compile(
				`${child}\nexport function App(props) @{ <Child cls={props.cls} attrs={props.attrs} label={props.label} topo={props.topo} /> }`,
				'auto-memo-host-spread.tsrx',
				{ hmr: false, autoMemo: true },
			).code;
			expectCompilerRegion(code);
		}

		// The tsx dialect's map-lowered keyed rows earn their list cache the same
		// way (JSXSpreadAttribute instead of SpreadAttribute). mapSlot guards
		// carry an extra native-receiver clause, so assert the cache pieces
		// directly rather than through the componentSlot-shaped helper.
		const tsxCode = compile(
			`export function Rows(props) {
				return (
					<ul>
						{props.rows.map((r) => (
							<li key={r.id} className={r.cls} {...r.attrs}>{r.label}</li>
						))}
					</ul>
				);
			}`,
			'auto-memo-host-spread.tsx',
			{ hmr: false, autoMemo: true },
		).code;
		expect(tsxCode).toContain('__memoCommitted');
		expect(tsxCode).toMatch(/!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)/);

		const rejected = [
			// A component-tag spread nested in the callee body…
			`function Inner(props) @{ <b>{props.v}</b> }
			 function Child(props) @{ <div><Inner {...props.bag} /></div> }
			 export function App(props) @{ <Child bag={props.bag} /> }`,
			// …and at the call site itself (callSiteOk) keep ordinary entry.
			`function Child(props) @{ <div>{props.v}</div> }
			 export function App(props) @{ <Child {...props.bag} /> }`,
			// The spread ARGUMENT still walks under every other rule: accessors,
			// computed members, and ref reads inside it keep failing closed.
			`function Child(props) @{ <div {...{ get a() { return props.source.current; } }}></div> }
			 export function App(props) @{ <Child source={props.source} /> }`,
			`function Child(props) @{ <div {...props.bags[props.k]}></div> }
			 export function App(props) @{ <Child bags={props.bags} k={props.k} /> }`,
			// A statically witnessed ref keeps its pinned rejection; a bag
			// alongside does not rescue it.
			`function Child(props) @{ <div ref={props.refObj} {...props.attrs}></div> }
			 export function App(props) @{ <Child refObj={props.refObj} attrs={props.attrs} /> }`,
		];
		for (const source of rejected) {
			const code = compile(source, 'auto-memo-host-spread-fallback.tsrx', {
				hmr: false,
				autoMemo: true,
			}).code;
			expectNoCompilerRegion(code);
		}
	});

	it('re-diffs and skips host spread bags through a cached region', () => {
		const source = `
			function SpreadRows({ rows }) @{
				<ul id="auto-memo-spread-rows">
					@for (const item of rows; key item.id) {
						<li data-id={item.id} {...item.attrs}>{item.label as string}</li>
					}
				</ul>
			}
			export function App(props) @{
				<div>
					<span id="auto-memo-spread-version">{props.version as string}</span>
					<SpreadRows rows={props.rows} />
				</div>
			}
		`;
		// The scenario below must exercise the cached path, so pin that this
		// exact fixture earns its regions under the same compile options.
		expectCompilerRegion(
			compile(source, 'auto-memo-host-spread-runtime.tsrx', { hmr: false, dev: false }).code,
		);
		const client = loadCompiledFixtureSource(source, {
			id: 'auto-memo-host-spread-runtime.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false },
		});

		type Bag = Record<string, unknown>;
		const events: string[] = [];
		const firstRef: { current: Element | null } = { current: null };
		const rows1 = [
			{
				id: 1,
				label: 'alpha',
				attrs: {
					'data-x': 'a1',
					title: 'first',
					onClick: () => events.push('bag:1'),
					ref: firstRef,
				} as Bag,
			},
			{ id: 2, label: 'beta', attrs: { 'data-x': 'b1' } as Bag },
		];
		const root = mount(client.App, { version: 'v0', rows: rows1 });
		const rowsBefore = root.findAll('#auto-memo-spread-rows > li');
		expect(rowsBefore.map((row) => row.getAttribute('data-x'))).toEqual(['a1', 'b1']);
		expect(rowsBefore[0]!.getAttribute('title')).toBe('first');
		expect(firstRef.current).toBe(rowsBefore[0]);
		root.click('[data-x="a1"]');
		expect(events).toEqual(['bag:1']);

		// Unchanged deps: the region skips. Under the immutable-snapshot
		// contract an in-place bag mutation is invisible while `rows` keeps its
		// identity — the same bail React.memo performs — and the bag's ref and
		// handler stay live on the same node.
		rows1[1]!.attrs['data-mutated'] = 'yes';
		root.update(client.App, { version: 'v1', rows: rows1 });
		expect(root.find('#auto-memo-spread-version')!.textContent).toBe('v1');
		const rowsSkipped = root.findAll('#auto-memo-spread-rows > li');
		expect(rowsSkipped[0]).toBe(rowsBefore[0]);
		expect(rowsSkipped[1]!.hasAttribute('data-mutated')).toBe(false);
		expect(firstRef.current).toBe(rowsBefore[0]);
		root.click('[data-x="a1"]');
		expect(events).toEqual(['bag:1', 'bag:1']);

		// Changed deps: the region re-enters and re-diffs each bag — a changed
		// key applies, a vanished key clears, and a swapped ref detaches the old
		// holder before attaching the new. Keyed survivors keep DOM identity.
		const secondRef: { current: Element | null } = { current: null };
		const rows2 = [
			{
				id: 1,
				label: 'alpha',
				attrs: {
					'data-x': 'a2',
					onClick: () => events.push('bag:2'),
					ref: secondRef,
				} as Bag,
			},
			{ id: 2, label: 'beta', attrs: { 'data-x': 'b1' } as Bag },
		];
		root.update(client.App, { version: 'v2', rows: rows2 });
		const rowsAfter = root.findAll('#auto-memo-spread-rows > li');
		expect(rowsAfter[0]).toBe(rowsBefore[0]);
		expect(rowsAfter[1]).toBe(rowsBefore[1]);
		expect(rowsAfter[0]!.getAttribute('data-x')).toBe('a2');
		expect(rowsAfter[0]!.hasAttribute('title')).toBe(false);
		expect(firstRef.current).toBe(null);
		expect(secondRef.current).toBe(rowsAfter[0]);
		root.click('[data-x="a2"]');
		expect(events).toEqual(['bag:1', 'bag:1', 'bag:2']);

		root.unmount();
		expect(secondRef.current).toBe(null);
	});

	it('judges each component in a module on its own imported reads', () => {
		// Every component is analysed against its own body. Both declaration
		// orders are checked because a verdict leaking from one component to the
		// next would only be visible in one direction.
		const cases = [
			[
				'impure declared first',
				`import { Menu } from './menu';
				 function Dirty(props) @{ <b>{props.v}<Menu.Item /></b> }
				 function Clean(props) @{ <i>{props.v}</i> }
				 export function App(props) @{ <div><Dirty v={props.a} /><Clean v={props.b} /></div> }`,
			],
			[
				'pure declared first',
				`import { Menu } from './menu';
				 function Clean(props) @{ <i>{props.v}</i> }
				 function Dirty(props) @{ <b>{props.v}<Menu.Item /></b> }
				 export function App(props) @{ <div><Clean v={props.b} /><Dirty v={props.a} /></div> }`,
			],
		];
		for (const [order, source] of cases) {
			const code = compile(source, 'auto-memo-per-component.tsrx', {
				hmr: false,
				autoMemo: true,
			}).code;
			expect(
				/!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlot[A-Za-z]*\([^;]*, Clean,/.test(
					code,
				),
				`${order}: the component reading no import should memoize`,
			).toBe(true);
			expect(
				/!_\$hookMemoEqual\(__memoCache[\w$]*\[\d+\], __memoDep[\w$]*\)\) \{\s*_\$componentSlot[A-Za-z]*\([^;]*, Dirty,/.test(
					code,
				),
				`${order}: the component reading an imported member should not memoize`,
			).toBe(false);
		}
	});

	it('re-enters a keyed survivor whose cache a held root update rolled back', async () => {
		const client = loadCompiledFixtureSource(
			`import { use } from 'octane';
			 function Item(props) @{ <li>{props.value + ':' + props.label}</li> }
			 function Reader(props) @{
				const value = use(props.promise);
				<output>{value as string}</output>
			 }
			 export function App(props) @{
				<main>
					<ul>
						@for (const item of props.items; key item) {
							<Item value={item} label={props.label} />
						}
					</ul>
					<Reader promise={props.promise} />
				</main>
			 }`,
			{
				id: 'held-root-survivor.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
			},
		);
		const first = Promise.resolve('first');
		const root = mount(client.App, {
			label: 'previous',
			items: ['remove', 'keep'],
			promise: first,
		});
		await act(() => first);
		let resolve!: (value: string) => void;
		const next = new Promise<string>((done) => (resolve = done));
		await act(() =>
			root.root.render(client.App, { label: 'next', items: ['add', 'keep'], promise: next }),
		);
		expect(root.findAll('li').map((li) => li.textContent)).toEqual([
			'remove:previous',
			'keep:previous',
		]);

		await act(() => resolve('second'));
		expect(root.find('output').textContent).toBe('second');
		expect(root.findAll('li').map((li) => li.textContent)).toEqual(['add:next', 'keep:next']);
		root.unmount();
	});

	it('keeps an unproven imported component live when parent props are unchanged', () => {
		let label = 'first';
		const client = loadCompiledFixtureSource(
			`import { Icon } from './icon';
			 function Child(props) @{ <span>{props.v}<Icon /></span> }
			 export function App(props) @{ <Child v={props.v} /> }`,
			{
				id: 'auto-memo-witness.tsrx',
				mode: 'client',
				compileOptions: { hmr: false, dev: false },
				runtimeModules: { './icon': { Icon: () => label } },
			},
		);
		const root = mount(client.App, { v: 'label:' });
		expect(root.find('span').textContent).toBe('label:first');
		label = 'second';
		root.update(client.App, { v: 'label:' });
		expect(root.find('span').textContent).toBe('label:second');
		root.unmount();
	});

	it('rejects a callback that reads a ref through a binding pattern', () => {
		// A callback handed to a child can be invoked during that child's render,
		// so a ref read hidden in the callback's own pattern still counts.
		for (const child of [
			`function Child(props) @{ <b onClick={({ current }) => current}>{props.v}</b> }`,
			`function Child(props) @{ <b onClick={(e) => { const { current } = e; return current; }}>{props.v}</b> }`,
			`function Child(props) @{ <b onClick={([{ current }]) => current}>{props.v}</b> }`,
		]) {
			const code = compile(
				`${child}\nexport function App(props) @{ <Child v={props.v} /> }`,
				'auto-memo-callback-ref.tsrx',
				{ hmr: false, autoMemo: true },
			).code;
			expectNoCompilerRegion(code);
		}
		// A callback with no ref read stays eligible, so the rejection is specific.
		expectCompilerRegion(
			compile(
				`function Child(props) @{ <b onClick={(e) => e}>{props.v}</b> }
				 export function App(props) @{ <Child v={props.v} /> }`,
				'auto-memo-callback-plain.tsrx',
				{ hmr: false, autoMemo: true },
			).code,
		);
	});

	it('falls back for impure calls, refs, and direct Suspense boundaries', () => {
		const cases = [
			`function Child(props) @{ <div>{props.read()}</div> }`,
			`function Child(props) @{ delete props.source.value; <div /> }`,
			`function Child(props) @{ <div ref={props.refObj}>{props.value}</div> }`,
			`function Child(props) @{ <div>{props.refObj['current']}</div> }`,
			`function Child(props) @{ <div>{props.refObj[props.field]}</div> }`,
			`function Child(props) @{ const { current } = props.refObj; <div>{current}</div> }`,
			`import { memo } from 'octane'; function SinkImpl(props) @{ <span>{props.render()}</span> } const Sink = memo(SinkImpl); function Child(props) @{ <Sink render={() => props.refObj.current} /> }`,
			`function Child(props) @{ const box = { get value() { return props.source.current; } }; <div>{box.value}</div> }`,
			`function Child(props) @{ const box = { toString() { return props.source.current; } }; <div>{box as string}</div> }`,
			`import { Suspense } from 'octane'; function Child(props) @{ <Suspense fallback={null}>{props.value}</Suspense> }`,
			`import { ViewTransition as VT } from 'octane'; function Child(props) @{ <VT>{props.value}</VT> }`,
			`import { ErrorBoundary as Boundary } from 'octane'; function Child(props) @{ <Boundary fallback={null}>{props.value}</Boundary> }`,
			`let ambient = 'a'; function Child() @{ <div>{ambient}</div> }`,
			// A JSX member read of an import is caught by the free-identifier check,
			// not by the member-read predicate: a JSX member chain bottoms out at a
			// JSXIdentifier, which that predicate's base test does not match.
			`import { Menu } from './menu'; function Child(props) @{ <div>{props.value}<Menu.Item /></div> }`,
			`import { Menu } from './menu'; function Child(props) @{ <div>{props.value}<Menu.Item.Deep /></div> }`,
			`import { Menu } from './menu'; function Child(props) @{ <div title={Menu.label}>{props.value}</div> }`,
		];
		for (const child of cases) {
			const code = compile(
				`${child}\nexport function App(props) @{ <Child value={props.value} read={props.read} refObj={props.refObj} source={props.source} /> }`,
				'auto-memo-fallback.tsrx',
				{ hmr: false, autoMemo: true },
			).code;
			expectNoCompilerRegion(code);
		}

		const nonlocalCallSites = [
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ <Child value={props.enabled && props.data.value} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ <Child value={props.enabled ? props.data.value : 'off'} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ <Child value={props.data?.value} /> }`,
			`import { createContext, useContext } from 'octane'; const Context = createContext('a'); function Consumer() @{ const value = useContext(Context); <span>{value}</span> } function Sink(props) @{ <div>{props.icon}</div> } function App() @{ <Sink icon={<Consumer />} /> }`,
			`let ambient = 'a'; function Child(props) @{ <div>{props.value}</div> } function App() @{ <Child value={ambient} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App() @{ <Child value={window.value} /> }`,
			`import * as live from './live'; function Child() @{ <div>{live.value}</div> } function App() @{ <Child /> }`,
			`import * as live from './live'; function Child(props) @{ <div>{props.value}</div> } function App() @{ const ns = live; <Child value={ns.value} /> }`,
			`function Child(props) @{ <div>{props.value}</div> } function App(props) @{ const value = props.refObj.current; <Child value={value} /> }`,
			`import { cell } from './live'; function Child(props) @{ <div>{props.value}</div> } function App() @{ <Child value={cell.value} /> }`,
			`import { cell } from './live'; function Child(props) @{ <div>{props.value}</div> } function App() @{ const value = cell.value; <Child value={value} /> }`,
			`import { cell } from './live'; function Child() @{ <div>{cell.value}</div> } function App() @{ <Child /> }`,
		];
		for (const source of nonlocalCallSites) {
			const code = compile(source, 'auto-memo-nonlocal.tsrx', {
				hmr: false,
				autoMemo: true,
			}).code;
			expectNoCompilerRegion(code);
		}

		const transitiveImpurity = compile(
			`let count = 0;
			 function Impure() @{ count++; <span>{count as string}</span> }
			 function Wrapper() @{ <div><Impure /></div> }
			 function App() @{ <Wrapper /> }`,
			'auto-memo-transitive.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(transitiveImpurity);

		const destructuringDefault = compile(
			`import { fallback } from './live';
			 function Rows(props) @{
				<ul>@for (const { label = fallback } of props.items; key label) { <li>{label}</li> }</ul>
			 }
			 function App(props) @{ <Rows items={props.items} /> }`,
			'auto-memo-binding-default.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(destructuringDefault);

		const computedBinding = compile(
			`import { field } from './live';
			 function Child(props) @{ const { [field]: value } = props.source; <span>{value}</span> }
			 function App(props) @{ <Child source={props.source} /> }`,
			'auto-memo-computed-binding.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(computedBinding);

		const dynamicImport = compile(
			`function Child() @{ const promise = import('./lazy'); <span>{promise as string}</span> }
			 function App() @{ <Child /> }`,
			'auto-memo-dynamic-import.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expectNoCompilerRegion(dynamicImport);
	});
});

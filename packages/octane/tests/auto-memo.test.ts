import { describe, expect, it } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { compile } from '../src/compiler/compile.js';
import { createElement, flushSync, hydrateRoot } from '../src/index.js';
import { flushEffects, mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';
import { AutoMemoApp } from './_fixtures/auto-memo.tsrx';
import { ParentCaptureApp } from './_fixtures/auto-memo-parent-capture.tsrx';
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

function trailingVersion(text: string | null): number {
	return Number(text?.match(/(\d+)$/)?.[1]);
}

function expectCompilerRegion(code: string): void {
	expect(code).toMatch(/const __memoCommitted[\w$]* = __s\.slots\._m\$\d+;/);
	expect(code).toMatch(/__s\.slots\[\d+\] === undefined \|\| __memoCache/);
	// Dependencies are snapshotted into temporaries once per render; the guard
	// compares and publishes those exact values.
	expect(code).toMatch(/const __memoDep[\w$]* = \(?[^;]+\)?;/);
	expect(code).toMatch(/__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*/);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* === __memoCommitted[\w$]*\) __memoCache[\w$]* = __memoCache[\w$]*\.slice\(\);/,
	);
	expect(code).toMatch(
		/if \(__memoCache[\w$]* !== __memoCommitted[\w$]*\) __s\.slots\._m\$\d+ = __memoCache[\w$]*;/,
	);
}

function expectNoCompilerRegion(code: string): void {
	expect(code).not.toContain('__memoCommitted');
	expect(code).not.toContain('compilerCacheContext');
}

function loadMappedHydrationComponents() {
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
			return <Theme.Provider value={props.theme}><Rows {...props} /></Theme.Provider>;
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

describe('compiler-owned component-region memoization', () => {
	it('preserves dependency, context, child-state, and custom-comparator behavior', () => {
		const root = mount(AutoMemoApp);
		const initialOpaqueVersion = trailingVersion(root.find('.opaque').textContent);
		expect(root.find('.own-1').textContent).toBe('t0:a:0');
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

		root.click('.own-1');
		expect(root.find('.own-1').textContent).toBe('t0:a:1');

		root.click('#auto-context');
		expect(root.find('.own-1').textContent).toBe('t0!:a:1');
		expect(root.find('#auto-returned').textContent).toBe('returned t0!');

		root.click('#auto-item');
		expect(root.find('.own-1').textContent).toBe('t0!:a!:1');

		// A dependency miss and Provider change can commit in the same render. The
		// changed row re-enters through the keyed list, while the unchanged row must
		// still receive the context refresh despite its PURE survivor bailout.
		root.click('#auto-item-context');
		expect(root.find('.own-1').textContent).toBe('t0!!:a!!:1');
		expect(root.find('.own-2').textContent).toBe('t0!!:b:0');

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

	it('preserves promise-valued children from async map callbacks', () => {
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
		expect(() => mount(client.App, { rows, onItem })).toThrow(
			/Objects are not valid as an Octane child.*\[object Promise\]/,
		);
		expect(events).toEqual(['callback:1']);

		events.length = 0;
		const server = loadCompiledFixtureSource(source, {
			id: 'tsx-async-map.tsx',
			mode: 'server',
			compileOptions: { hmr: false, dev: false },
		});
		expect(() => ServerRuntime.renderToString(server.App, { rows, onItem })).toThrow(
			/Objects are not valid as an Octane child.*\[object Promise\]/,
		);
		expect(events).toEqual(['callback:1']);
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
				<ul>@for (const item of props.items; key item.id) { <li>{item.label}</li> }</ul>
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
		expect(defaultBuild).toContain('componentSlotVoid as');
		expect(defaultBuild).toContain('componentSlot as');
		expect(defaultBuild).toMatch(/const __memoDep[\w$]* = \(?props\.items\)?;/);
		expect(defaultBuild).toMatch(/const __memoDep[\w$]* = \(?props\.label\)?;/);
		expect(defaultBuild).not.toMatch(/const __memoDep[\w$]* = \(?props\)?;/);
		expect(defaultBuild).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*\) \{\s*_\$componentSlotVoid\([^;]*, Rows,/,
		);
		expect(defaultBuild).toMatch(
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*\) \{\s*_\$componentSlot\([^;]*, Returned,/,
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
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*\) \{\s*_\$componentSlotVoid\([^;]*, Child,/,
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
			/if \([^{}]*__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*\) \{\s*_\$componentSlotVoid\([^;]*, Rows,/,
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
				/__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*\) \{\s*_\$componentSlot[A-Za-z]*\([^;]*, Clean,/.test(
					code,
				),
				`${order}: the component reading no import should memoize`,
			).toBe(true);
			expect(
				/__memoCache[\w$]*\[\d+\] !== __memoDep[\w$]*\) \{\s*_\$componentSlot[A-Za-z]*\([^;]*, Dirty,/.test(
					code,
				),
				`${order}: the component reading an imported member should not memoize`,
			).toBe(false);
		}
	});

	it('re-enters a cached region when an imported component it renders is not memo-stable', () => {
		// The imported component's own memo contract is unknown at compile time, so
		// the cached region must consult it on entry rather than trust its snapshot.
		const code = compile(
			`import { Icon } from './icon';
			 function Child(props) @{ <span>{props.v}<Icon /></span> }
			 export function App(props) @{ <Child v={props.v} /> }`,
			'auto-memo-witness.tsrx',
			{ hmr: false, autoMemo: true },
		).code;
		expect(code).toContain('__memoCommitted');
		expect(code).toMatch(/Icon\.__memo !== true \|\| Icon\.__compare !== undefined/);
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
				<ul>@for (const &{ label = fallback } of props.items; key label) { <li>{label}</li> }</ul>
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

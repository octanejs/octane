import { expect, it } from 'vitest';
import * as UniversalRuntime from 'octane/universal';
import { loadCompiledFixtureSource } from './_server-fixture.js';

const { createObjectContainer, createObjectDriver, createUniversalRoot } = UniversalRuntime;

const cases = [
	['ordinary row control', `@for (const row of rows) { <node name={Array.from(row)[0]} /> }`],
	['implicit positional key', `@for (const [name] of rows) { <node name={name} /> }`],
	[
		'explicit positional key',
		`@for (const [name] of rows; index i; key i) { <node name={name} /> }`,
	],
	[
		'key derived from the destructured row',
		`@for (const [name] of rows; key name) { <node name={name} /> }`,
	],
] as const;

const scenarios = cases.flatMap(([name, loop]) =>
	[false, true].map((dev) => ({ name, loop, dev })),
);

it.each(scenarios)(
	'$name renders one-shot iterator rows correctly (dev=$dev)',
	({ name, loop, dev }) => {
		const { Scene } = loadCompiledFixtureSource(
			`export function Scene() @{ const rows = [['A'].values(), ['B'].values()]; ${loop} }`,
			{
				id: `/src/IteratorRow-${name.replaceAll(' ', '-')}.object.tsrx`,
				mode: 'client',
				compileOptions: {
					dev,
					hmr: false,
					renderer: {
						id: 'object',
						module: 'octane/universal',
						target: 'universal',
						text: 'host',
					},
				},
				runtimeModules: { 'octane/universal': UniversalRuntime },
			},
		);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		try {
			root.render(Scene, undefined);
			expect(container.children.map((child) => child.props.name)).toEqual(['A', 'B']);
		} finally {
			root.unmount();
		}
	},
);

it.each([false, true])(
	'initializes destructured iterator rows once before the key expression (dev=%s)',
	(dev) => {
		const events: string[] = [];
		const { Scene } = loadCompiledFixtureSource(
			`export function Scene({ events }) @{ const rows = [[undefined].values()]; const fallback = () => { events.push('default'); return 'fallback'; }; const nextKey = () => { events.push('key'); return 0; }; @for (const [name = fallback()] of rows; key nextKey()) { <node name={name} /> } }`,
			{
				id: `/src/IteratorRow-default-order-${dev}.object.tsrx`,
				mode: 'client',
				compileOptions: {
					dev,
					hmr: false,
					renderer: {
						id: 'object',
						module: 'octane/universal',
						target: 'universal',
						text: 'host',
					},
				},
				runtimeModules: { 'octane/universal': UniversalRuntime },
			},
		);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		try {
			root.render(Scene, { events });
			expect(container.children.map((child) => child.props.name)).toEqual(['fallback']);
			expect(events).toEqual(['default', 'key']);
		} finally {
			root.unmount();
		}
	},
);

it.each([false, true])(
	'reads destructured object properties once before the key expression (dev=%s)',
	(dev) => {
		const events: string[] = [];
		const { Scene } = loadCompiledFixtureSource(
			`export function Scene({ events }) @{ const rows = [{ get name() { events.push('get'); return 'A'; } }]; @for (const { name } of rows; key name) { <node name={name} /> } }`,
			{
				id: `/src/ObjectRow-getter-${dev}.object.tsrx`,
				mode: 'client',
				compileOptions: {
					dev,
					hmr: false,
					renderer: {
						id: 'object',
						module: 'octane/universal',
						target: 'universal',
						text: 'host',
					},
				},
				runtimeModules: { 'octane/universal': UniversalRuntime },
			},
		);
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		try {
			root.render(Scene, { events });
			expect(container.children.map((child) => child.props.name)).toEqual(['A']);
			expect(events).toEqual(['get']);
		} finally {
			root.unmount();
		}
	},
);

it('keeps prepared items iterable across repeated materialization', () => {
	const rows = [['A'], ['B']];
	const value = UniversalRuntime.universalFor(
		rows,
		(_item, index) => index,
		() => null,
		null,
		null,
		false,
		false,
		undefined,
		undefined,
		false,
		(item) => Array.from(item),
	);
	const materializeItems = () =>
		Array.from(value.items, (item) => Array.from(item as Iterable<string>));

	expect(materializeItems()).toEqual([['A'], ['B']]);
	expect(materializeItems()).toEqual([['A'], ['B']]);
});

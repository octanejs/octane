import { expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import { mount } from './_helpers';
import { loadCompiledFixtureSource } from './_server-fixture.js';

it.each([
	['+', ['1', '2']],
	['-', ['-1', '-2']],
	['~', ['-2', '-3']],
])('preserves callback order for unary %s when keyed rows reverse', (operator, expected) => {
	const { App } = loadCompiledFixtureSource(
		`export function App({ rows }) @{
			<ul>{rows.map(row => <li key={row.id} data-marker={${operator}row} />)}</ul>
		}`,
		{
			id: 'mapped-unary-order.tsrx',
			mode: 'client',
			compileOptions: { hmr: false, dev: false, strong: false },
		},
	);
	let sequence = 0;
	const rows = ['a', 'b'].map((id) => ({
		id,
		[Symbol.toPrimitive]: () => ++sequence,
	}));
	const root = mount(App, { rows });
	const markers = () => root.findAll('li').map((row) => row.getAttribute('data-marker'));
	try {
		const [first, second] = root.findAll('li');
		expect(markers()).toEqual(expected);
		sequence = 0;
		root.update(App, { rows: rows.toReversed() });
		expect(root.findAll('li')).toEqual([second, first]);
		expect(markers()).toEqual(expected);
	} finally {
		root.unmount();
	}
});

it.each([
	['-row', 'second callback'],
	['row.bad ? +1n : 0', TypeError],
] as const)('evaluates %s before serializing the first row', (expression, error) => {
	const { App } = loadCompiledFixtureSource(
		`export function App({ rows }) @{
			<ul>{rows.map(row => <li key={row.id} data-marker={${expression}} title={row.title} />)}</ul>
		}`,
		{
			id: 'mapped-unary-order-ssr.tsrx',
			mode: 'server',
			compileOptions: { hmr: false, dev: false, strong: false },
		},
	);
	const rows = [
		{
			id: 'a',
			title: {
				toString() {
					throw new Error('first title');
				},
			},
			[Symbol.toPrimitive]: () => 1,
		},
		{
			id: 'b',
			bad: true,
			[Symbol.toPrimitive]() {
				throw new Error('second callback');
			},
		},
	];
	expect(() => renderToString(App, { rows })).toThrow(error);
});

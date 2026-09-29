import { describe, expect, it } from 'vitest';
import { lynxMainThreadRenderer, lynxRenderer } from '../../../lynx/src/config.js';
import { compile } from '../../src/compiler/compile.js';

// A `key` attribute on the only output root of a universal `@for` body is the
// row key, the React spelling of `@for (…; key expr)`. Both spellings must
// compile to the same module. Each pair keeps every other token at the same
// source offset, so dev output compares byte for byte.
const pad = (text: string) => ' '.repeat(text.length);
function spellings(template: string, key: string) {
	const header = `; key ${key}`;
	const attribute = ` key={${key}}`;
	return {
		header: template.replace('<H>', header).replace('<A>', pad(attribute)),
		attribute: template.replace('<H>', pad(header)).replace('<A>', attribute),
	};
}

const objectRenderer = { id: 'object', module: 'octane/universal', target: 'universal' } as const;
const renderers = {
	object: objectRenderer,
	'object with template programs': {
		...objectRenderer,
		capabilities: ['template-program-mount', 'visibility'],
	},
	lynx: { id: 'lynx', ...lynxRenderer },
	'lynx main thread': { id: 'lynx', ...lynxMainThreadRenderer },
} as const;

const rows: Record<string, [template: string, key: string]> = {
	'leaf host': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <view<A> class="row" id={row.id} /> }</view> }`,
		'row.id',
	],
	'host with children': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <view<A> class="row"><text>{row.label as string}</text></view> }</view> }`,
		'row.index',
	],
	'opaque child': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <view<A> class="row">{props.render(row)}</view> }</view> }`,
		'row.id',
	],
	'event handler': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <view<A> bindtap={() => props.pick(row.id)}><text>{row.label as string}</text></view> }</view> }`,
		'row.id',
	],
	'setup statements': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { const label = props.format(row); <view<A>><text>{label as string}</text></view> }</view> }`,
		'row.id',
	],
	'index key with @empty': [
		`export function Rows(props) @{ <view>@for (const row of props.rows; index i<H>) { <view<A>>{props.render(row)}</view> } @empty { <view class="empty" /> }</view> }`,
		'i',
	],
	'destructured item': [
		`export function Rows(props) @{ <view>@for (const { id, label } of props.rows<H>) { <view<A> id={id}><text>{label as string}</text></view> }</view> }`,
		'id',
	],
	'component root': [
		`function Row(p) @{ <text>{p.row.name as string}</text> } export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <Row<A> row={row} /> }</view> }`,
		'row.id',
	],
	'member component root': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <props.ui.Row<A> row={row} /> }</view> }`,
		'row.id',
	],
	// The key's own parameter and a property share a body name without reading it.
	'key bindings that shadow the body': [
		`export function Rows(props) @{ <view>@for (const row of props.rows; index i<H>) { const k = props.format(row); <view<A>><text>{k as string}</text></view> }</view> }`,
		'props.keyOf(row, i, (k) => k.id, row.k)',
	],
	// An array hole reaches the body-read check as a null element.
	'array hole in the key': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { const label = props.format(row); <view<A>><text>{label as string}</text></view> }</view> }`,
		'[, row.id].join()',
	],
	'nested keyed child': [
		`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <view<A>><text key={row.version}>{row.label as string}</text></view> }</view> }`,
		'row.id',
	],
};

const modes = [
	{ dev: false, hmr: false },
	{ dev: true, hmr: false },
	{ dev: true, hmr: true },
] as const;

function compileRows(source: string, renderer: object, options: object = modes[0]): string {
	return compile(source, '/x/r.tsrx', { mode: 'client', ...options, renderer }).code;
}

describe('`key` on a universal @for row root', () => {
	describe.each(Object.entries(rows))('%s', (_, [template, key]) => {
		const { header, attribute } = spellings(template, key);
		it.each(Object.entries(renderers))('compiles like the header key (%s)', (_, renderer) => {
			for (const mode of modes) {
				expect(compileRows(attribute, renderer, mode)).toBe(compileRows(header, renderer, mode));
			}
		});
	});

	it('compiles an Activity root like the header key', () => {
		const renderer = renderers['object with template programs'];
		const { header, attribute } = spellings(
			`export function Rows(props) @{ <view>@for (const row of props.rows<H>) { <Activity<A> mode={row.mode}><view /></Activity> }</view> }`,
			'row.id',
		);
		expect(compileRows(attribute, renderer)).toBe(compileRows(header, renderer));
	});

	it('takes precedence over a header key', () => {
		const both = `export function Rows(props) @{ <view>@for (const row of props.rows; key row.slot) { <view key={row.id} class="row" /> }</view> }`;
		const header = `export function Rows(props) @{ <view>@for (const row of props.rows; key row.id) { <view class="row" /> }</view> }`;
		for (const renderer of Object.values(renderers)) {
			expect(compileRows(both, renderer)).toBe(compileRows(header, renderer));
		}
	});

	it('ignores a valueless root key', () => {
		const valueless = `export function Rows(props) @{ <view>@for (const row of props.rows; key row.id) { <view key class="row" /> }</view> }`;
		const header = `export function Rows(props) @{ <view>@for (const row of props.rows; key row.id) { <view class="row" /> }</view> }`;
		expect(compileRows(valueless, objectRenderer)).toBe(compileRows(header, objectRenderer));
	});

	it.each([
		['a const', 'const k = row.id;', 'k'],
		['a function', 'function keyOf() { return row.id; }', 'keyOf()'],
		['a hoisted var', 'if (row.ok) { var k = row.id; }', 'k'],
		['a redeclared item', 'const row = props.fallback;', 'row.id'],
	])('rejects a key that reads %s declared in the body', (_, setup, key) => {
		const source = `export function Rows(props) @{ <view>@for (const row of props.rows) { ${setup} <view key={${key}} /> }</view> }`;
		for (const renderer of Object.values(renderers)) {
			expect(() => compileRows(source, renderer)).toThrow(
				/the `key` attribute on this `@for` row reads `(k|keyOf|row)`, which is declared inside the loop body\. .* at \/x\/r\.tsrx:1:\d+$/,
			);
		}
	});
});

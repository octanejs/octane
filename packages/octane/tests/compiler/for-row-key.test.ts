import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// A `key` attribute on the only output root of an `@for` body is the row key,
// the legacy spelling of `@for (…; key expr)`. Both spellings must compile to
// the same module. Each pair below keeps every other token at the same source
// offset, so dev locations and position-derived labels compare byte for byte.
const pad = (text: string) => ' '.repeat(text.length);
function spellings(template: string, key: string) {
	const header = `; key ${key}`;
	const attribute = ` key={${key}}`;
	return {
		header: template.replace('<H>', header).replace('<A>', pad(attribute)),
		attribute: template.replace('<H>', pad(header)).replace('<A>', attribute),
	};
}

const rows: Record<string, [template: string, key: string]> = {
	'opaque child': [
		`export function Rows(props) @{ <div>@for (const row of props.rows<H>) { <div<A> class="row">{props.render(row)}</div> }</div> }`,
		'row.index',
	],
	'style object': [
		`export function Rows(props) @{ <div>@for (const row of props.rows<H>) { <div<A> style={{ top: row.top + 'px' }}>{row.label as string}</div> }</div> }`,
		'row.id',
	],
	spread: [
		`export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { <li<A> {...row.attrs}>{props.render(row)}</li> }</ul> }`,
		'row.id',
	],
	'setup statements': [
		`export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { const label = props.format(row); <li<A>>{label as string}</li> }</ul> }`,
		'row.id',
	],
	'index key with @empty': [
		`export function Rows(props) @{ <ul>@for (const row of props.rows; index i<H>) { <li<A>>{props.render(row)}</li> } @empty { <li>none</li> }</ul> }`,
		'i',
	],
	'destructured item': [
		`export function Rows(props) @{ <ul>@for (const {id, label} of props.rows<H>) { <li<A>>{props.render(label)}</li> }</ul> }`,
		'id',
	],
	'component root with setup statements': [
		`function Row(p) @{ <li>{p.label as string}</li> } export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { const label = props.format(row); <Row<A> label={label}/> }</ul> }`,
		'row.id',
	],
	'component root': [
		`function Row(p) @{ <li>{p.row.name as string}</li> } export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { <Row<A> row={row}/> }</ul> }`,
		'row.id',
	],
	// A key may read neither the row's declarations nor anything they shadow,
	// but a name bound in a scope of its own is not a row declaration.
	'key callback parameter shadowing a body const': [
		`export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { const tag = props.format(row); <li<A>>{tag as string}</li> }</ul> }`,
		'row.tags.find((tag) => tag.primary).id',
	],
	'key with an array hole beside setup statements': [
		`export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { const label = props.format(row); <li<A>>{label as string}</li> }</ul> }`,
		'[, row.id].join()',
	],
	'body declarations in nested scopes': [
		`export function Rows(props) @{ const tag = props.tag; <ul>@for (const row of props.rows<H>) { if (row.log) { const tag = row.id; props.log(tag); } const read = () => { var tag = row.id; return tag; }; <li<A>>{read() as string}</li> }</ul> }`,
		'tag + row.id',
	],
};

const modes = [
	['client', true],
	['client', false],
	['server', true],
	['server', false],
] as const;

describe('`key` on an @for row root', () => {
	describe.each(Object.entries(rows))('%s', (_, [template, key]) => {
		const { header, attribute } = spellings(template, key);
		it.each(modes)('compiles like the header key (%s, dev %s)', (mode, dev) => {
			const expected = compile(header, 'rows.tsrx', { mode, dev, hmr: false });
			const actual = compile(attribute, 'rows.tsrx', { mode, dev, hmr: false });
			expect(actual.diagnostics).toEqual([]);
			expect(actual.code).toBe(expected.code);
		});
	});

	it.each([true, false])('keeps an intrinsic row on the native template path (dev %s)', (dev) => {
		const { attribute } = spellings(...rows['opaque child']);
		const { code } = compile(attribute, 'rows.tsrx', { mode: 'client', dev, hmr: false });
		expect(code).toMatch(/\btemplate\b/);
		expect(code).not.toMatch(/\b(?:createElement(?:NS)?|createScopedElement)\b/);
	});

	it.each(modes)('takes the root key over a different header key (%s, dev %s)', (mode, dev) => {
		const template = `export function Rows(props) @{ <ul>@for (const row of props.rows<H>) { <li key={row.index}>{props.render(row)}</li> }</ul> }`;
		const withHeader = template.replace('<H>', '; key row.id');
		const rootOnly = template.replace('<H>', pad('; key row.id'));
		expect(compile(withHeader, 'rows.tsrx', { mode, dev, hmr: false }).code).toBe(
			compile(rootOnly, 'rows.tsrx', { mode, dev, hmr: false }).code,
		);
	});
});

import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';

// A bare-left `@for (item of items)` header is TSRX's spelling of a writable
// per-row binding, so it must compile to the same module as a `let` header.
// Each pair keeps every other token at the same source offset, so dev
// locations and position-derived labels compare byte for byte.
const headers: Record<string, [template: string, binding: string]> = {
	'identifier shadowing an outer name': [
		`export function Rows(props) @{ const label = 'outer'; <ul>@for (<H> of props.rows; index i; key label) { <li onClick={() => props.pick(label + i)}>{label as string}</li> } @empty { <li>{label as string}</li> }</ul> }`,
		'label',
	],
	'object pattern with a default': [
		`import { useState } from 'octane'; export function Rows(props) @{ <ul>@for (<H> of props.rows; key id) { const [count] = useState(0); <li data-id={id}>{text as string}{count as number}</li> }</ul> }`,
		`{ id, label: text = 'untitled' }`,
	],
	'array pattern with a rest element': [
		`export function Rows(props) @{ <ul>@for (<H> of props.rows) { <li data-name={name}>{rest.join(',') as string}</li> }</ul> }`,
		'[name, ...rest]',
	],
};

const modes = [
	['client', true],
	['client', false],
	['server', true],
	['server', false],
] as const;

const universal = { id: 'object', module: 'octane/universal', target: 'universal' } as const;
const valdi = {
	id: 'native',
	module: '@test/valdi-writer',
	target: 'valdi',
	server: 'unsupported',
	text: 'reject',
} as const;

describe('bare-left @for header', () => {
	describe.each(Object.entries(headers))('%s', (_, [template, binding]) => {
		const declared = template.replace('<H>', `let ${binding}`);
		const bare = template.replace('<H>', `    ${binding}`);
		it.each(modes)('compiles like a `let` header (%s, dev %s)', (mode, dev) => {
			const expected = compile(declared, 'rows.tsrx', { mode, dev, hmr: false });
			const actual = compile(bare, 'rows.tsrx', { mode, dev, hmr: false });
			expect(actual.diagnostics).toEqual([]);
			expect(actual.code).toBe(expected.code);
		});

		it('compiles like a `let` header on a universal renderer', () => {
			const options = { renderer: universal, hmr: false } as const;
			expect(compile(bare, 'rows.tsrx', options).code).toBe(
				compile(declared, 'rows.tsrx', options).code,
			);
		});
	});

	it.each([true, false])('compiles like a `let` header on a Valdi renderer (dev %s)', (dev) => {
		const template = `export function Rows(props) @{ <list>@for (<H> of props.rows; key id) { <row id={id} label={label} /> }</list> }`;
		const options = { renderer: valdi, dev, hmr: false } as const;
		expect(compile(template.replace('<H>', '    { id, label }'), 'rows.tsrx', options).code).toBe(
			compile(template.replace('<H>', 'let { id, label }'), 'rows.tsrx', options).code,
		);
	});

	describe.each([
		['a member expression', '@for (props.current of props.rows)', 'props.current'],
		['a nested member target', '@for ({ id: props.id } of props.rows)', 'props.id'],
		['a rest member target', '@for ([first, ...props.rest] of props.rows)', 'props.rest'],
		['a type assertion', '@for ((row as any) of props.rows)', 'row as any'],
	])('rejects %s', (_, header, target) => {
		const source = `export function Rows(props) @{ <ul>${header} { <li /> }</ul> }`;
		const message =
			`A \`@for\` header declares each row's own item binding, so it cannot assign the item ` +
			`to \`${target}\`. Bind a name or a destructuring pattern instead: ` +
			`\`@for (item of items)\` or \`@for ({ id } of items)\`. ` +
			`(Rows.tsrx:1:${source.indexOf(target)})`;

		it.each(modes)('with a located compile error (%s, dev %s)', (mode, dev) => {
			expect(() => compile(source, '/src/Rows.tsrx', { mode, dev, hmr: false })).toThrow(message);
		});

		it('with the same error on a universal renderer', () => {
			expect(() => compile(source, '/src/Rows.tsrx', { renderer: universal })).toThrow(message);
		});
	});
});

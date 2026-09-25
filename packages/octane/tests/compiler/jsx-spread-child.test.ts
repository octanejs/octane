import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { compile } from 'octane/compiler';
import { compileToVolarMappings } from 'octane/compiler/volar';

const SPREAD_CHILD = 'tsrx-jsx-spread-child';
const MODES = [
	['client', { mode: 'client' as const }],
	['server', { mode: 'server' as const }],
] as const;

const SOURCES = [
	[
		'template children',
		`export function List({ items }) @{ <ul><li>first</li>{...items}<li>last</li></ul> }`,
	],
	['fragment children', `export function List({ items }) @{ <>{...items}</> }`],
	['plain TSX children', `export function List({ items }) { return <ul>{...items}</ul>; }`],
	[
		'children inside a directive',
		`export function List({ items }) @{ <ul>@if (items.length) { <li>{...items}</li> }</ul> }`,
	],
] as const;

describe('JSX spread children', () => {
	describe.each(SOURCES)('%s', (_label, source) => {
		it.each(MODES)('rejects in %s mode', (_mode, options) => {
			const start = source.indexOf('{...items}');
			let error: any;
			try {
				compile(source, 'list.tsrx', options);
			} catch (caught) {
				error = caught;
			}
			expect(error).toMatchObject({
				code: SPREAD_CHILD,
				message: expect.stringContaining('Render the array as an expression child'),
				pos: start,
				end: start + '{...items}'.length,
			});
		});
	});

	it.each([false, true])('reports and maps each spread child in the editor (loose: %s)', (loose) => {
		const source = `export function List({ first, second }) @{
	<ul><li>before</li>{...first}<li>between</li>{...second}<li>after</li></ul>
}`;
		const result = compileToVolarMappings(source, 'list.tsrx', { loose });
		const spreads = ['first', 'second'];

		expect(result.errors.map(({ code, pos, end }) => ({ code, pos, end }))).toEqual(
			spreads.map((name) => {
				const spread = `{...${name}}`;
				const pos = source.indexOf(spread);
				return { code: SPREAD_CHILD, pos, end: pos + spread.length };
			}),
		);
		for (const error of result.errors) {
			expect(error.message).toContain('Render the array as an expression child');
		}
		expect(
			ts.transpileModule(result.code, {
				compilerOptions: { jsx: ts.JsxEmit.Preserve },
				reportDiagnostics: true,
			}).diagnostics,
		).toEqual([]);
		const parsed = ts.createSourceFile(
			'list.tsx',
			result.code,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TSX,
		);
		const parsedSpreads: string[] = [];
		function visit(node: ts.Node): void {
			if (ts.isJsxExpression(node) && node.dotDotDotToken && node.expression) {
				parsedSpreads.push(node.expression.getText(parsed));
			}
			ts.forEachChild(node, visit);
		}
		visit(parsed);
		expect(parsedSpreads).toEqual(spreads);
		for (const name of spreads) {
			const offset = source.indexOf(`{...${name}}`) + 4;
			const mappedText = result.mappings.flatMap((mapping) =>
				mapping.sourceOffsets.map((start, index) => {
					if (offset < start || offset >= start + mapping.lengths[index]) return '';
					const generated = mapping.generatedOffsets[index] + offset - start;
					return result.code.slice(generated, generated + name.length);
				}),
			);
			expect(mappedText).toContain(name);
		}
	});

	it('accepts expression children and spread attributes', () => {
		const source = `export function List({ items, props }) @{ <ul {...props}>{items}</ul> }`;
		for (const [, options] of MODES) {
			expect(() => compile(source, 'list.tsrx', options)).not.toThrow();
		}
		const result = compileToVolarMappings(source, 'list.tsrx', { loose: true });
		expect(result.errors).toEqual([]);
		expect(result.code).toContain('items');
		expect(result.code).toContain('props');
	});
});

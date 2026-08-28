// @vitest-environment node

import { parseModule } from '@tsrx/core';
import { describe, expect, it } from 'vitest';
import { compile } from 'octane/compiler';
import { walkAst } from '../_profile-output.js';

function emittedNestingDiagnostics(code: string) {
	const ast = parseModule(code, 'compiled.js');
	let diagnosticBinding: string | null = null;
	for (const statement of ast.body) {
		if (statement.type !== 'ImportDeclaration' || statement.source?.value !== 'octane') continue;
		for (const specifier of statement.specifiers) {
			if (specifier.type === 'ImportSpecifier' && specifier.imported?.name === 'devHtmlNesting') {
				diagnosticBinding = specifier.local.name;
			}
		}
	}
	if (diagnosticBinding === null) throw new Error('compiled module omitted devHtmlNesting');

	const diagnostics: Array<{ child: unknown; ancestors: unknown[]; location: unknown }> = [];
	walkAst(ast, (node) => {
		if (
			node.type !== 'CallExpression' ||
			node.callee?.type !== 'Identifier' ||
			node.callee.name !== diagnosticBinding
		)
			return;
		const [child, ancestors, location] = node.arguments;
		diagnostics.push({
			child: child?.value,
			ancestors: ancestors?.elements?.map((element: any) => element?.value) ?? [],
			location: location?.value,
		});
	});
	return diagnostics;
}

describe('DEV client HTML nesting diagnostics', () => {
	it('preserves root and invalid-site validation calls in authored source order', () => {
		const invalidSites = Array.from(
			{ length: 128 },
			(_, index) => `<p><div data-index="${index}">invalid</div></p>`,
		).join('');
		const source = `export function Invalid() @{ <main>${invalidSites}</main> }`;
		const code = compile(source, 'many-invalid-nesting.tsrx', {
			dev: true,
			hmr: false,
		}).code;
		const expected = [
			{
				child: 'main',
				ancestors: [],
				location: `many-invalid-nesting.tsrx:1:${source.indexOf('<main')}`,
			},
			...[...source.matchAll(/<div/g)].map((match) => ({
				child: 'div',
				ancestors: ['p'],
				location: `many-invalid-nesting.tsrx:1:${match.index}`,
			})),
		];

		expect(emittedNestingDiagnostics(code)).toEqual(expected);
	});
});

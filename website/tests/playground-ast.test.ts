import { describe, expect, it } from 'vitest';
import {
	createAstPreview,
	findDeepestAstNode,
	preparePlaygroundAst,
	type PlaygroundAstNode,
} from '../src/lib/playground-ast.ts';
import { compileAst } from '../src/lib/playground.ts';

const nodeTypes = (root: PlaygroundAstNode): Set<string> => {
	const types = new Set<string>();
	const visit = (node: PlaygroundAstNode) => {
		if (node.type) types.add(node.type);
		for (const child of node.children) visit(child);
	};
	visit(root);
	return types;
};

describe('playground AST preparation', () => {
	it('keeps every enumerable field and renders graph cycles as explicit references', () => {
		const ast: Record<string, unknown> = {
			type: 'Program',
			start: 0,
			end: 10,
			body: [],
			metadata: { transformed: true },
		};
		ast.self = ast;

		const prepared = preparePlaygroundAst(ast);
		expect(prepared.root.children.map((child) => child.key)).toEqual([
			'type',
			'start',
			'end',
			'body',
			'metadata',
			'self',
		]);
		const self = prepared.root.children.at(-1)!;
		expect(self.kind).toBe('reference');
		expect(self.value).toBe('Reference → $');
	});

	it('keeps structural nodes canonical when an earlier metadata path references them', () => {
		const shared = { type: 'Identifier', start: 4, end: 5, name: 'x' };
		const prepared = preparePlaygroundAst({
			type: 'Program',
			start: 0,
			end: 5,
			first: { type: 'Marker', start: 0, end: 1, metadata: { path: [shared] } },
			actual: shared,
		});
		const first = prepared.root.children.find((child) => child.key === 'first')!;
		const metadataReference = first.children
			.find((child) => child.key === 'metadata')!
			.children.find((child) => child.key === 'path')!.children[0];
		const actual = prepared.root.children.find((child) => child.key === 'actual')!;

		expect(metadataReference.kind).toBe('reference');
		expect(metadataReference.value).toBe('Reference → $.actual');
		expect(actual.kind).toBe('object');
		expect(actual.type).toBe('Identifier');
	});

	it('finds the narrowest containing node with half-open AST ranges', () => {
		const prepared = preparePlaygroundAst({
			type: 'Program',
			start: 0,
			end: 10,
			body: [
				{
					type: 'ExpressionStatement',
					start: 2,
					end: 8,
					expression: { type: 'Identifier', start: 4, end: 6, name: 'x' },
				},
			],
		});

		expect(findDeepestAstNode(prepared, 5)?.type).toBe('Identifier');
		expect(findDeepestAstNode(prepared, 6)?.type).toBe('ExpressionStatement');
		expect(findDeepestAstNode(prepared, 10)).toBeNull();
	});

	it('drops source ranges when the current AST becomes unavailable', () => {
		const host = document.createElement('div');
		const ranges: Array<{ from: number; to: number } | null> = [];
		const preview = createAstPreview(host, {
			onNodeRange(range) {
				ranges.push(range);
			},
		});
		preview.setAst(
			{
				type: 'Program',
				start: 0,
				end: 10,
				body: [{ type: 'Identifier', start: 4, end: 6, name: 'x' }],
			},
			'App.tsrx',
		);
		preview.reveal(5, false);
		expect(ranges.at(-1)).toEqual({ from: 4, to: 6 });

		preview.setUnavailable('Waiting for a successful compile…', 'App.tsrx');
		expect(ranges.at(-1)).toBeNull();
		expect(host.querySelector('.pg-ast-tree')).toBeNull();
		expect(host.textContent).toContain('Waiting for a successful compile…');

		preview.reveal(5, false);
		expect(ranges.at(-1)).toBeNull();
		preview.destroy();
	});
});

describe.each([
	{
		filename: 'App.tsrx',
		source: `export function App() @{
	const label = 'TSRX';
	<button>{label}</button>
}`,
		sourceNode: 'JSXCodeBlock',
	},
	{
		filename: 'App.tsx',
		source: `/** @jsxImportSource octane */
export function App() {
	const label = 'TSX';
	return <button>{label}</button>;
}`,
		sourceNode: 'JSXElement',
	},
])('playground $filename AST pipeline', ({ filename, source, sourceNode }) => {
	it('exposes the compiler parser AST for the authored file', () => {
		const ast = compileAst(source, filename);
		if (!ast.ok) throw new Error(ast.error);

		const tree = preparePlaygroundAst(ast.ast);
		expect(nodeTypes(tree.root)).toContain(sourceNode);
		expect(tree.root.range).toEqual({ from: 0, to: source.length });
	});

	it('distinguishes transformer and emitted-output coordinate spaces', () => {
		const transform = compileAst(source, filename, 'type-transform');
		const typeOutput = compileAst(source, filename, 'type-output');
		const clientOutput = compileAst(source, filename, 'client-output');
		for (const result of [transform, typeOutput, clientOutput]) {
			if (!result.ok) throw new Error(result.error);
		}
		if (!transform.ok || !typeOutput.ok || !clientOutput.ok) return;

		expect(transform.space).toBe('source');
		expect((transform.ast as { end: number }).end).toBe(source.length);
		for (const output of [typeOutput, clientOutput]) {
			expect(output.space).toBe('generated');
			expect((output.ast as { type: string }).type).toBe('Program');
			expect((output.ast as { end: number }).end).toBe(output.code!.length);
		}
		expect(clientOutput.map).toBeDefined();
	});
});

it('parses typed output as TSX when the source contains a scoped style block', () => {
	const source = `export function App() @{
	<button>Styled</button>
	<style>
		button { color: red; }
	</style>
}`;
	const parsed = compileAst(source, 'App.tsrx', 'source');
	const output = compileAst(source, 'App.tsrx', 'type-output');
	if (!parsed.ok) throw new Error(parsed.error);
	if (!output.ok) throw new Error(output.error);

	expect((parsed.ast as { end: number }).end).toBe(source.length);
	expect((output.ast as { end: number }).end).toBe(output.code!.length);
});

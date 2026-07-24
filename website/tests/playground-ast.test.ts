import { describe, expect, it } from 'vitest';
import {
	createAstPreview,
	findDeepestAstNode,
	preparePlaygroundAst,
	type PlaygroundAstNode,
} from '../src/lib/playground-ast.ts';
import { compileClientAst, compileTypes } from '../src/lib/playground.ts';

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
	it('uses the authored and exact generated Programs exposed by Volar', () => {
		const result = compileTypes(source, filename);
		if (!result.ok) throw new Error(result.error);

		const sourceTree = preparePlaygroundAst(result.sourceAst);
		expect(nodeTypes(sourceTree.root)).toContain(sourceNode);
		expect(sourceTree.root.range).toEqual({ from: 0, to: source.length });
		expect(result.generatedAst).toMatchObject({ type: 'Program', start: 0, end: source.length });
	});

	it('uses the client Program and template IR without reparsing emitted code', () => {
		const result = compileClientAst(source, filename);
		if (!result.ok) throw new Error(result.error);
		const inspection = result.ast as {
			program: { type: string; start: number; end: number };
			templates: Array<{ name: string; ast: { type: string } }>;
		};

		expect(inspection.program).toMatchObject({ type: 'Program', start: 0, end: source.length });
		expect(inspection.templates[0].name).toMatch(/^_t\$\d+$/);
		expect(inspection.templates[0].ast.type).toBe('Template');
		expect(nodeTypes(preparePlaygroundAst(result.ast).root)).toContain('TemplateElement');
	});
});

it('uses compiler template origins as authored source ranges', () => {
	const source = `export function App() @{ <button>Styled</button> }`;
	const result = compileClientAst(source, 'App.tsrx');
	if (!result.ok) throw new Error(result.error);
	const prepared = preparePlaygroundAst(result.ast);
	const start = source.indexOf('button');

	expect(findDeepestAstNode(prepared, start + 1)?.range).toEqual({
		from: start,
		to: start + 'button'.length,
	});
});

it('exposes the exact typed AST when the source contains a scoped style block', () => {
	const source = `export function App() @{
	<button>Styled</button>
	<style>
		button { color: red; }
	</style>
}`;
	const result = compileTypes(source, 'App.tsrx');
	if (!result.ok) throw new Error(result.error);

	expect((result.sourceAst as { end: number }).end).toBe(source.length);
	expect(result.generatedAst).toMatchObject({ type: 'Program', start: 0, end: source.length });
});

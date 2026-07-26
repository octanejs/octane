import { describe, expect, it } from 'vitest';
import {
	collectAuthoredRanges,
	createAstPreview,
	findDeepestAstNode,
	preparePlaygroundAst,
	type PlaygroundAstNode,
} from '../src/lib/playground-ast.ts';
import { compileRuntime, compileTypes } from '../src/lib/playground.ts';

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

	it('resolves the cursor to structural syntax, never a metadata back-reference', () => {
		// The compiler's copy-on-write transforms leave `metadata.path` holding
		// CLONES of the pre-transform tree: distinct objects carrying the same
		// authored ranges, so the canonical-path pass cannot fold them into
		// references. They also sit far deeper than the syntax they mirror,
		// which is exactly what the deepest-node tie-break selects. Indexing
		// them makes a click land inside `…metadata.path[0]…` instead of on the
		// node the cursor is actually over.
		const prepared = preparePlaygroundAst({
			type: 'Program',
			start: 0,
			end: 20,
			body: [
				{
					type: 'Statement',
					start: 2,
					end: 12,
					metadata: {
						path: [
							{ type: 'StaleClone', start: 2, end: 12, inner: { type: 'Deep', start: 4, end: 6 } },
						],
					},
				},
			],
		});

		expect(findDeepestAstNode(prepared, 5)?.type).toBe('Statement');
		expect(prepared.rangeNodes.map((node) => node.type)).toEqual(['Program', 'Statement']);
		// The clone is still browsable in the tree — only the cursor index skips it.
		expect(nodeTypes(prepared.root)).toContain('StaleClone');
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
					expression: {
						type: 'Identifier',
						start: 4,
						end: 6,
						name: 'x',
						empty: { type: 'EmptyNode', start: 5, end: 5 },
					},
				},
			],
		});

		expect(findDeepestAstNode(prepared, 5)?.type).toBe('Identifier');
		expect(findDeepestAstNode(prepared, 6)?.type).toBe('ExpressionStatement');
		expect(findDeepestAstNode(prepared, 10)).toBeNull();
		expect(prepared.rangeNodes.some((node) => node.type === 'EmptyNode')).toBe(false);
	});

	it('keeps the narrowest-node answer as the tree grows wide and deep', () => {
		// The lookup is indexed rather than scanned, so the ordering of siblings
		// and the depth at which the answer sits must not change the result.
		const leaves = Array.from({ length: 200 }, (_, index) => ({
			type: 'Leaf' + index,
			start: index * 10,
			end: index * 10 + 4,
		}));
		const prepared = preparePlaygroundAst({
			type: 'Program',
			start: 0,
			end: 2000,
			// Reversed, so source order and discovery order disagree.
			body: [...leaves].reverse(),
			nested: {
				type: 'Wrapper',
				start: 500,
				end: 520,
				inner: { type: 'Inner', start: 502, end: 504 },
			},
		});

		expect(findDeepestAstNode(prepared, 0)?.type).toBe('Leaf0');
		expect(findDeepestAstNode(prepared, 1003)?.type).toBe('Leaf100');
		// Between two leaves only the Program contains the offset.
		expect(findDeepestAstNode(prepared, 1005)?.type).toBe('Program');
		expect(findDeepestAstNode(prepared, 503)?.type).toBe('Inner');
		// 506 sits between two leaves but inside the wrapper.
		expect(findDeepestAstNode(prepared, 506)?.type).toBe('Wrapper');
		expect(findDeepestAstNode(prepared, 2000)).toBeNull();
		expect(findDeepestAstNode(prepared, -1)).toBeNull();
	});

	it('collects authored ranges without building the display tree', () => {
		const ranges = collectAuthoredRanges({
			type: 'Program',
			start: 0,
			end: 20,
			body: [
				{ type: 'Text', start: 4, end: 9 },
				{ type: 'Empty', start: 9, end: 9 },
			],
			// Back-references and non-structural metadata must not duplicate or
			// re-walk the tree.
			loc: { start: { line: 1, column: 0 } },
			metadata: { path: [{ type: 'Ghost', start: 100, end: 200 }] },
		});
		expect(ranges).toEqual([
			{ from: 0, to: 20 },
			{ from: 4, to: 9 },
		]);
	});

	it('re-reveals only when the resolved node or its pin actually changes', () => {
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

		preview.reveal(4, false);
		expect(ranges.at(-1)).toEqual({ from: 4, to: 6 });
		const settled = ranges.length;
		// Every offset inside the same node resolves to it; a pointer stream
		// must not re-emit or re-render for each sample.
		preview.reveal(5, false);
		expect(ranges.length).toBe(settled);

		preview.reveal(0, false);
		expect(ranges.length).toBe(settled + 1);
		expect(ranges.at(-1)).toEqual({ from: 0, to: 10 });
		preview.destroy();
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

	it('keeps a clicked node highlighted after pointer and focus leave it', () => {
		const host = document.createElement('div');
		const ranges: Array<{ from: number; to: number } | null> = [];
		const preview = createAstPreview(host, {
			onNodeRange(range) {
				ranges.push(range);
			},
		});
		preview.setAst({ type: 'Program', start: 0, end: 10, body: [] }, 'App.tsrx');

		const summary = host.querySelector('summary')!;
		const node = summary.closest<HTMLElement>('.pg-ast-node')!;
		node.scrollIntoView = () => {};
		summary.click();
		summary.dispatchEvent(new MouseEvent('mouseleave'));
		summary.dispatchEvent(new FocusEvent('blur'));

		expect(ranges.at(-1)).toEqual({ from: 0, to: 10 });
		expect(node.dataset.astPinned).toBe('true');

		preview.clear();
		expect(ranges.at(-1)).toBeNull();
		expect(node.dataset.astPinned).toBeUndefined();
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
		const result = compileRuntime(source, filename, 'client');
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
	const result = compileRuntime(source, 'App.tsrx', 'client');
	if (!result.ok) throw new Error(result.error);
	const prepared = preparePlaygroundAst(result.ast);
	const start = source.indexOf('button');

	expect(findDeepestAstNode(prepared, start + 1)?.range).toEqual({
		from: start,
		to: start + 'button'.length,
	});
});

it('uses the server Program exposed by compiler inspection', () => {
	const source = `export function App() @{ <h1>{'Rendered on the server'}</h1> }`;
	const result = compileRuntime(source, 'App.tsrx', 'server');
	if (!result.ok) throw new Error(result.error);
	const inspection = result.ast as {
		program: { type: string; start: number; end: number };
		templates: unknown[];
	};

	expect(inspection.program).toMatchObject({ type: 'Program', start: 0, end: source.length });
	expect(inspection.templates).toEqual([]);
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

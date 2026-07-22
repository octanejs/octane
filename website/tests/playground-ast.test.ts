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

	it('exposes granular client template nodes at exact generated ranges', () => {
		const source = `export function App() @{
	<div class="demo"><h2>Title</h2></div>
}`;
		const output = compileAst(source, 'App.tsrx', 'client-output');
		if (!output.ok) throw new Error(output.error);
		const prepared = preparePlaygroundAst(output.ast);
		const h2 = output.code!.indexOf('<h2>') + 1;
		const className = output.code!.indexOf('class=');
		const classValue = output.code!.indexOf('demo', className);

		expect(findDeepestAstNode(prepared, h2)?.type).toBe('OctaneTemplateIdentifier');
		expect(findDeepestAstNode(prepared, className)?.type).toBe('OctaneTemplateAttributeName');
		expect(findDeepestAstNode(prepared, classValue)?.type).toBe('OctaneTemplateAttributeValue');
	});

	it('keeps escaped attributes, raw script text, and dynamic markers distinct', () => {
		const source = `export function App() @{
	const value = 'ready';
	<div title="a&b"><script>if (a < b) x()</script>{value}</div>
}`;
		const output = compileAst(source, 'App.tsrx', 'client-output');
		if (!output.ok) throw new Error(output.error);
		const prepared = preparePlaygroundAst(output.ast);
		const escapedValue = output.code!.indexOf('a&amp;b');
		const scriptComparison = output.code!.indexOf('a < b');
		const marker = output.code!.indexOf('<!>');

		expect(findDeepestAstNode(prepared, escapedValue)?.type).toBe('OctaneTemplateAttributeValue');
		expect(findDeepestAstNode(prepared, scriptComparison + 2)?.type).toBe('OctaneTemplateText');
		expect(findDeepestAstNode(prepared, marker)?.type).toBe('OctaneTemplateMarker');
	});

	it('keeps textarea content text-only without desynchronizing later nodes', () => {
		const source = `export function App() @{
	<div>
		<textarea><fake data-x="bad"></fake></textarea>
		<span data-after="ok">after</span>
	</div>
}`;
		const output = compileAst(source, 'App.tsrx', 'client-output');
		if (!output.ok) throw new Error(output.error);
		const prepared = preparePlaygroundAst(output.ast);
		const textareaText = output.code!.indexOf('<fake');
		const laterAttribute = output.code!.indexOf('data-after');

		expect(findDeepestAstNode(prepared, textareaText + 1)?.type).toBe('OctaneTemplateText');
		expect(findDeepestAstNode(prepared, laterAttribute)?.type).toBe('OctaneTemplateAttributeName');
	});

	it('keeps title content structural in the SVG namespace', () => {
		const source = `export function App() @{
	<svg><title><fake></fake></title><path /></svg>
}`;
		const output = compileAst(source, 'App.tsrx', 'client-output');
		if (!output.ok) throw new Error(output.error);
		const prepared = preparePlaygroundAst(output.ast);
		const nestedTag = output.code!.indexOf('<fake');
		const laterTag = output.code!.indexOf('<path');

		expect(findDeepestAstNode(prepared, nestedTag + 1)?.type).toBe('OctaneTemplateIdentifier');
		expect(findDeepestAstNode(prepared, laterTag + 1)?.type).toBe('OctaneTemplateIdentifier');
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

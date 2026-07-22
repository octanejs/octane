// Source ↔ output position mapping (src/lib/playground-mapping.ts) — the
// contract behind the playground's click-to-navigate: an offset in the source
// resolves to the range(s) in the compiled output that came from it, and an
// offset in the output resolves back to its source range. It is exercised
// against real compiler artifacts; a focused nested-range fixture protects
// Volar's shared generated-boundary behavior.
import { describe, it, expect } from 'vitest';
import { compileAst, compilePlayground, compileTypes } from '../src/lib/playground.ts';
import { mappingFromSourceMap, mappingFromVolar } from '../src/lib/playground-mapping.ts';

const SOURCE = `import { useState } from 'octane';

export default function App() @{
	const [count, setCount] = useState(0);

	<div>
		<h2>{'Count: ' + count}</h2>
		<button onClick={() => setCount(count + 1)}>Increment</button>
	</div>
}
`;

const textAt = (text: string, range: { from: number; to: number }) =>
	text.slice(range.from, range.to);

describe('types mapping (Volar token mappings)', () => {
	const types = compileTypes(SOURCE, 'App.tsrx');
	if (!types.ok) throw new Error(types.error);
	const mapping = mappingFromVolar(types.mappings);

	it('builds a mapping from the real Volar artifact', () => {
		expect(mapping).not.toBeNull();
	});

	it('maps a source token to the exact generated token', () => {
		const offset = SOURCE.indexOf('setCount(count + 1)') + 2; // inside `setCount`
		const ranges = mapping!.toGenerated(offset);
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === 'setCount')).toBe(true);
	});

	it('maps a generated token back to the exact source token', () => {
		const offset = types.code.indexOf('useState(0)') + 2;
		const ranges = mapping!.toSource(offset);
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(SOURCE, range) === 'useState')).toBe(true);
	});

	it('falls back to a containing expression between nested token mappings', () => {
		// Volar maps the whole renderable expression as well as the string and
		// identifier inside it. The operator is covered only by the outer range.
		const offset = SOURCE.indexOf("'Count: ' + count") + "'Count: ' ".length;
		const ranges = mapping!.toGenerated(offset);
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === "{'Count: ' + count}")).toBe(true);
	});

	it('clears on positions past the mapped token instead of reusing it', () => {
		// An offset beyond the anchored token's exact span (here the blank line
		// before the JSX) is unmapped and must
		// clear the highlight, not resolve to the preceding token's image.
		const offset = SOURCE.indexOf('\n\n\t<div>') + 1;
		expect(mapping!.toGenerated(offset)).toBeNull();
	});

	it('still matches with the cursor parked at the trailing edge of a token', () => {
		const offset = SOURCE.indexOf('setCount(count + 1)') + 'setCount'.length;
		const ranges = mapping!.toGenerated(offset);
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === 'setCount')).toBe(true);
	});

	it('maps a generated AST range to the narrowest token at a shared boundary', () => {
		const nested = mappingFromVolar([
			{ sourceOffsets: [0], generatedOffsets: [10], lengths: [20] },
			{ sourceOffsets: [5], generatedOffsets: [10], lengths: [3] },
		]);

		expect(nested?.toSourceRange(10, 13)).toEqual([{ from: 5, to: 8 }]);
		// The AST node may begin in unmapped generated plumbing. Its first
		// mapped boundary must make the same narrow choice.
		expect(nested?.toSourceRange(8, 13)).toEqual([{ from: 5, to: 8 }]);
	});

	it('keeps both highlights on the same mapping at shared boundaries', () => {
		const sharedOutputBoundary = mappingFromVolar([
			{ sourceOffsets: [0], generatedOffsets: [10], lengths: [20] },
			{ sourceOffsets: [5], generatedOffsets: [10], lengths: [3] },
		]);
		expect(sharedOutputBoundary?.pairFromSource(15)).toEqual({
			source: [{ from: 0, to: 20 }],
			output: [{ from: 10, to: 30 }],
		});

		const sharedSourceBoundary = mappingFromVolar([
			{ sourceOffsets: [0], generatedOffsets: [10], lengths: [20] },
			{ sourceOffsets: [0], generatedOffsets: [15], lengths: [3] },
		]);
		expect(sharedSourceBoundary?.pairFromGenerated(25)).toEqual({
			source: [{ from: 0, to: 20 }],
			output: [{ from: 10, to: 30 }],
		});
	});

	it('returns null for empty or absent mappings instead of throwing', () => {
		expect(mappingFromVolar([])).toBeNull();
		expect(mappingFromVolar(null)).toBeNull();
		expect(mappingFromVolar(undefined)).toBeNull();
	});
});

describe('client output mapping (compiler source map)', () => {
	const output = compilePlayground(SOURCE, 'App.tsrx');
	if (!output.ok) throw new Error(output.error);
	const mapping = mappingFromSourceMap(output.map, SOURCE, output.code);
	const clientOutput = compileAst(SOURCE, 'App.tsrx', 'client-output');
	if (!clientOutput.ok) throw new Error(clientOutput.error);
	const clientMapping = mappingFromSourceMap(clientOutput.map, SOURCE, clientOutput.code!);

	it('maps only tokens backed by compiler source-map anchors', () => {
		const count = SOURCE.indexOf('count, setCount');
		const generated = mapping?.toGenerated(count);
		expect(generated).not.toBeNull();
		expect(generated!.some((range) => textAt(output.code, range) === 'count')).toBe(true);
		expect(mapping?.toSourceRange(0, output.code.length)).not.toBeNull();
	});

	it('maps authored JSX tags to the tags baked into the client template', () => {
		const sourceTag = SOURCE.indexOf('<div>') + 1;
		const generatedTag = clientOutput.code!.indexOf('<div>') + 1;
		expect(mapping?.pairFromSource(sourceTag)).toBeNull();
		expect(clientMapping?.pairFromSource(sourceTag)).toEqual({
			source: [{ from: sourceTag, to: sourceTag + 3 }],
			output: [{ from: generatedTag, to: generatedTag + 3 }],
		});
		expect(clientMapping?.pairFromGenerated(generatedTag)).toEqual({
			source: [{ from: sourceTag, to: sourceTag + 3 }],
			output: [{ from: generatedTag, to: generatedTag + 3 }],
		});

		const sourceClosingTag = SOURCE.indexOf('</div>') + 2;
		const generatedClosingTag = clientOutput.code!.indexOf('</div>') + 2;
		expect(clientMapping?.pairFromGenerated(generatedClosingTag)).toEqual({
			source: [{ from: sourceClosingTag, to: sourceClosingTag + 3 }],
			output: [{ from: generatedClosingTag, to: generatedClosingTag + 3 }],
		});
	});

	it('uses explicit source-map endpoints for custom element tag names', () => {
		const source = `export function App() @{
	<my-el></my-el>
}`;
		const compiled = compileAst(source, 'App.tsrx', 'client-output');
		if (!compiled.ok) throw new Error(compiled.error);
		const customMapping = mappingFromSourceMap(compiled.map, source, compiled.code!);
		const sourceTag = source.indexOf('<my-el>') + 1;
		const generatedTag = compiled.code!.indexOf('<my-el>') + 1;

		expect(customMapping?.pairFromSource(sourceTag)).toEqual({
			source: [{ from: sourceTag, to: sourceTag + 'my-el'.length }],
			output: [{ from: generatedTag, to: generatedTag + 'my-el'.length }],
		});

		const sourceClosingTag = source.indexOf('</my-el>') + 2;
		const generatedClosingTag = compiled.code!.indexOf('</my-el>') + 2;
		expect(customMapping?.pairFromGenerated(generatedClosingTag)).toEqual({
			source: [{ from: sourceClosingTag, to: sourceClosingTag + 'my-el'.length }],
			output: [{ from: generatedClosingTag, to: generatedClosingTag + 'my-el'.length }],
		});
	});

	it('keeps nested tags, attribute text, and self-closing tags in distinct ranges', () => {
		const source = `export function App() @{
	<div data-label="<span">
		<span><div /></span>
	</div>
}`;
		const compiled = compileAst(source, 'App.tsrx', 'client-output');
		if (!compiled.ok) throw new Error(compiled.error);
		const nested = mappingFromSourceMap(compiled.map, source, compiled.code!);
		const fakeGeneratedTag = compiled.code!.indexOf('<span') + 1;
		const realGeneratedTag = compiled.code!.indexOf('<span', fakeGeneratedTag) + 1;
		const sourceAttributeText = source.indexOf('<span') + 1;
		const sourceTag = source.indexOf('<span', source.indexOf('<span') + 1) + 1;

		expect(nested?.pairFromGenerated(fakeGeneratedTag)?.source).toEqual([
			{ from: sourceAttributeText, to: sourceAttributeText + 4 },
		]);
		expect(nested?.pairFromGenerated(realGeneratedTag)?.source).toEqual([
			{ from: sourceTag, to: sourceTag + 4 },
		]);

		const sourceSelfClosing = source.indexOf('<div />') + 1;
		const generatedSelfClosing = compiled.code!.indexOf('<div></div>');
		expect(nested?.pairFromSource(sourceSelfClosing)).toEqual({
			source: [{ from: sourceSelfClosing, to: sourceSelfClosing + 3 }],
			output: [
				{ from: generatedSelfClosing + 1, to: generatedSelfClosing + 4 },
				{ from: generatedSelfClosing + 7, to: generatedSelfClosing + 10 },
			],
		});
	});

	it('maps authored static attribute names and values but not scoped class additions', () => {
		const source = `export function App() @{
	<div class="demo">
		<h2>Title</h2>
		<style>div { color: red; }</style>
	</div>
}`;
		const compiled = compileAst(source, 'App.tsrx', 'client-output');
		if (!compiled.ok) throw new Error(compiled.error);
		const scoped = mappingFromSourceMap(compiled.map, source, compiled.code!);
		const sourceClass = source.indexOf('class=');
		const sourceDemo = source.indexOf('demo', sourceClass);
		const generatedClass = compiled.code!.indexOf('class=');
		const generatedDemo = compiled.code!.indexOf('demo', generatedClass);
		const generatedScope = compiled.code!.indexOf('tsrx-', generatedDemo);

		expect(scoped?.pairFromSource(sourceClass)).toEqual({
			source: [{ from: sourceClass, to: sourceClass + 'class'.length }],
			output: [{ from: generatedClass, to: generatedClass + 'class'.length }],
		});
		expect(scoped?.pairFromSource(sourceDemo)).toEqual({
			source: [{ from: sourceDemo, to: sourceDemo + 'demo'.length }],
			output: [{ from: generatedDemo, to: generatedDemo + 'demo'.length }],
		});
		expect(scoped?.pairFromGenerated(generatedScope)).toBeNull();
	});

	it('does not interpolate across source text without an anchor', () => {
		const blankLine = SOURCE.indexOf('\n\n\t<div>') + 1;
		expect(mapping?.toGenerated(blankLine)).toBeNull();
	});

	it('returns null for the server-style empty map', () => {
		expect(mappingFromSourceMap({ mappings: '' }, SOURCE, '')).toBeNull();
	});
});

it('keeps type mappings after a scoped-style statement terminator', () => {
	const source = `export function App() @{
	<button>Styled</button>
	<style>button { color: red; }</style>
}
export const afterStyle = 1;`;
	const output = compileTypes(source, 'App.tsrx');
	if (!output.ok) throw new Error(output.error);
	const mapping = mappingFromVolar(output.mappings);
	const sourceOffset = source.indexOf('afterStyle');
	const generatedOffset = output.code.indexOf('afterStyle');

	expect(output.code).toContain('<style></style>;');
	expect(mapping?.toGenerated(sourceOffset)).toContainEqual({
		from: generatedOffset,
		to: generatedOffset + 'afterStyle'.length,
	});
	expect(mapping?.toSource(generatedOffset)).toContainEqual({
		from: sourceOffset,
		to: sourceOffset + 'afterStyle'.length,
	});
});

// Source ↔ output position mapping (src/lib/playground-mapping.ts) — the
// contract behind the playground's click-to-navigate: an offset in the source
// resolves to the range(s) in the compiled output that came from it, and an
// offset in the output resolves back to its source range. It is exercised
// against real Volar token mappings, not synthetic fixtures.
import { describe, it, expect } from 'vitest';
import { compilePlayground, compileTypes } from '../src/lib/playground.ts';
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

	it('maps only tokens backed by compiler source-map anchors', () => {
		const count = SOURCE.indexOf('count, setCount');
		const generated = mapping?.toGenerated(count);
		expect(generated).not.toBeNull();
		expect(generated!.some((range) => textAt(output.code, range) === 'count')).toBe(true);
		expect(mapping?.toSourceRange(0, output.code.length)).not.toBeNull();
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

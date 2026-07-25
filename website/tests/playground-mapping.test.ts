// Source ↔ output position mapping (src/lib/playground-mapping.ts) — the
// contract behind the playground's click-to-navigate: an offset in the source
// resolves to the range(s) in the compiled output that came from it, and an
// offset in the output resolves back to its source range. It is exercised
// against real compiler artifacts; a focused nested-range fixture protects
// Volar's shared generated-boundary behavior.
import { describe, it, expect } from 'vitest';
import { compileTypes } from '../src/lib/playground.ts';
import { identityMapping, mappingFromVolar } from '../src/lib/playground-mapping.ts';

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
		const ranges = mapping!.pairFromSource(offset)?.output;
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === 'setCount')).toBe(true);
	});

	it('maps a generated token back to the exact source token', () => {
		const offset = types.code.indexOf('useState(0)') + 2;
		const ranges = mapping!.pairFromGenerated(offset)?.source;
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(SOURCE, range) === 'useState')).toBe(true);
	});

	it('falls back to a containing expression between nested token mappings', () => {
		// Volar maps the whole renderable expression as well as the string and
		// identifier inside it. The operator is covered only by the outer range.
		const offset = SOURCE.indexOf("'Count: ' + count") + "'Count: ' ".length;
		const ranges = mapping!.pairFromSource(offset)?.output;
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === "{'Count: ' + count}")).toBe(true);
	});

	it('clears on positions past the mapped token instead of reusing it', () => {
		// An offset beyond the anchored token's exact span (here the blank line
		// before the JSX) is unmapped and must
		// clear the highlight, not resolve to the preceding token's image.
		const offset = SOURCE.indexOf('\n\n\t<div>') + 1;
		expect(mapping!.pairFromSource(offset)).toBeNull();
	});

	it('still matches with the cursor parked at the trailing edge of a token', () => {
		const offset = SOURCE.indexOf('setCount(count + 1)') + 'setCount'.length;
		const ranges = mapping!.pairFromSource(offset)?.output;
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === 'setCount')).toBe(true);
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

it('maps React-host typed TSX identically in both directions', () => {
	const mapping = identityMapping(10);
	expect(mapping?.pairFromSource(4)).toEqual({
		source: [{ from: 4, to: 5 }],
		output: [{ from: 4, to: 5 }],
	});
	expect(mapping?.pairFromGenerated(10)).toEqual({
		source: [{ from: 9, to: 10 }],
		output: [{ from: 9, to: 10 }],
	});
	expect(identityMapping(0)).toBeNull();
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

	expect(output.code).toContain('<style></style>');
	expect(mapping?.pairFromSource(sourceOffset)?.output).toContainEqual({
		from: generatedOffset,
		to: generatedOffset + 'afterStyle'.length,
	});
	expect(mapping?.pairFromGenerated(generatedOffset)?.source).toContainEqual({
		from: sourceOffset,
		to: sourceOffset + 'afterStyle'.length,
	});
});

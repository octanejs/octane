// Source ↔ output position mapping (src/lib/playground-mapping.ts) — the
// contract behind the playground's click-to-navigate: an offset in the source
// resolves to the range(s) in the compiled output that came from it, and an
// offset in the output resolves back to its source range. Both constructors
// are exercised against REAL compiler artifacts (the prod source map and the
// Volar token mappings), not synthetic fixtures, so offset math breaking —
// VLQ decode, line-start conversion, anchor search — lands on wrong text and
// fails these assertions.
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

describe('prod mapping (compiler source map)', () => {
	const compiled = compilePlayground(SOURCE, 'App.tsrx');
	if (!compiled.ok) throw new Error(compiled.error);
	const mapping = mappingFromSourceMap(compiled.map, SOURCE, compiled.code);

	it('builds a mapping from the real compile artifact', () => {
		expect(mapping).not.toBeNull();
	});

	it('maps a source identifier to output ranges holding that code', () => {
		const offset = SOURCE.indexOf('useState(0)') + 2; // inside `useState`
		const ranges = mapping!.toGenerated(offset);
		expect(ranges).not.toBeNull();
		expect(ranges!.length).toBeGreaterThan(0);
		expect(ranges!.some((range) => textAt(compiled.code, range).includes('useState'))).toBe(true);
	});

	it('maps an output identifier back to its source range', () => {
		const offset = compiled.code.indexOf('useState(0') + 2;
		const ranges = mapping!.toSource(offset);
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(SOURCE, range).includes('useState'))).toBe(true);
	});

	it('answers every offset without throwing (nearest-anchor semantics)', () => {
		for (const offset of [0, SOURCE.length - 1, SOURCE.length]) {
			const ranges = mapping!.toGenerated(offset);
			if (ranges) {
				for (const range of ranges) {
					expect(range.from).toBeLessThan(range.to);
					expect(range.to).toBeLessThanOrEqual(compiled.code.length);
				}
			}
		}
	});

	it('returns null for a missing or malformed map instead of throwing', () => {
		expect(mappingFromSourceMap(null, SOURCE, compiled.code)).toBeNull();
		expect(mappingFromSourceMap({}, SOURCE, compiled.code)).toBeNull();
		expect(mappingFromSourceMap({ mappings: '!!not-vlq!!' }, SOURCE, compiled.code)).toBeNull();
	});
});

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

	it('returns null for empty or absent mappings instead of throwing', () => {
		expect(mappingFromVolar([])).toBeNull();
		expect(mappingFromVolar(null)).toBeNull();
		expect(mappingFromVolar(undefined)).toBeNull();
	});
});

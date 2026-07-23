import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Fat segments (`inspect: true`): the module map's decoded segments enriched
// with absolute source offsets — including the source END a standard map
// cannot carry — so navigation tooling can highlight exact authored ranges
// without parsing `.map` files. Inspection-gated: absent from normal compiles,
// and the emitted code is byte-identical either way (pinned by the template-
// origins suite; re-checked here for the segments-bearing option object).

const SOURCE = `import { useState } from 'octane';
export function App() @{
	const [n, setN] = useState(0);
	<div>
		<button onClick={(e) => setN(n + 1)}>inc</button>
		<span>{n as string}</span>
	</div>
}
`;

interface FatSegment {
	genLine: number;
	genCol: number;
	genEndCol: number | null;
	srcStart: number;
	srcEnd: number | null;
}

function segmentsFor(options: Record<string, unknown>): { code: string; segments: FatSegment[] } {
	const result = compile(SOURCE, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
		typeof compile
	> & { inspect: { segments: FatSegment[] } };
	expect(result.inspect).toBeDefined();
	expect(Array.isArray(result.inspect.segments)).toBe(true);
	return { code: result.code, segments: result.inspect.segments };
}

describe.each([
	['client dev', { dev: true }],
	['client prod', { hmr: false as const }],
])('fat inspection segments — %s', (_label, options) => {
	it('is absent without the inspect option', () => {
		const plain = compile(SOURCE, 'App.tsrx', options) as { inspect?: unknown };
		expect(plain.inspect).toBeUndefined();
	});

	it('carries node-exact source ranges for authored expressions', () => {
		const { segments } = segmentsFor(options);

		// Tokens inside the event handler `(e) => setN(n + 1)`: the param `e`
		// and the callee `setN` resolve to their exact node ranges (esrap emits
		// per-token segments; the arrow's own punctuation has no node start and
		// is not asserted).
		const paramStart = SOURCE.indexOf('(e) => setN(n + 1)') + 1;
		const paramSegments = segments.filter((s) => s.srcStart === paramStart);
		expect(paramSegments.length).toBeGreaterThan(0);
		for (const segment of paramSegments) expect(segment.srcEnd).toBe(paramStart + 1);

		const setNStart = SOURCE.indexOf('setN(n + 1)');
		const setNSegments = segments.filter((s) => s.srcStart === setNStart);
		expect(setNSegments.length).toBeGreaterThan(0);
		for (const segment of setNSegments) {
			expect(segment.srcEnd).toBe(setNStart + 'setN'.length);
		}

		// The identifier `n` inside `{n as string}` — smallest-node resolution
		// must give exactly the one-character identifier range, not the cast.
		const nStart = SOURCE.indexOf('{n as string}') + 1;
		const nSegments = segments.filter((s) => s.srcStart === nStart);
		expect(nSegments.length).toBeGreaterThan(0);
		for (const segment of nSegments) {
			expect(segment.srcEnd).toBe(nStart + 1);
		}

		// A setup-statement token: `useState` in the declaration maps with the
		// callee identifier's exact range.
		const useStateStart = SOURCE.indexOf('useState(0)');
		const useStateSegments = segments.filter((s) => s.srcStart === useStateStart);
		expect(useStateSegments.length).toBeGreaterThan(0);
		for (const segment of useStateSegments) {
			expect(segment.srcEnd).toBe(useStateStart + 'useState'.length);
		}
	});

	it('orders segments and closes generated ranges against line neighbours', () => {
		const { segments } = segmentsFor(options);
		expect(segments.length).toBeGreaterThan(0);
		for (let i = 1; i < segments.length; i++) {
			const prev = segments[i - 1];
			const next = segments[i];
			expect(
				next.genLine > prev.genLine ||
					(next.genLine === prev.genLine && next.genCol >= prev.genCol),
			).toBe(true);
		}
		for (const segment of segments) {
			if (segment.genEndCol !== null) {
				expect(segment.genEndCol).toBeGreaterThan(segment.genCol);
			}
		}
	});
});

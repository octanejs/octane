// Source ↔ output position mapping (src/lib/playground-mapping.ts) — the
// contract behind the playground's click-to-navigate: an offset in the source
// resolves to the range(s) in the compiled output that came from it, and an
// offset in the output resolves back to its source range. Every output target
// the pane offers is covered in BOTH directions, against real compiler
// artifacts; focused fixtures protect the shared-boundary and
// ambiguity-rejection rules that no real artifact pins deterministically.
import { describe, it, expect } from 'vitest';
import { compileRuntime, compileTypes } from '../src/lib/playground.ts';
import { collectAuthoredRanges } from '../src/lib/playground-ast.ts';
import {
	DEFAULT_WORKSPACES,
	exampleWorkspace,
	getExample,
} from '../src/lib/playground-examples.ts';
import {
	identityMapping,
	mappingFromInspection,
	type CodeMapping,
} from '../src/lib/playground-mapping.ts';

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

/** Build the Types mapping exactly as the page does. */
function typesArtifact(source: string, filename = 'App.tsrx') {
	const types = compileTypes(source, filename);
	if (!types.ok) throw new Error(types.error);
	const mapping = mappingFromInspection(source, types.code, types.segments, null, null, {
		ranges: collectAuthoredRanges(types.generatedAst),
	});
	if (!mapping) throw new Error('no types mapping');
	return { code: types.code, segments: types.segments, mapping };
}

/** Build a Client/Server mapping exactly as the page does. */
function runtimeArtifact(source: string, mode: 'client' | 'server', filename = 'App.tsrx') {
	const result = compileRuntime(source, filename, mode);
	if (!result.ok) throw new Error(result.error);
	const mapping = mappingFromInspection(
		source,
		result.code,
		result.segments,
		result.templates,
		result.aliases,
	);
	if (!mapping) throw new Error(`no ${mode} mapping`);
	return { code: result.code, mapping };
}

/** Does the source offset resolve to a generated range whose text is `token`? */
const mapsForward = (mapping: CodeMapping, generated: string, offset: number, token: string) =>
	(mapping.pairFromSource(offset)?.output ?? []).some(
		(range) => textAt(generated, range) === token,
	);

/** …and the reverse, for a generated offset. */
const mapsBack = (mapping: CodeMapping, source: string, offset: number, token: string) =>
	(mapping.pairFromGenerated(offset)?.source ?? []).some(
		(range) => textAt(source, range) === token,
	);

describe('types mapping (type-only inspection segments)', () => {
	const types = typesArtifact(SOURCE);
	const mapping = types.mapping;

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
		// The string and the identifier map, but not the `+` between them, so the
		// operator resolves through the expression that contains it.
		const offset = SOURCE.indexOf("'Count: ' + count") + "'Count: ' ".length;
		const ranges = mapping!.pairFromSource(offset)?.output;
		expect(ranges).not.toBeNull();
		expect(ranges!.some((range) => textAt(types.code, range) === "'Count: ' + count")).toBe(true);
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
		// One generated line, a wide span and a narrow one starting inside it.
		const generated = 'x'.repeat(40);
		const mapping = mappingFromInspection(null, generated, [
			{ genLine: 0, genCol: 10, genEndCol: 30, srcStart: 0, srcEnd: 20 },
			{ genLine: 0, genCol: 30, genEndCol: 33, srcStart: 5, srcEnd: 8 },
		]);
		// A cursor past the narrow span resolves through the wide one.
		expect(mapping?.pairFromSource(15)).toEqual({
			source: [{ from: 0, to: 20 }],
			output: [{ from: 10, to: 30 }],
		});
	});
});

describe('types mapping — template-directive keywords', () => {
	// A directive has no counterpart in the typed output — the transform either
	// rewrites it (`@for` → a `map_iterable` call) or preserves only its
	// JavaScript keyword. Two mechanisms cover them: the transform's `inspect`
	// flag anchors a rewritten construct on its authored keyword, and the
	// inspection entry claims the keyword's exact span for the preserved ones
	// (whose segments otherwise report the whole construct).
	const source = `export default function App() @{
	const n = 1;
	const items: string[] = [];
	<div>
		@if (n > 0) { <b class="hot">y</b> } @else { <i>e</i> }
		@for (const i of items; key i) { <li>{i}</li> } @empty { <li>x</li> }
		@switch (n) {
			@case 1: { <s>one</s> }
			@default: { <u>o</u> }
		}
	</div>
}
`;
	const types = typesArtifact(source);

	it.each([
		['@for', ['__map_iterable']],
		['@switch', ['switch']],
		['@case', ['case']],
		['@default', ['default']],
	])('resolves %s to the code it lowered to', (keyword, expected) => {
		const pair = types.mapping.pairFromSource(source.indexOf(keyword) + 1);
		expect(pair, `${keyword} did not resolve`).not.toBeNull();
		// Exactly the authored keyword, never the construct it introduces.
		expect(textAt(source, pair!.source[0])).toBe(keyword);
		expect(pair!.output.map((range) => textAt(types.code, range))).toEqual(expected);
	});

	it('resolves a static attribute VALUE the transform widened', () => {
		// The scoped-style pass merges a hash into the authored value, so the two
		// sides differ in length. A reprint's segments are still trustworthy —
		// the authored end is a real node range — and dropping them was what made
		// `class="hint"` unhoverable in the Types pane.
		const at = source.indexOf('class="hot"') + 'class="'.length;
		const pair = types.mapping.pairFromSource(at);
		expect(pair, 'the attribute value did not resolve').not.toBeNull();
		expect(textAt(source, pair!.source[0])).toBe('"hot"');
		expect(pair!.output.map((range) => textAt(types.code, range))).toEqual(['"hot"']);
	});

	it('never answers with a whole construct', () => {
		// A segment covering the `@{ … }` body or the component function would
		// win at every position no finer segment covers, flashing the entire
		// component on hover.
		for (let offset = 0; offset < source.length; offset++) {
			const pair = types.mapping.pairFromSource(offset);
			if (!pair) continue;
			expect(pair.source[0].to - pair.source[0].from).toBeLessThan(source.length / 4);
		}
	});

	it('resolves @empty to the arm the clause became', () => {
		const pair = types.mapping.pairFromSource(source.indexOf('@empty') + 1);
		expect(pair, '@empty did not resolve').not.toBeNull();
		expect(textAt(source, pair!.source[0])).toBe('@empty');
		expect(pair!.output.length).toBe(1);
	});

	it.each(['@if', '@else'])('resolves %s to the arm it renders', (keyword) => {
		// `@if` lowers to a ternary whose own start coincides with its test's, so
		// the test's mapping wins that generated position. Each ARM is a distinct
		// position, and pointing a directive at the branch it renders is what the
		// runtime targets already do.
		const pair = types.mapping.pairFromSource(source.indexOf(keyword) + 1);
		expect(pair, `${keyword} did not resolve`).not.toBeNull();
		expect(textAt(source, pair!.source[0])).toBe(keyword);
		expect(pair!.output.length).toBe(1);
	});

	// `@try` becomes a boundary element, and each of its clauses becomes that
	// element's `fallback` prop. Which element `@try` names depends on the
	// clauses: it is the boundary the block itself produced, and a `@pending`
	// makes that the `<Suspense>` the error boundary then wraps.
	const tryCase = (body: string) => {
		const source = `export default function App() @{
	<div>
		${body}
	</div>
}
`;
		return { source, ...typesArtifact(source) };
	};
	/** The element whose opening tag `at` sits inside. */
	const ownerTag = (code: string, at: number) =>
		code.slice(0, at).match(/<([A-Za-z$_][\w$]*)[^<]*$/)?.[1] ?? null;

	it.each([
		['@pending alone', '@try { <p>a</p> } @pending { <p>l</p> }', 'Suspense'],
		['@catch alone', '@try { <p>a</p> } @catch (e) { <p>z</p> }', 'TsrxErrorBoundary'],
		['both clauses', '@try { <p>a</p> } @pending { <p>l</p> } @catch (e) { <p>z</p> }', 'Suspense'],
	])('resolves @try to the boundary it became — %s', (_label, body, expected) => {
		const { source, code, mapping } = tryCase(body);
		const pair = mapping.pairFromSource(source.indexOf('@try') + 1);
		expect(pair, '@try did not resolve').not.toBeNull();
		expect(textAt(source, pair!.source[0])).toBe('@try');
		expect(pair!.output.map((range) => textAt(code, range))).toEqual([expected]);
	});

	it.each([
		['@pending', 'Suspense'],
		['@catch', 'TsrxErrorBoundary'],
	])('resolves %s to the fallback it fills', (keyword, owner) => {
		const { source, code, mapping } = tryCase(
			'@try { <p>a</p> } @pending { <p>l</p> } @catch (e) { <p>z</p> }',
		);
		const pair = mapping.pairFromSource(source.indexOf(keyword) + 1);
		expect(pair, `${keyword} did not resolve`).not.toBeNull();
		expect(textAt(source, pair!.source[0])).toBe(keyword);
		expect(pair!.output.map((range) => textAt(code, range))).toEqual(['fallback']);
		// Both boundaries take a `fallback`; each clause must reach its OWN.
		expect(ownerTag(code, pair!.output[0].from)).toBe(owner);
	});
});

describe('types mapping — spans the token map does not carry', () => {
	// The printer emits one map segment per TOKEN, and raw JSX text is not a
	// token, so before the verbatim pass a text run had NO mapping in either
	// direction — the visible symptom being text that highlights nothing.
	const source = `export function App() @{
	<div class="card">
		Hello world
		<button>Increment</button>
	</div>
}
`;
	const { code, mapping } = typesArtifact(source);

	it.each([
		['a multi-word text run on its own line', 'Hello world'],
		['a text run inline with its element', 'Increment'],
	])('maps %s in both directions', (_label, token) => {
		const sourceOffset = source.indexOf(token);
		const generatedOffset = code.indexOf(token);
		expect(generatedOffset).toBeGreaterThanOrEqual(0);

		expect(mapping.pairFromSource(sourceOffset + 1)?.output).toContainEqual({
			from: generatedOffset,
			to: generatedOffset + token.length,
		});
		expect(mapping.pairFromGenerated(generatedOffset + 1)?.source).toContainEqual({
			from: sourceOffset,
			to: sourceOffset + token.length,
		});
	});

	it('keeps the compiler token mapping when both could claim a range', () => {
		// `class` is a real token mapping; the verbatim pass must not shadow it
		// with a second, differently-shaped range.
		const sourceOffset = source.indexOf('class');
		const generatedOffset = code.indexOf('class');
		expect(mapping.pairFromSource(sourceOffset)?.output).toEqual([
			{ from: generatedOffset, to: generatedOffset + 'class'.length },
		]);
	});

	it('leaves a rewritten span unmapped rather than guessing', () => {
		// `@{ … }` becomes `{ return … }`: the block's authored text appears
		// nowhere in the output, so nothing is invented for it.
		const offset = source.indexOf('@{');
		expect(mapping.pairFromSource(offset)?.output ?? []).not.toContainEqual(
			expect.objectContaining({ from: code.indexOf('@{') }),
		);
	});
});

describe.each([
	['client', 'client' as const],
	['server', 'server' as const],
])('%s mapping (compiler inspection segments)', (_label, mode) => {
	const { code, mapping } = runtimeArtifact(SOURCE, mode);

	it('maps a setup identifier out to the emitted module and back', () => {
		const sourceOffset = SOURCE.indexOf('useState(0)');
		expect(mapsForward(mapping, code, sourceOffset + 2, 'useState')).toBe(true);

		// Every generated `useState` came from that one authored call site or
		// from the import that introduced it — both are exact source tokens.
		const generatedOffset = code.indexOf('useState(0');
		expect(generatedOffset).toBeGreaterThanOrEqual(0);
		expect(mapsBack(mapping, SOURCE, generatedOffset + 2, 'useState')).toBe(true);
	});

	it('maps an expression inside the template out and back', () => {
		const sourceOffset = SOURCE.indexOf("'Count: ' + count");
		expect(mapsForward(mapping, code, sourceOffset + 2, "'Count: '")).toBe(true);

		const generatedOffset = code.indexOf("'Count: '");
		expect(generatedOffset).toBeGreaterThanOrEqual(0);
		expect(mapsBack(mapping, SOURCE, generatedOffset + 2, "'Count: '")).toBe(true);
	});

	it('never claims a generated range that runs past the document', () => {
		for (const offset of [0, Math.floor(code.length / 2), code.length - 1]) {
			for (const range of mapping.pairFromGenerated(offset)?.output ?? []) {
				expect(range.to).toBeLessThanOrEqual(code.length);
				expect(range.from).toBeLessThan(range.to);
			}
		}
	});

	it('trims the trailing whitespace off a generated range', () => {
		for (const offset of [0, Math.floor(code.length / 3), Math.floor(code.length / 2)]) {
			for (const range of mapping.pairFromGenerated(offset)?.output ?? []) {
				expect(textAt(code, range)).toBe(textAt(code, range).trimEnd());
			}
		}
	});

	it('never scatters a forward lookup across a declaration it could not place', () => {
		// The guard against region attributions: whatever a source offset
		// resolves to, it is that authored text's own emissions, not every token
		// its enclosing declaration happened to produce.
		for (let offset = 0; offset < SOURCE.length; offset++) {
			const pair = mapping.pairFromSource(offset);
			if (!pair) continue;
			expect(pair.output.length).toBeLessThanOrEqual(8);
			// Nothing resolves to the component as a whole.
			expect(pair.source[0].to - pair.source[0].from).toBeLessThan(SOURCE.length / 2);
		}
	});
});

describe('forward lookups — region attributions', () => {
	it('declines a declaration-wide range that has finer mappings inside it', () => {
		// The shape a `<style>` block produces: the whole component maps to the
		// hoisted stylesheet literal (comparable in SIZE, so no length heuristic
		// catches it) while real tokens map inside it. Hovering the component
		// must resolve through those tokens, never through the region.
		const generated = 'HEAD injectStyle("....................") name TAIL';
		const mapping = mappingFromInspection(null, generated, [
			// component [0,40) → the stylesheet literal
			{ genLine: 0, genCol: 5, genEndCol: 39, srcStart: 0, srcEnd: 40 },
			// a real token inside the component
			{ genLine: 0, genCol: 40, genEndCol: 44, srcStart: 10, srcEnd: 14 },
		]);
		expect(mapping?.pairFromSource(2)).toBeNull();
		expect(mapping?.pairFromSource(11)?.output).toEqual([{ from: 40, to: 44 }]);
		// Backwards the region is still an honest answer.
		expect(mapping?.pairFromGenerated(10)?.source).toEqual([{ from: 0, to: 40 }]);
	});

	it('keeps a containing range whose generated image reproduces it verbatim', () => {
		// A reprint of the authored text is specific even though finer tokens
		// map inside it — this is what lets an expression answer for its own
		// punctuation in the type-only output.
		const generated = 'x = a + b;';
		const mapping = mappingFromInspection(null, generated, [
			{ genLine: 0, genCol: 4, genEndCol: 9, srcStart: 4, srcEnd: 9 }, // `a + b`
			{ genLine: 0, genCol: 4, genEndCol: 5, srcStart: 4, srcEnd: 5 }, // `a`
		]);
		expect(mapping?.pairFromSource(6)?.output).toEqual([{ from: 4, to: 9 }]);
	});

	it('declines an inferred pair whose generated text is not the authored text', () => {
		// Nothing corroborates it — the printer attributed a position, it did not
		// assert a correspondence. Even with no competing mapping anywhere near,
		// it stays out of the forward index…
		const mapping = mappingFromInspection("import { useState } from 'octane';", 'IMPORTED', [
			{ genLine: 0, genCol: 0, genEndCol: 8, srcStart: 0, srcEnd: 34 },
		]);
		expect(mapping?.pairFromSource(5)).toBeNull();
		// …while backwards it is still the honest answer.
		expect(mapping?.pairFromGenerated(4)?.source).toEqual([{ from: 0, to: 34 }]);
	});

	it('keeps an inferred pair that reproduces the authored text', () => {
		const mapping = mappingFromInspection('let total = 1;', 'let _total = 1;', [
			{ genLine: 0, genCol: 4, genEndCol: 10, srcStart: 4, srcEnd: 9 }, // `total` → `_total`
			{ genLine: 0, genCol: 13, genEndCol: 14, srcStart: 12, srcEnd: 13 }, // `1` → `1`
		]);
		expect(mapping?.pairFromSource(5)).toBeNull();
		expect(mapping?.pairFromSource(12)?.output).toEqual([{ from: 13, to: 14 }]);
	});

	it('declines once one authored range claims more emissions than a highlight can carry', () => {
		const segments = Array.from({ length: 9 }, (_, index) => ({
			genLine: index,
			genCol: 0,
			genEndCol: 3,
			srcStart: 0,
			srcEnd: 3,
		}));
		const generated = Array.from({ length: 9 }, () => 'abc').join('\n');
		expect(
			mappingFromInspection(null, generated, segments.slice(0, 8))?.pairFromSource(1),
		).not.toBeNull();
		expect(mappingFromInspection(null, generated, segments)?.pairFromSource(1)).toBeNull();
		// The reverse direction is uncapped — one generated position, one origin.
		expect(mappingFromInspection(null, generated, segments)?.pairFromGenerated(1)).not.toBeNull();
	});
});

describe('component tags — the closing tag has no emission of its own', () => {
	// `</Card>` is pure syntax: the OPENING name became the emitted component
	// reference and the closing one produces nothing. It is mapped as an alias of
	// the opening name so a component's closing tag is reachable the way a host
	// element's is.
	const source = `function Card() @{ <b>x</b> }
export default function App() @{
	<section><Card></Card></section>
}
`;

	it.each([
		['client', 'client' as const],
		['server', 'server' as const],
	])('resolves an opening and closing component tag alike in %s', (_label, mode) => {
		const { code, mapping } = runtimeArtifact(source, mode);
		const open = source.indexOf('<Card>') + 1;
		const close = source.indexOf('</Card>') + 2;
		expect(mapping.pairFromSource(open)?.output.map((r) => textAt(code, r))).toEqual(['Card']);
		expect(mapping.pairFromSource(close)?.output.map((r) => textAt(code, r))).toEqual(['Card']);
		// The alias claims the CLOSING name's own authored range, not the opening
		// one — hovering it highlights what the pointer is actually over.
		expect(mapping.pairFromSource(close)?.source).toEqual([
			{ from: close - 2 + 2, to: close - 2 + 2 + 'Card'.length },
		]);
	});
});

describe('scoped styles map to the stylesheet they became', () => {
	// `<style>` is stripped from the DOM output and its CSS is hoisted into a
	// module-level `injectStyle(hash, css)`. The whole block and the whole
	// stylesheet are the useful pairing — both are single units.
	const source = `export default function App() @{
	<div class="demo">
		<p>hi</p>
		<style>
			.demo { display: grid; }
		</style>
		<style>
			p { margin: 0; }
		</style>
	</div>
}
`;

	it.each([
		['client', 'client' as const],
		['server', 'server' as const],
	])('pairs the block with the injected CSS in %s', (_label, mode) => {
		const { code, mapping } = runtimeArtifact(source, mode);
		const at = source.indexOf('<style>');
		const pair = mapping.pairFromSource(at + 2);
		expect(pair, 'the style block did not resolve').not.toBeNull();
		// The authored range is the block itself…
		expect(textAt(source, pair!.source[0]).startsWith('<style>')).toBe(true);
		// …and it points at the CSS the injection carries.
		expect(pair!.output.length).toBe(1);
		expect(textAt(code, pair!.output[0])).toContain('.demo');
		// A rule inside the block resolves through the same pairing.
		expect(mapping.pairFromSource(source.indexOf('.demo {') + 2)).not.toBeNull();

		// Several blocks share one scope hash and therefore ONE injection. The
		// call carries the first block's location, so the rest reach it by alias
		// — and must answer with the same thing, not with more.
		const second = mapping.pairFromSource(source.indexOf('<style>', at + 1) + 2);
		expect(second, 'the second style block did not resolve').not.toBeNull();
		expect(textAt(source, second!.source[0]).startsWith('<style>')).toBe(true);
		expect(second!.output.map((range) => textAt(code, range))).toEqual(
			pair!.output.map((range) => textAt(code, range)),
		);
		expect(mapping.pairFromSource(source.indexOf('p { margin') + 2)).not.toBeNull();
	});
});

describe('client mapping — reactive emissions', () => {
	const { code, mapping } = runtimeArtifact(SOURCE, 'client');

	it('maps an event handler binding to every emitted call site', () => {
		const sourceOffset = SOURCE.indexOf('setCount(count + 1)');
		const pair = mapping.pairFromSource(sourceOffset + 2);
		expect(pair?.source).toContainEqual({
			from: sourceOffset,
			to: sourceOffset + 'setCount'.length,
		});
		// The mount and update branches both bind it, and both are pointed at.
		expect(pair!.output.length).toBeGreaterThan(1);
		for (const range of pair!.output) expect(textAt(code, range)).toContain('setCount');
	});
});

describe('server mapping — the SSR emit', () => {
	const { code, mapping } = runtimeArtifact(SOURCE, 'server');

	it('resolves static markup through the runs SSR bakes it into', () => {
		// SSR has no hoisted templates; each static run is a template-literal
		// quasi that reports its own authored origins.
		expect(mapsForward(mapping, code, SOURCE.indexOf('<div') + 1, 'div')).toBe(true);
		expect(mapsForward(mapping, code, SOURCE.indexOf('Increment') + 1, 'Increment')).toBe(true);
	});

	it('leaves an event handler SSR never binds unmapped', () => {
		// The offset resolves only through the enclosing component's own range,
		// which would scatter marks over unrelated module tokens. Silence is the
		// contract.
		expect(mapping.pairFromSource(SOURCE.indexOf('setCount(count + 1)') + 1)).toBeNull();
	});

	it('still resolves the generated side back to the component that produced it', () => {
		// Backwards, a wide attribution is honest and useful, so it is kept.
		const generatedOffset = mapping.pairFromSource(SOURCE.indexOf('useState(0)'))!.output[0].from;
		expect(mapping.pairFromGenerated(generatedOffset)).not.toBeNull();
	});
});

describe('client mapping — static template origins', () => {
	// Static markup is baked into ONE hoisted HTML string, so tag names,
	// attributes and text have no map segment of their own. The compiler
	// records their authored ranges out of band; without resolving those into
	// the printed literal the whole static half of a component is unmappable.
	const source = `export function App() @{
	<button class="cta" type="submit">Increment</button>
}
`;
	const { code, mapping } = runtimeArtifact(source, 'client');
	const literal = code.slice(code.indexOf('"<button'));

	it.each([
		['a tag name', 'button', 'button'],
		['a static attribute name', 'class', 'class'],
		['static text', 'Increment', 'Increment'],
	])('maps %s into the hoisted template literal', (_label, token, expected) => {
		const sourceOffset = source.indexOf(token);
		const output = mapping.pairFromSource(sourceOffset + 1)?.output ?? [];
		expect(output.length).toBeGreaterThan(0);
		expect(
			output.some(
				(range) =>
					textAt(code, range) === expected &&
					range.from > code.indexOf('"<button') &&
					range.to < code.indexOf('"<button') + literal.length,
			),
		).toBe(true);
	});

	it('maps a position inside the template literal back to authored source', () => {
		const generatedOffset = code.indexOf('Increment', code.indexOf('"<button'));
		expect(mapsBack(mapping, source, generatedOffset + 1, 'Increment')).toBe(true);
	});

	it('separates the opening and closing tag names, which are distinct source', () => {
		// Both spellings exist in the authored source and both are serialized, so
		// each resolves to its own span rather than the pair resolving to both.
		const open = source.indexOf('<button') + 1;
		const close = source.indexOf('</button>') + 2;
		expect(mapping.pairFromSource(open)?.output.map((r) => textAt(code, r))).toEqual(['button']);
		expect(mapping.pairFromSource(close)?.output.map((r) => textAt(code, r))).toEqual(['button']);
		// …and they are different positions in the generated HTML.
		expect(mapping.pairFromSource(open)!.output[0].from).not.toBe(
			mapping.pairFromSource(close)!.output[0].from,
		);
	});
});

describe('inspection mapping — malformed and absent artifacts', () => {
	it('returns null instead of throwing when there are no segments', () => {
		expect(mappingFromInspection(null, 'const a = 1;', null)).toBeNull();
		expect(mappingFromInspection(null, 'const a = 1;', undefined)).toBeNull();
		expect(mappingFromInspection(null, 'const a = 1;', [])).toBeNull();
	});

	it('drops segments with no authored end or no generated width', () => {
		const generated = 'const a = 1;\nconst b = 2;';
		const mapping = mappingFromInspection(null, generated, [
			// Structural punctuation: mapped generated-side, but no authored node
			// starts there, so it cannot produce a source highlight.
			{ genLine: 0, genCol: 0, genEndCol: 6, srcStart: 4, srcEnd: null },
			{ genLine: 1, genCol: 0, genEndCol: 5, srcStart: 0, srcEnd: 5 },
			// A generated line the document does not have.
			{ genLine: 9, genCol: 0, genEndCol: 2, srcStart: 0, srcEnd: 2 },
		]);
		expect(mapping?.pairFromGenerated(2)).toBeNull();
		expect(mapping?.pairFromGenerated(14)).toEqual({
			source: [{ from: 0, to: 5 }],
			output: [{ from: 13, to: 18 }],
		});
	});

	it('closes an open-ended segment at the end of its generated line', () => {
		const generated = 'let x = 1;\nlet y = 2;';
		const mapping = mappingFromInspection(null, generated, [
			{ genLine: 0, genCol: 4, genEndCol: null, srcStart: 0, srcEnd: 1 },
		]);
		expect(mapping?.pairFromGenerated(5)?.output).toEqual([{ from: 4, to: 10 }]);
	});

	it('re-bases template origins through the literal escaping', () => {
		// The recorded offsets index the LOGICAL html; the printed literal has
		// escapes before them, so a naive offset would land two characters early.
		const html = '<b class="x">hi</b>';
		const generated = `const _t$0 = template(${JSON.stringify(html)});`;
		const at = generated.indexOf(JSON.stringify(html)) + 1;
		const mapping = mappingFromInspection(
			null,
			generated,
			[{ genLine: 0, genCol: 0, genEndCol: 5, srcStart: 0, srcEnd: 5 }],
			[{ html, origins: [{ start: 13, end: 15, srcStart: 40, srcEnd: 42 }] }],
		);
		const output = mapping?.pairFromSource(40)?.output ?? [];
		expect(output.length).toBe(1);
		expect(generated.slice(output[0].from, output[0].to)).toBe('hi');
		// Two backslashes precede the span, so the escaped offset is html+2.
		expect(output[0].from).toBe(at + 13 + 2);
	});

	it('ignores a template whose literal is not in the generated document', () => {
		const mapping = mappingFromInspection(
			null,
			'const a = 1;',
			[{ genLine: 0, genCol: 0, genEndCol: 5, srcStart: 0, srcEnd: 5 }],
			[{ html: '<p>gone</p>', origins: [{ start: 1, end: 2, srcStart: 9, srcEnd: 10 }] }],
		);
		expect(mapping?.pairFromSource(9)).toBeNull();
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
	const output = typesArtifact(source);
	const mapping = output.mapping;
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

// ── Per-node coverage over the playground's own Counter example ──────────────
// The observable contract, node by node, for the workspace the playground
// opens with. Two things are pinned: every entry marked with a token maps to
// EXACTLY that generated text, and every entry marked `null` is silent rather
// than wrong. The nulls are not aspirations — they are places the compiler
// records no origin, and each names the artifact that would have to supply one.
// A compiler change that adds the data turns a null into a token here, which is
// the signal to update this table.
describe('Counter example — per-node mapping coverage', () => {
	const SOURCE = DEFAULT_WORKSPACES.tsrx.files[0].source;

	// [label, source token, offset probed WITHIN that token, expected output]
	type Row = [string, string, number, string[] | null];

	const CLIENT: Row[] = [
		['element tag name', '<div class="demo"', 1, ['div']],
		['its closing tag, which has its own authored range', '</div>', 2, ['div']],
		['static attribute name', 'class="demo"', 1, ['class']],
		['static attribute value, merged with the scoped class', 'demo"', 1, ['demo tsrx-e4a0861f']],
		['nested tag name', '<h2>', 1, ['h2']],
		['its closing tag', '</h2>', 2, ['h2']],
		['static text', 'Increment', 1, ['Increment']],
		['static text in a second element', 'Add item', 1, ['Add item']],
		['tag inside an @if block', '<p class="hot"', 1, ['p']],
		['text inside an @if block', 'Count is heating up!', 1, ['Count is heating up!']],
		['tag inside an @for block', '<li>', 1, ['li']],
		['tag inside an @empty block', '<li class="empty"', 1, ['li']],
		['text inside an @empty block', 'No items yet', 1, ['No items yet — add one.']],
		['a hook call', 'useState(0)', 1, ['useState']],
		['a state read in an expression', 'count + 1)', 1, ['count', 'count']],
		['a handler declaration', 'addItem =', 1, ['addItem']],
		['the same handler where the JSX binds it', 'addItem}', 1, ['addItem', 'addItem']],
		['the loop variable', '{item}', 1, ['item']],
		// An event attribute name emits nothing of its own — the compiler claims
		// it for the slot key the binding lowers to.
		['an event attribute name', 'onClick', 1, ["'$$click'"]],
		// A directive resolves to its helper call AND every function it hoisted.
		// A directive resolves to the helper call AND to every function it
		// hoisted — both the declaration and the reference, so a click can land
		// on the implementation.
		['the @if keyword', '@if', 1, ['__then$0', '_$ifBlock', '__then$0']],
		['the @for keyword', '@for', 1, ['_key$2', '__item$4', '_$forBlock', '_key$2', '__item$4']],
		['the @empty clause keyword', '@empty', 1, ['__empty$3', '__empty$3']],
	];

	// SSR bakes its markup into template-literal runs; each run reports its own
	// authored origins, so the server resolves the same nodes the client does.
	const SERVER: Row[] = [
		['element tag name', '<div class="demo"', 1, ['div']],
		['its closing tag', '</div>', 2, ['div']],
		['static attribute name', 'class="demo"', 1, ['class']],
		['static attribute value, merged with the scoped class', 'demo"', 1, ['demo tsrx-e4a0861f']],
		['nested tag name', '<h2>', 1, ['h2']],
		['static text', 'Increment', 1, ['Increment']],
		['tag inside an @if block', '<p class="hot"', 1, ['p']],
		['text inside an @if block', 'Count is heating up!', 1, ['Count is heating up!']],
		['tag inside an @for block', '<li>', 1, ['li']],
		['text inside an @empty block', 'No items yet', 1, ['No items yet — add one.']],
		['a hook call', 'useState(0)', 1, ['useState']],
		['the loop variable', '{item}', 1, ['item']],
		['the @if keyword', '@if', 1, ['_$ssrControl']],
		[
			'the @for keyword',
			'@for',
			1,
			['_$ssrControl', '_$ssrForBlock', '__sitem$1', '_$ssrForBlock'],
		],
		['the @empty clause keyword', '@empty', 1, ['__sempty$2']],
		// What SSR genuinely does not emit.
		['an event attribute name — SSR binds no events', 'onClick', 1, null],
		['an event handler SSR never binds', 'setCount(count + 1)', 1, null],
	];

	describe.each([
		['client', 'client' as const, CLIENT],
		['server', 'server' as const, SERVER],
	])('%s output', (_label, mode, rows) => {
		const { code, mapping } = runtimeArtifact(SOURCE, mode);

		it.each(rows)('%s', (_name, token, delta, expected) => {
			const at = SOURCE.indexOf(token);
			expect(at, `${token} missing from the Counter example`).toBeGreaterThanOrEqual(0);
			const pair = mapping.pairFromSource(at + delta);
			if (expected === null) {
				expect(pair).toBeNull();
				return;
			}
			expect(pair, `${token} should map`).not.toBeNull();
			expect(pair!.output.map((range) => textAt(code, range))).toEqual(expected);
		});
	});

	it('never resolves a generated position to something it did not come from', () => {
		// Sweep the whole generated document backwards: every answer must be a
		// real range inside the authored source.
		for (const mode of ['client', 'server'] as const) {
			const { code, mapping } = runtimeArtifact(SOURCE, mode);
			for (let offset = 0; offset < code.length; offset += 7) {
				for (const range of mapping.pairFromGenerated(offset)?.source ?? []) {
					expect(range.from).toBeGreaterThanOrEqual(0);
					expect(range.to).toBeLessThanOrEqual(SOURCE.length);
					expect(range.from).toBeLessThan(range.to);
				}
			}
		}
	});
});

// ── The Form actions example — attributes that never bake into HTML ──────────
// A static attribute is baked into template markup, and the template's origins
// carry it. `action`, `defaultValue` and every other dynamic attribute have no
// markup at all: they survive as a runtime call whose every token but the ones
// NAMING it maps to the value expression. Reported as hovering either name
// lighting up nothing in the Compiled pane, in client and server mode alike.
describe('Form actions example — attributes with no baked HTML', () => {
	const SOURCE = exampleWorkspace(getExample('form-actions')!, 'tsrx')!.files[0].source;

	// [label, authored name, the fragment locating it, distinct generated tokens]
	type Row = [string, string, string, Record<'client' | 'server', string[]>];
	const ROWS: Row[] = [
		[
			'a function form action',
			'action',
			'<form action={submit}',
			{ client: ['_$setFormAction', "'action'"], server: ['_$ssrAttr', '"action"'] },
		],
		[
			// No name token at all on the client: the helper IS the name.
			'an uncontrolled default value',
			'defaultValue',
			'defaultValue="Ada"',
			{ client: ['_$setDefaultValueUncontrolled'], server: ['"defaultValue"'] },
		],
		[
			'a boolean prop bound from a hook',
			'disabled',
			'disabled={status.pending}',
			{ client: ['_$setBooleanAttribute', "'disabled'"], server: ['_$ssrAttr', '"disabled"'] },
		],
	];

	describe.each([
		['client', 'client' as const],
		['server', 'server' as const],
	])('%s output', (_label, mode) => {
		const { code, mapping } = runtimeArtifact(SOURCE, mode);

		it.each(ROWS)('resolves %s in both directions', (_name, attr, anchor, expected) => {
			const anchorAt = SOURCE.indexOf(anchor);
			expect(anchorAt, `${anchor} missing from the example`).toBeGreaterThanOrEqual(0);
			const at = anchorAt + anchor.indexOf(attr);
			const pair = mapping.pairFromSource(at + 1);
			expect(pair, `${attr} resolved to nothing`).not.toBeNull();
			// The authored NAME — never the value, never the whole attribute.
			expect(pair!.source.map((range) => textAt(SOURCE, range))).toEqual([attr]);
			// Which tokens, not how many: one attribute legitimately writes on both
			// the mount and the update path.
			expect([...new Set(pair!.output.map((range) => textAt(code, range)))].sort()).toEqual(
				[...expected[mode]].sort(),
			);
			for (const range of pair!.output) {
				expect(mapsBack(mapping, SOURCE, range.from + 1, attr)).toBe(true);
			}
		});
	});
});

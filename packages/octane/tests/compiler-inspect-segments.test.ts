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

const SERVER_SOURCE = `import { useState } from 'octane';
export function App(props: { title: string }) @{
	const [n] = useState(0);
	<div title={'title:' + props.title}><span>{'count:' + n}</span></div>
}
`;

interface FatSegment {
	genLine: number;
	genCol: number;
	genEndCol: number | null;
	srcStart: number;
	srcEnd: number | null;
}

function segmentsFor(
	options: Record<string, unknown>,
	source = SOURCE,
): { code: string; segments: FatSegment[] } {
	const result = compile(source, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
		typeof compile
	> & { inspect: { segments: FatSegment[] } };
	expect(result.inspect).toBeDefined();
	expect(Array.isArray(result.inspect.segments)).toBe(true);
	return { code: result.code, segments: result.inspect.segments };
}

describe.each([
	['client', {}, SOURCE],
	['client dev', { dev: true }, SOURCE],
	['server', { mode: 'server' as const }, SERVER_SOURCE],
	['server dev', { mode: 'server' as const, dev: true }, SERVER_SOURCE],
])('generated program inspection — %s', (_label, options, source) => {
	it('exposes the Program used by the final module print', () => {
		const result = compile(source, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
			typeof compile
		> & { inspect: { ast: { type: string; sourceType: string; body: unknown[] } } };
		expect(result.inspect.ast.type).toBe('Program');
		expect(result.inspect.ast.sourceType).toBe('module');
		expect(result.inspect.ast.body.length).toBeGreaterThan(0);
	});
});

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

describe.each([
	['server', { mode: 'server' as const }],
	['server dev', { mode: 'server' as const, dev: true }],
])('server fat inspection segments — %s', (_label, options) => {
	it('is absent without the inspect option', () => {
		const plain = compile(SERVER_SOURCE, 'App.tsrx', options) as { inspect?: unknown };
		expect(plain.inspect).toBeUndefined();
	});

	it('carries exact ranges through the SSR function and HTML emit', () => {
		const { segments } = segmentsFor(options, SERVER_SOURCE);

		const useStateStart = SERVER_SOURCE.indexOf('useState(0)');
		expect(
			segments.some(
				(segment) =>
					segment.srcStart === useStateStart &&
					segment.srcEnd === useStateStart + 'useState'.length,
			),
		).toBe(true);

		const titleStart = SERVER_SOURCE.indexOf('props.title') + 'props.'.length;
		expect(
			segments.some(
				(segment) =>
					segment.srcStart === titleStart && segment.srcEnd === titleStart + 'title'.length,
			),
		).toBe(true);

		const countStart = SERVER_SOURCE.indexOf(`'count:' + n`) + `'count:' + `.length;
		expect(
			segments.some(
				(segment) => segment.srcStart === countStart && segment.srcEnd === countStart + 1,
			),
		).toBe(true);
	});
});

// Curated exact origins. A few lowerings have an authored counterpart the
// compiler KNOWS but the module map alone reports too widely: the map carries
// only a start, and the smallest node starting there is the whole attribute
// value or the whole directive. Those segments carry the precise authored range
// plus `exact`, so a consumer can offer them where it would refuse an inferred
// attribution.
describe.each([
	['client', {}],
	['client dev', { dev: true }],
	['client prod', { hmr: false as const }],
	['server', { mode: 'server' as const }],
	['server dev', { mode: 'server' as const, dev: true }],
])('exact authored origins — %s', (label, options) => {
	const server = label.startsWith('server');
	const SOURCE = `export default function App() @{
	const items: string[] = [];
	<div>
		<button onClick={() => {}}>Go</button>
		@if (items.length > 0) { <b>y</b> }
		@for (const i of items; key i) { <li>{i}</li> } @empty { <li>n</li> }
	</div>
}
`;

	interface Segment {
		genLine: number;
		genCol: number;
		genEndCol: number | null;
		srcStart: number;
		srcEnd: number | null;
		exact?: boolean;
	}

	function inspect() {
		const result = compile(SOURCE, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
			typeof compile
		> & { inspect: { segments: Segment[] } };
		// Never changes what ships.
		expect(compile(SOURCE, 'App.tsrx', options).code).toBe(result.code);
		const lineStarts = [0];
		for (let i = 0; i < result.code.length; i++) {
			if (result.code.charCodeAt(i) === 10) lineStarts.push(i + 1);
		}
		const text = (segment: Segment) => {
			const from = lineStarts[segment.genLine] + segment.genCol;
			const to =
				segment.genEndCol === null
					? (lineStarts[segment.genLine + 1] ?? result.code.length + 1) - 1
					: lineStarts[segment.genLine] + segment.genEndCol;
			return result.code.slice(from, to).trim();
		};
		return { code: result.code, segments: result.inspect.segments, text };
	}

	/** The authored spellings the exact segments naming `token` claim. */
	const claimsFor = (token: string) => {
		const { segments, text } = inspect();
		return segments
			.filter((segment) => segment.exact === true && text(segment) === token)
			.map((segment) => SOURCE.slice(segment.srcStart, segment.srcEnd!));
	};

	it('claims the authored directive keyword, not the whole block', () => {
		const control = server ? '_$ssrControl' : '_$ifBlock';
		expect(claimsFor(control)).toContain('@if');
		const loop = server ? '_$ssrForBlock' : '_$forBlock';
		expect(claimsFor(loop)).toContain('@for');
	});

	it('claims clause keywords when the directive is folded into a renderer', () => {
		// A directive used as a SETUP VALUE is folded: its arms compile on the
		// component side and the hoisted renderer reads them back as `props.hN`.
		// The clause has to claim the arm's DEFINITION — the renderer-side read
		// is a member expression whose tokens name nothing.
		const FOLDED = `export default function App(props: { on: boolean; items: string[] }) @{
	const branch = @if (props.on) { <p>y</p> } @else { <p>n</p> };
	const list = @for (const i of props.items; key i) { <li>{i}</li> } @empty { <li>x</li> };
	const guard = @try { <b>t</b> } @pending { <i>p</i> } @catch (e) { <s>c</s> };
	<div>{branch}{list}{guard}</div>
}
`;
		const result = compile(FOLDED, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
			typeof compile
		> & { inspect: { segments: Segment[] } };
		// Folding never changes what ships.
		expect(compile(FOLDED, 'App.tsrx', options).code).toBe(result.code);
		const claimed = new Set(
			result.inspect.segments
				.filter((segment) => segment.exact === true && segment.srcEnd !== null)
				.map((segment) => FOLDED.slice(segment.srcStart, segment.srcEnd!)),
		);
		for (const keyword of ['@if', '@else', '@for', '@empty', '@try', '@pending', '@catch']) {
			expect(claimed.has(keyword), `${keyword} is unreachable on the fold path`).toBe(true);
		}
	});

	it('claims a keyword for each arm function the directive hoists', () => {
		const { segments, text } = inspect();
		const armClaims = segments
			.filter((segment) => segment.exact === true && /^(__|_key)/.test(text(segment)))
			.map((segment) => SOURCE.slice(segment.srcStart, segment.srcEnd!));
		// A directive resolves to EVERY function it produced, and an arm
		// introduced by its own keyword claims that keyword instead.
		expect(armClaims.length).toBeGreaterThan(0);
		for (const claim of armClaims) expect(['@if', '@for', '@empty']).toContain(claim);
	});

	it('never claims a range the source does not spell that way', () => {
		const { segments } = inspect();
		for (const segment of segments) {
			if (segment.exact !== true) continue;
			const authored = SOURCE.slice(segment.srcStart, segment.srcEnd!);
			expect(authored.length).toBeGreaterThan(0);
			expect(['@if', '@for', '@empty', 'onClick']).toContain(authored);
		}
	});

	it('is absent without inspection', () => {
		const plain = compile(SOURCE, 'App.tsrx', options) as { inspect?: unknown };
		expect(plain.inspect).toBeUndefined();
	});

	if (!server) {
		it('claims the event attribute NAME for the slot key it lowers to', () => {
			// Every other token of the binding maps to the handler expression, so
			// without this `onClick` is unreachable from the output.
			const claims = claimsFor("'$$click'");
			// The mount and update writes both name the same authored attribute.
			expect(claims.length).toBeGreaterThan(0);
			for (const claim of claims) expect(claim).toBe('onClick');
		});
	} else {
		it('binds no events, so it claims no event attribute', () => {
			const { code } = inspect();
			expect(code).not.toContain('$$click');
		});
	}
});

// Every control-flow directive and every clause keyword resolves to the code it
// lowered to. A clause (`@else`, `@empty`, `@case`, `@default`, `@pending`,
// `@catch`) is a plain block starting at its `{`, so the parser's keyword span
// is its ONLY authored spelling; without it a cursor on the keyword has nothing
// to resolve to and the whole lowering answers as one undifferentiated block.
describe.each([
	['client', {}],
	['client dev', { dev: true }],
	['client prod', { hmr: false as const }],
	['server', { mode: 'server' as const }],
	['server dev', { mode: 'server' as const, dev: true }],
])('control-flow keyword origins — %s', (_label, options) => {
	const SOURCE = `export default function App() @{
	const n = 1;
	const items: string[] = [];
	<div>
		@if (n > 0) { <b>y</b> } @else { <i>e</i> }
		@for (const i of items; key i) { <li>{i}</li> } @empty { <li>x</li> }
		@switch (n) {
			@case 1: { <s>one</s> }
			@default: { <u>o</u> }
		}
		@try { <p>a</p> } @pending { <p>l</p> } @catch (e) { <p>z</p> }
	</div>
}
`;

	interface Segment {
		genLine: number;
		genCol: number;
		genEndCol: number | null;
		srcStart: number;
		srcEnd: number | null;
		exact?: boolean;
	}

	const KEYWORDS = [
		'@if',
		'@else',
		'@for',
		'@empty',
		'@switch',
		'@case',
		'@default',
		'@try',
		'@pending',
		'@catch',
	];

	const result = compile(SOURCE, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
		typeof compile
	> & { inspect: { segments: Segment[] } };

	it('emits the same module with and without inspection', () => {
		expect(compile(SOURCE, 'App.tsrx', options).code).toBe(result.code);
	});

	it.each(KEYWORDS)('resolves %s to the code it lowered to', (keyword) => {
		const at = SOURCE.indexOf(keyword);
		expect(at, `${keyword} missing from the fixture`).toBeGreaterThanOrEqual(0);
		const claimed = result.inspect.segments.filter(
			(segment) => segment.exact === true && segment.srcStart === at,
		);
		expect(claimed.length, `nothing claims ${keyword}`).toBeGreaterThan(0);
		// The claim is the keyword itself — never the block it introduces.
		for (const segment of claimed) {
			expect(SOURCE.slice(segment.srcStart, segment.srcEnd!)).toBe(keyword);
		}
	});

	it('claims no range the source does not spell as a keyword or attribute', () => {
		for (const segment of result.inspect.segments) {
			if (segment.exact !== true) continue;
			const authored = SOURCE.slice(segment.srcStart, segment.srcEnd!);
			expect([...KEYWORDS, 'onClick']).toContain(authored);
		}
	});
});

// A `<style>` block's parsed stylesheet hangs off its element with CSS node
// offsets in the STYLESHEET's coordinate system, not the file's. The
// smallest-node index that resolves a segment's authored end must not contain
// them: a selector range then collides with whatever code sits at the same file
// offset, and the collision is positional — two identical components resolve
// differently depending on where each one happens to sit.
describe.each([
	['client', {}],
	['server', { mode: 'server' as const }],
])('authored ends beside a scoped stylesheet — %s', (_label, options) => {
	// The second component is byte-identical to the first apart from its name;
	// only its position differs, which is what the collision keys on.
	const SOURCE = `function Blue(props: { label: string }) @{
	<span class="chip blue">{'blue: ' + props.label}</span>
}

function Green(props: { label: string }) @{
	<span class="chip green">{'green: ' + props.label}</span>
}

export default function App() @{
	<div>
		<Blue label="one" />
		<Green label="two" />
		<style>
			.chip { padding: 0.2rem 0.5rem; border-radius: 999px; }
			.blue { background: #dbeafe; }
			.green { background: #dcfce7; }
		</style>
	</div>
}
`;

	it('gives both identical literals their own full authored range', () => {
		const result = compile(SOURCE, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
			typeof compile
		> & { inspect: { segments: Array<{ srcStart: number; srcEnd: number | null }> } };

		for (const literal of ["'blue: '", "'green: '"]) {
			const at = SOURCE.indexOf(literal);
			const claims = result.inspect.segments
				.filter((segment) => segment.srcStart === at && segment.srcEnd !== null)
				.map((segment) => SOURCE.slice(segment.srcStart, segment.srcEnd!));
			expect(claims.length, `${literal} has no segment`).toBeGreaterThan(0);
			// Pre-fix the second one reported a four-character `ClassSelector`
			// range borrowed from the stylesheet.
			for (const claim of claims) expect(claim).toBe(literal);
		}
	});
});

// A `<style>` block never reaches the DOM output: its CSS is scoped and hoisted
// into a module-level `injectStyle(hash, css)`. Without an origin that call
// belongs to the module, so the authored block has no counterpart to point at.
describe.each([
	['client', {}],
	['client prod', { hmr: false as const }],
	['server', { mode: 'server' as const }],
])('scoped styles claim the block they came from — %s', (_label, options) => {
	const SOURCE = `export default function App() @{
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

	it('anchors the injected stylesheet on every authored block', () => {
		const result = compile(SOURCE, 'App.tsrx', { ...options, inspect: true }) as ReturnType<
			typeof compile
		> & {
			inspect: {
				segments: Array<{ srcStart: number; srcEnd: number | null; exact?: boolean }>;
				aliases: Array<{ srcStart: number; srcEnd: number; ofStart: number }>;
			};
		};
		// Inspection never changes what ships.
		expect(compile(SOURCE, 'App.tsrx', options).code).toBe(result.code);

		const first = SOURCE.indexOf('<style>');
		const second = SOURCE.indexOf('<style>', first + 1);
		expect(second).toBeGreaterThan(first);

		// The first block anchors the call…
		const claims = result.inspect.segments
			.filter((segment) => segment.exact === true && segment.srcStart === first)
			.map((segment) => SOURCE.slice(segment.srcStart, segment.srcEnd!));
		expect(claims.length, 'the style block has no exact segment').toBeGreaterThan(0);
		// …over its whole element, so a position inside a rule resolves too.
		for (const claim of claims) {
			expect(claim.startsWith('<style>')).toBe(true);
			expect(claim.endsWith('</style>')).toBe(true);
		}

		// …and every other block aliases onto it. One call can carry only one
		// location, so without the alias the second block claims a source offset
		// the print never emits at and stays unreachable.
		expect(result.inspect.aliases).toContainEqual({
			srcStart: second,
			srcEnd: SOURCE.indexOf('</style>', second) + '</style>'.length,
			ofStart: first,
		});
	});
});

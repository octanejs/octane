import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';

// Template-origin recording (the "2D" contract): `inspect: true` returns, for
// every span baked into a hoisted template's HTML (tag names, static
// attributes, static text), the authored source range that produced it —
// out-of-band on `result.inspect`, with the emitted CODE byte-identical to a
// non-inspect compile. Offsets are recorded at append time (never re-lexed),
// so every entry must slice cleanly out of both the template HTML and the
// compiled source.

type OriginKind = 'tag-open' | 'tag-close' | 'attr-name' | 'attr-value' | 'text';
interface Origin {
	start: number;
	end: number;
	srcStart: number;
	srcEnd: number;
	kind: OriginKind;
}
interface InspectTemplate {
	name: string;
	html: string;
	origins: Origin[];
}

// Nested hosts, a static class, a MULTI-LINE class (raw newline in the JSX
// string), an HTML-escaping value, a bare boolean attr, static text children
// with JSX indentation whitespace, a self-closing void element, and an <svg>
// subtree. Kept static so every span bakes into the template.
const SOURCE = `export function App() @{
	<div class="a b" title="a&b">
		<span data-x="y">  hello
			world  </span>
		<input disabled />
		<p class="m
	n">multi</p>
		<svg viewBox="0 0 10 10"><rect width="4" /></svg>
	</div>
}

export function Pair() @{
	<>
		<em>a</em>
		<strong>b</strong>
	</>
}

export function Wrapped(props: { on: boolean }) @{
	<section>
		@if (props.on) {
			<>
				<em>c</em>
				<strong>d</strong>
			</>
		}
	</section>
}
`;

// Mirror the compiler's escapers (escapeAttr / escapeHtml in compile.js) so
// escaped/collapsed entries can be asserted as `html slice === escaped(source
// slice)` even when the two sides differ in length.
const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KINDS = new Set(['tag-open', 'tag-close', 'attr-name', 'attr-value', 'text']);

function compileInspect(options: Record<string, unknown> = {}): InspectTemplate[] {
	const result = compile(SOURCE, 'origins.tsrx', { ...options, inspect: true });
	expect(result.inspect).toBeDefined();
	return result.inspect.templates as InspectTemplate[];
}

describe('compiler template-origin recording (inspect: true)', () => {
	it('is absent from a normal compile and never changes the emitted code (dev and prod)', () => {
		for (const options of [{}, { dev: true }, { hmr: false }, { dev: true, hmr: 'vite' }]) {
			const plain = compile(SOURCE, 'origins.tsrx', options);
			expect('inspect' in plain).toBe(false);
			const inspected = compile(SOURCE, 'origins.tsrx', { ...options, inspect: true });
			expect(inspected.code).toBe(plain.code);
			expect(inspected.inspect.templates.length).toBeGreaterThan(0);
		}
	});

	it('names each entry after its emitted _t$N template identifier', () => {
		const result = compile(SOURCE, 'origins.tsrx', { inspect: true });
		const names = new Set<string>();
		for (const t of result.inspect.templates as InspectTemplate[]) {
			// `name` is the hoisted template's identifier in the emitted module —
			// the hover tool's join key. Unique per template, present in the code.
			expect(t.name).toMatch(/^_t\$\d+$/);
			expect(names.has(t.name)).toBe(false);
			names.add(t.name);
			expect(result.code).toContain(t.name);
		}
	});

	it('every origin entry slices cleanly out of both the template HTML and the source', () => {
		for (const options of [{}, { dev: true }]) {
			const templates = compileInspect(options);
			// At minimum App's template and Pair's multi-root template exist; how
			// Wrapped's @if branch splits into templates is the compiler's choice.
			expect(templates.some((t) => t.html.startsWith('<div class='))).toBe(true);
			expect(templates.some((t) => t.html.includes('<em>a</em>'))).toBe(true);
			for (const t of templates) {
				let prevStart = -1;
				for (const o of t.origins) {
					expect(KINDS.has(o.kind)).toBe(true);
					// Sorted by start; spans in bounds on both sides.
					expect(o.start).toBeGreaterThanOrEqual(prevStart);
					prevStart = o.start;
					expect(o.start).toBeGreaterThanOrEqual(0);
					expect(o.end).toBeGreaterThan(o.start);
					expect(o.end).toBeLessThanOrEqual(t.html.length);
					expect(o.srcStart).toBeGreaterThanOrEqual(0);
					expect(o.srcEnd).toBeGreaterThan(o.srcStart);
					expect(o.srcEnd).toBeLessThanOrEqual(SOURCE.length);

					const gen = t.html.slice(o.start, o.end);
					const src = SOURCE.slice(o.srcStart, o.srcEnd);
					if (o.kind === 'tag-open' || o.kind === 'tag-close') {
						// Tag names emit verbatim.
						expect(gen).toBe(src);
					} else if (o.kind === 'attr-name') {
						// Name spans are equal here (no aliased names in the fixture);
						// where lengths match the slices must match byte-for-byte.
						expect(gen).toBe(src);
					} else if (o.kind === 'attr-value') {
						// html side excludes the quotes; source side is the authored
						// value node INCLUDING quotes, and the html is the escaped form.
						expect(src[0]).toBe('"');
						expect(src[src.length - 1]).toBe('"');
						expect(gen).toBe(escAttr(src.slice(1, -1)));
						if (gen.length === src.length - 2) expect(gen).toBe(src.slice(1, -1));
					} else {
						// text: the html side is the (possibly escaped) emission of the
						// authored JSXText range.
						expect(gen).toBe(escHtml(src));
						if (gen.length === src.length) expect(gen).toBe(src);
					}
				}
			}
		}
	});

	it('covers every authored tag, attribute, and static text of the fixture', () => {
		const app = compileInspect().find((t) => t.html.startsWith('<div class='))!;
		expect(app).toBeDefined();
		const bySrc = (o: Origin) => SOURCE.slice(o.srcStart, o.srcEnd);
		const ofKind = (kind: OriginKind) => app.origins.filter((o) => o.kind === kind);

		// Non-void tags get open+close; the void <input> records open only. Note
		// <rect/> is NOT an HTML void element — its authored self-close emits an
		// explicit </rect> in the template, hence a tag-close entry.
		const opens = ofKind('tag-open').map(bySrc);
		const closes = ofKind('tag-close').map(bySrc);
		expect(opens.sort()).toEqual(['div', 'input', 'p', 'rect', 'span', 'svg'].sort());
		expect(closes.sort()).toEqual(['div', 'p', 'rect', 'span', 'svg'].sort());

		// Every authored attribute has an attr-name entry.
		const names = ofKind('attr-name').map(bySrc);
		expect(names.sort()).toEqual(
			['class', 'title', 'data-x', 'disabled', 'class', 'viewBox', 'width'].sort(),
		);

		// Bare boolean attrs record their attr-name ONLY — `disabled=""` bakes an
		// empty presence value, so exactly the six real values are recorded.
		const values = ofKind('attr-value').map(bySrc);
		expect(values.sort()).toEqual(
			['"a b"', '"a&b"', '"y"', '"m\n\tn"', '"0 0 10 10"', '"4"'].sort(),
		);

		// Static text children, including the run with JSX indentation whitespace.
		const texts = ofKind('text').map(bySrc);
		expect(texts.sort()).toEqual(['  hello\n\t\t\tworld  ', 'multi'].sort());
	});

	it('records escaped and multi-line values against their authored ranges', () => {
		const app = compileInspect().find((t) => t.html.startsWith('<div class='))!;
		expect(app).toBeDefined();
		const entry = (pred: (o: Origin) => boolean) => {
			const found = app.origins.find(pred);
			expect(found).toBeDefined();
			return found as Origin;
		};

		// HTML-escaping value: differing lengths on the two sides is expected.
		const title = entry(
			(o) => o.kind === 'attr-value' && SOURCE.slice(o.srcStart, o.srcEnd) === '"a&b"',
		);
		expect(app.html.slice(title.start, title.end)).toBe('a&amp;b');

		// Multi-line class attribute keeps its raw newline on both sides.
		const multiline = entry(
			(o) => o.kind === 'attr-value' && SOURCE.slice(o.srcStart, o.srcEnd) === '"m\n\tn"',
		);
		expect(app.html.slice(multiline.start, multiline.end)).toBe('m\n\tn');

		// Static text with surrounding JSX whitespace maps the full JSXText range.
		const text = entry(
			(o) => o.kind === 'text' && app.html.slice(o.start, o.end).includes('hello'),
		);
		expect(SOURCE.slice(text.srcStart, text.srcEnd)).toBe('  hello\n\t\t\tworld  ');
		expect(app.html.slice(text.start, text.end)).toBe('  hello\n\t\t\tworld  ');
	});

	it('records multi-root component bodies (raw markup, runtime-added wrapper)', () => {
		const templates = compileInspect();
		// An opaque component destination resolves to raw multi-root markup +
		// frag flag (parseTemplate adds the wrapper at runtime), so the recorded
		// html — and therefore the offsets — carry no wrapper.
		const pair = templates.find((t) => t.html === '<em>a</em><strong>b</strong>')!;
		expect(pair).toBeDefined();
		const slice = (o: Origin) => pair.html.slice(o.start, o.end);
		const em = pair.origins.find((o) => o.kind === 'tag-open' && slice(o) === 'em');
		expect(em).toBeDefined();
		expect(em!.start).toBe(1);
		expect(SOURCE.slice(em!.srcStart, em!.srcEnd)).toBe('em');
		const texts = pair.origins.filter((o) => o.kind === 'text').map(slice);
		expect(texts.sort()).toEqual(['a', 'b']);
	});

	it('records the nested template of an @if branch body independently', () => {
		const templates = compileInspect();
		// The branch body is its own planJsx run → its own hoisted template with
		// its own origin frame (raw multi-root markup + frag flag; the runtime
		// adds the wrapper, so offsets carry none).
		const branch = templates.find((t) => t.html === '<em>c</em><strong>d</strong>')!;
		expect(branch).toBeDefined();
		const slice = (o: Origin) => branch.html.slice(o.start, o.end);
		const em = branch.origins.find((o) => o.kind === 'tag-open' && slice(o) === 'em');
		const strong = branch.origins.find((o) => o.kind === 'tag-open' && slice(o) === 'strong');
		expect(em).toBeDefined();
		expect(strong).toBeDefined();
		expect(em!.start).toBe(1);
		expect(SOURCE.slice(em!.srcStart, em!.srcEnd)).toBe('em');
		expect(SOURCE.slice(strong!.srcStart, strong!.srcEnd)).toBe('strong');
		const texts = branch.origins.filter((o) => o.kind === 'text').map(slice);
		expect(texts.sort()).toEqual(['c', 'd']);
		// The host template's <!> anchor carries no origin — only real baked
		// content is recorded.
		const host = templates.find((t) => t.html === '<section><!></section>')!;
		expect(host).toBeDefined();
		const hostSlices = host.origins.map((o) => host.html.slice(o.start, o.end));
		expect(hostSlices.sort()).toEqual(['section', 'section']);
	});
});

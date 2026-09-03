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
interface TemplatePart {
	type: 'TemplatePart';
	kind:
		| 'syntax'
		| 'tag-open'
		| 'tag-close'
		| 'attribute'
		| 'text'
		| 'anchor'
		| 'fragment-open'
		| 'fragment-close'
		| 'raw';
	value: string;
	origins: Origin[] | null;
	length: number;
}
interface TemplateElement {
	type: 'TemplateElement';
	tag: string;
	namespace: string;
	synthetic: boolean;
	opening: TemplatePart;
	attributes: TemplatePart[];
	openingEnd: TemplatePart;
	children: TemplateNode[];
	closing: TemplatePart | null;
	length: number;
}
type TemplateNode = TemplatePart | TemplateElement;
interface TemplateAst {
	type: 'Template';
	parts: TemplateNode[];
	length: number;
}
interface InspectTemplate {
	name: string;
	ast: TemplateAst;
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

export function HasNestedHelper() @{
	const render = () => @{
		<>
			<i>x</i>
			<b>y</b>
		</>
	};
	void render;
	<div>host</div>
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

function serializeTemplateNode(node: TemplateNode): string {
	if (node.type === 'TemplatePart') return node.value;
	return [
		node.opening.value,
		...node.attributes.map((attribute) => attribute.value),
		node.openingEnd.value,
		...node.children.map(serializeTemplateNode),
		node.closing?.value ?? '',
	].join('');
}

function collectTemplatePartKinds(nodes: TemplateNode[], kinds = new Set<string>()): Set<string> {
	for (const node of nodes) {
		if (node.type === 'TemplatePart') {
			kinds.add(node.kind);
			continue;
		}
		kinds.add(node.opening.kind);
		for (const attribute of node.attributes) kinds.add(attribute.kind);
		kinds.add(node.openingEnd.kind);
		collectTemplatePartKinds(node.children, kinds);
		if (node.closing !== null) kinds.add(node.closing.kind);
	}
	return kinds;
}

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

	it('interns identical production templates without orphaning repeated authored origins', () => {
		const source =
			'export function First() @{ <div class="same">same</div> }\n' +
			'export function Second() @{ <div class="same">same</div> }';
		const options = { hmr: false as const, dev: false };
		const plain = compile(source, 'duplicate-origins.tsrx', options);
		const inspected = compile(source, 'duplicate-origins.tsrx', { ...options, inspect: true });
		const templates = inspected.inspect.templates as InspectTemplate[];

		expect(inspected.code).toBe(plain.code);
		expect(templates).toHaveLength(1);
		expect(templates[0].html).toBe('<div class="same">same</div>');

		const secondOpening = source.indexOf('<div', source.indexOf('\n')) + 1;
		const firstOpening = source.indexOf('<div') + 1;
		expect(inspected.inspect.aliases).toContainEqual({
			srcStart: secondOpening,
			srcEnd: secondOpening + 'div'.length,
			ofStart: firstOpening,
		});
	});

	it('keeps identical markup separate when its parser namespace differs', () => {
		const source =
			'export function Opaque() @{ <a /> }\n' +
			'export function Svg(props) @{ <svg>@if (props.visible) { <a /> }</svg> }';
		const result = compile(source, 'template-namespaces.tsrx', {
			hmr: false,
			dev: false,
			inspect: true,
		});

		expect(
			(result.inspect.templates as InspectTemplate[]).filter(
				(template) => template.html === '<a></a>',
			),
		).toHaveLength(2);
	});

	it('exposes the structured template whose single serialization is the runtime HTML', () => {
		for (const template of compileInspect()) {
			expect(template.ast.type).toBe('Template');
			const serialized = template.ast.parts.map(serializeTemplateNode).join('');
			expect(serialized).toBe(template.html);
			expect(template.ast.length).toBe(template.html.length);
		}
		const app = compileInspect().find((template) => template.html.startsWith('<div class='))!;
		const root = app.ast.parts[0];
		expect(root.type).toBe('TemplateElement');
		if (root.type !== 'TemplateElement') throw new Error('expected a template element');
		expect(root.tag).toBe('div');
		// Component-body roots are destination-opaque until planJsx resolves the
		// template's parse strategy; the element IR preserves that authored context.
		expect(root.namespace).toBe('opaque');
		expect(root.synthetic).toBe(false);
		expect(root.attributes.length).toBe(2);
		expect(root.children.some((node) => node.type === 'TemplateElement')).toBe(true);

		const kinds = collectTemplatePartKinds(app.ast.parts);
		for (const kind of ['tag-open', 'tag-close', 'attribute', 'text'] as const) {
			expect(kinds.has(kind)).toBe(true);
		}

		const nested = compileInspect().find((template) =>
			template.html.startsWith('<octane-frag><i>'),
		)!;
		const wrapper = nested.ast.parts[0];
		expect(wrapper.type).toBe('TemplateElement');
		if (wrapper.type !== 'TemplateElement') throw new Error('expected a template element');
		expect(wrapper.tag).toBe('octane-frag');
		expect(wrapper.synthetic).toBe(true);
		expect(wrapper.children.filter((node) => node.type === 'TemplateElement')).toHaveLength(2);
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
						expect(gen).toBe(src === '  hello\n\t\t\tworld  ' ? '  hello world  ' : escHtml(src));
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
		expect(app.html.slice(text.start, text.end)).toBe('  hello world  ');
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

// Origins must name what the AUTHOR wrote. Two ways that can go wrong: a span
// that has its own authored spelling being reported as another one's, and a
// span the compiler synthesized being reported as authored at all.
describe.each([
	['client dev', { dev: true }],
	['client prod', { hmr: false as const }],
])('authored-origin fidelity — %s', (_label, options) => {
	const CLOSE_SOURCE = `export function App() @{
	<div class="demo">
		<button onClick={() => {}}>Increment</button>
		<style>.demo { color: red; }</style>
	</div>
}
`;

	function templatesOf(source: string): InspectTemplate[] {
		const result = compile(source, 'origins.tsrx', { ...options, inspect: true });
		expect(result.inspect).toBeDefined();
		// Origin recording never changes what ships.
		expect(compile(source, 'origins.tsrx', options).code).toBe(result.code);
		return result.inspect.templates as InspectTemplate[];
	}

	it('points a closing tag at its own name, not at the opening one', () => {
		const [template] = templatesOf(CLOSE_SOURCE);
		for (const tag of ['div', 'button']) {
			const open = template.origins.find(
				(o) => o.kind === 'tag-open' && template.html.slice(o.start, o.end) === tag,
			)!;
			const close = template.origins.find(
				(o) => o.kind === 'tag-close' && template.html.slice(o.start, o.end) === tag,
			)!;
			expect(open, tag).toBeDefined();
			expect(close, tag).toBeDefined();
			expect(CLOSE_SOURCE.slice(open.srcStart, open.srcEnd)).toBe(tag);
			expect(CLOSE_SOURCE.slice(close.srcStart, close.srcEnd)).toBe(tag);
			// The two authored spellings are distinct positions, and the closing
			// one is the name inside `</tag>`.
			expect(close.srcStart).toBeGreaterThan(open.srcStart);
			expect(CLOSE_SOURCE.slice(close.srcStart - 2, close.srcStart)).toBe('</');
		}
	});

	it('falls back to the opening name when the source spells no closing tag', () => {
		const source = `export function App() @{ <div><span /></div> }`;
		const [template] = templatesOf(source);
		const close = template.origins.find(
			(o) => o.kind === 'tag-close' && template.html.slice(o.start, o.end) === 'span',
		);
		// A self-closing element still serializes a close tag in the HTML; with
		// no authored `</span>` the opening name is the only spelling there is.
		if (close) expect(source.slice(close.srcStart, close.srcEnd)).toBe('span');
	});

	it('claims no authored range for the scoped class it injects', () => {
		const [template] = templatesOf(CLOSE_SOURCE);
		// `<button>` has no authored class, so the compiler adds one. Reporting
		// the opening tag as its origin made a hover on `onClick` resolve to it.
		expect(template.html).toContain('<button class="tsrx-');
		for (const origin of template.origins) {
			const authored = CLOSE_SOURCE.slice(origin.srcStart, origin.srcEnd);
			expect(authored, `${origin.kind} claims ${JSON.stringify(authored)}`).not.toContain(
				'onClick',
			);
		}
		// The authored `class="demo"` on <div> IS still reported, widened to the
		// merged value the compiler emits.
		const value = template.origins.find((o) => o.kind === 'attr-value')!;
		expect(value).toBeDefined();
		expect(CLOSE_SOURCE.slice(value.srcStart, value.srcEnd)).toBe('"demo"');
		expect(template.html.slice(value.start, value.end)).toMatch(/^demo tsrx-/);
	});

	it('keeps the authored NAME of a bare class while dropping the injected value', () => {
		const source = `export function App() @{
	<div class>
		<style>div { color: red; }</style>
	</div>
}
`;
		const [template] = templatesOf(source);
		const name = template.origins.find((o) => o.kind === 'attr-name');
		expect(name).toBeDefined();
		expect(source.slice(name!.srcStart, name!.srcEnd)).toBe('class');
		// The hash is the compiler's, so no attr-value origin is reported.
		expect(template.origins.some((o) => o.kind === 'attr-value')).toBe(false);
	});
});

// SSR bakes its static HTML inline (one template-literal quasi per run) rather
// than hoisting a `_t$N`, so an inspection entry is a RUN: `html` is what the
// origins index into and `raw` is the bytes the printed module contains for it,
// which is how a consumer locates the run without re-escaping anything.
describe.each([
	['server', { mode: 'server' as const }],
	['server dev', { mode: 'server' as const, dev: true }],
])('SSR static-run origins — %s', (_label, options) => {
	const SSR_SOURCE = `export default function App() @{
	<div class="demo">
		<h2 title="t">Count</h2>
		<button>Increment</button>
		<button>Add</button>
	</div>
}
`;

	function inspectServer(source = SSR_SOURCE) {
		const result = compile(source, 'origins.tsrx', { ...options, inspect: true });
		expect(result.inspect).toBeDefined();
		// Recording never changes what ships.
		expect(compile(source, 'origins.tsrx', options).code).toBe(result.code);
		return {
			code: result.code,
			templates: result.inspect.templates as (InspectTemplate & { raw: string })[],
		};
	}

	it('is absent from a normal compile', () => {
		const plain = compile(SSR_SOURCE, 'origins.tsrx', options) as { inspect?: unknown };
		expect(plain.inspect).toBeUndefined();
	});

	it('records every run verbatim in the emitted module', () => {
		const { code, templates } = inspectServer();
		expect(templates.length).toBeGreaterThan(0);
		for (const template of templates) {
			expect(typeof template.raw).toBe('string');
			expect(code, JSON.stringify(template.raw)).toContain(template.raw);
			expect(template.origins.length).toBeGreaterThan(0);
		}
	});

	it('slices every origin cleanly out of both the run and the source', () => {
		const { templates } = inspectServer();
		for (const template of templates) {
			for (const origin of template.origins) {
				expect(origin.start).toBeGreaterThanOrEqual(0);
				expect(origin.end).toBeGreaterThan(origin.start);
				expect(origin.end).toBeLessThanOrEqual(template.html.length);
				expect(origin.srcEnd).toBeGreaterThan(origin.srcStart);
				expect(SSR_SOURCE.slice(origin.srcStart, origin.srcEnd).length).toBe(
					origin.srcEnd - origin.srcStart,
				);
			}
		}
	});

	it('covers tag names, static attributes and static text', () => {
		const { templates } = inspectServer();
		const found = new Map<string, string[]>();
		for (const template of templates) {
			for (const origin of template.origins) {
				const authored = SSR_SOURCE.slice(origin.srcStart, origin.srcEnd);
				(found.get(origin.kind) ?? found.set(origin.kind, []).get(origin.kind)!).push(authored);
			}
		}
		expect(found.get('tag-open')?.sort()).toEqual(['button', 'button', 'div', 'h2']);
		expect(found.get('tag-close')?.sort()).toEqual(['button', 'button', 'div', 'h2']);
		expect(found.get('attr-name')?.sort()).toEqual(['class', 'title']);
		expect(found.get('attr-value')?.sort()).toEqual(['"demo"', '"t"']);
		expect(found.get('text')?.sort()).toEqual(['Add', 'Count', 'Increment']);
	});

	it('records the attributes the form-control writers bake themselves', () => {
		// `<select multiple>` and `<option value>` are serialized by dedicated
		// writers (they also feed the option-projection scope), NOT by the shared
		// static-attribute path. An attribute that reaches the run through its
		// own writer is still an authored span in the output.
		const source = `export default function App() @{
	<select multiple title="pick">
		<option value="a">A</option>
		<option value={2}>B</option>
	</select>
}
`;
		const { templates } = inspectServer(source);
		const named = new Map<string, string[]>();
		for (const template of templates) {
			for (const origin of template.origins) {
				const authored = source.slice(origin.srcStart, origin.srcEnd);
				(named.get(origin.kind) ?? named.set(origin.kind, []).get(origin.kind)!).push(authored);
			}
		}
		// The bare-boolean `multiple` has a name and no value; each `value` has
		// both. `title` proves the shared path still records alongside them.
		expect(named.get('attr-name')?.sort()).toEqual(['multiple', 'title', 'value', 'value']);
		expect(named.get('attr-value')?.sort()).toEqual(['"a"', '"pick"', '2']);
	});

	it('separates the two identical runs of repeated markup', () => {
		const { code, templates } = inspectServer();
		// Both `<button>` elements bake the same bytes, so the entries are only
		// told apart by their authored ranges — which is what lets a consumer
		// pair the k-th occurrence in the output with the k-th in the source.
		const buttons = templates.filter((t) => t.raw === '<button>');
		expect(buttons.length).toBe(2);
		const starts = buttons.map((t) => t.origins[0].srcStart).sort((a, b) => a - b);
		expect(starts[0]).toBeLessThan(starts[1]);
		expect(SSR_SOURCE.slice(starts[0], starts[0] + 6)).toBe('button');
		expect(SSR_SOURCE.slice(starts[1], starts[1] + 6)).toBe('button');
		// And the output really does contain it twice, so the pairing is total.
		expect(code.split('<button>').length - 1).toBe(2);
	});

	it('reports the closing tag at its own authored range', () => {
		const { templates } = inspectServer();
		const close = templates
			.flatMap((t) => t.origins)
			.find((o) => o.kind === 'tag-close' && SSR_SOURCE.slice(o.srcStart, o.srcEnd) === 'h2')!;
		expect(close).toBeDefined();
		expect(SSR_SOURCE.slice(close.srcStart - 2, close.srcStart)).toBe('</');
	});

	it('claims no authored range for the scoped class it injects', () => {
		const source = `export default function App() @{
	<div>
		<button>Go</button>
		<style>div { color: red; }</style>
	</div>
}
`;
		const { templates } = inspectServer(source);
		for (const template of templates) {
			for (const origin of template.origins) {
				expect(source.slice(origin.srcStart, origin.srcEnd)).not.toContain('<');
			}
		}
		// The hash still reaches the HTML — it is just not attributed to source.
		expect(templates.some((t) => t.html.includes('tsrx-'))).toBe(true);
	});
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { compile } from 'octane/compiler';
import * as ClientRT from '../../src/index.js';
import { hydrateRoot, flushSync } from '../../src/index.js';
import * as ServerRT from 'octane/server';

// Conformance port of facebook/react's SSR serialization matrix —
// ReactDOMServerIntegrationElements-test.js, ReactDOMServerIntegrationAttributes-test.js,
// ReactDOMServerIntegrationFragment-test.js — against octane's renderToString +
// hydrateRoot. Each React `itRenders` is simultaneously a server-OUTPUT test and a
// hydration-ADOPT test, so the ports assert both halves where feasible: the parsed
// server markup (round-tripped through innerHTML, exactly React's serverRender
// path) and a clean `hydrateRoot()` adoption (before === after, no "hydration
// mismatch" console.error).
//
// OCTANE SERIALIZATION PROTOCOL vs REACT (intentional, asserted at OUTCOME level):
//   * Adjacent STATIC text runs serialize merged into one text node (they're
//     compile-time-folded on the client too, so the merged node adopts cleanly).
//     When at least one side of a text adjacency is a DYNAMIC hole, the server
//     emits React's `<!-- -->` separator so the parser can't merge them and the
//     hydration walk adopts each hole's node.
//   * A bare renderable `{expr}` hole serializes as a `<!--[-->…<!--]-->` block
//     range (octane's hydration protocol); React emits no markers. Child-count
//     assertions therefore filter octane's protocol comments.
//   * class/className compose clsx-style at every apply site (documented project
//     divergence): `className={true}` yields `class=""` where React drops it.
//   * ssrAttr mirrors React's value-type filters where the FUNCTIONAL outcome
//     would flip (positive-numeric drop, empty-URL strip, function/symbol
//     drop, boolean-on-string-prop drop, data-* boolean stringify) — and the
//     client setAttribute applies the SAME rules (shared tables in
//     constants.ts) so hydration agrees with the serialized markup. There is
//     deliberately NO boolean-prop truthiness table (adjudicated 2026-07-04):
//     `hidden={0}` / `inert=""` serialize as written — presence means
//     platform-true, exactly like hand-authored markup.
//
// Out of scope per docs/react-parity-migration-plan.md §2 (documented, not ported):
//   * class components / factory components (Elements :631, :640, :924, :938, :964)
//   * controlled `<textarea value>` / `<select value>` semantics — only the
//     UNCONTROLLED halves are asserted (children-as-content, selected attribute).
//   * DEV warning texts (badly-cased props, unknown-tag warnings) — the functional
//     outcome (what serializes) is asserted instead.

const FILE = 'ssr-serialization.tsrx';

const SRC = `
// ---- text children (Elements :72-:282) ----
export function DivText() @{ <div>Text</div> }
export function FlankWs() @{ <div>{'  Text ' as string}</div> }
export function EmptyText() @{ <div>{''}</div> }
export function MultiEmptyText() @{ <div>{''}{''}{''}</div> }
export function MultiWs() @{ <div>{' '}{' '}{' '}</div> }
export function TextSibling() @{ <div>Text<span>More Text</span></div> }
export function NonStandardText() @{ <nonstandard>Text</nonstandard> }
export function CustomText() @{ <custom-element>Text</custom-element> }
export function LeadingBlank() @{ <div>{''}foo</div> }
export function TrailingBlank() @{ <div>foo{''}</div> }
export function TwoTextLit() @{ <div>{'foo'}{'bar'}</div> }
export function TwoTextDyn(p) @{ <div>{p.a as string}{p.b as string}</div> }
function BText() { return 'b'; }
export function TextCompText() @{ <div>{'a'}<BText />{'c'}</div> }
function Zero() { return null; }
function Why() { return [<Zero />, ['c']]; }
function Ex() { return [null, [<Why />], false]; }
export function SiblingTree() @{ <div>{[['a'], 'b']}<div><Ex />{'d'}</div>{'e'}</div> }

// ---- number / nullish children (Elements :284-:382) ----
export function Hole(p) @{ <div>{p.x}</div> }
export function NumText() @{ <div>{'foo'}{40}</div> }
function Nil() { return null; }
export function NullComp() @{ <div><Nil /></div> }
function Undef() { return undefined; }
export function UndefComp() @{ <div><Undef /></div> }
export function HoleThenFoo(p) @{ <div>{p.x}foo</div> }
export function MixedNulls() @{ <div>{false}{null}foo{null}{false}</div> }
export function OnlyNulls() @{ <div>{false}{null}{null}{false}</div> }

// ---- void elements / innerHTML / noscript / pre (Elements :470-:618) ----
export function JustImg() @{ <img /> }
export function JustButton() @{ <button /> }
export function DangerSpan(p) @{ <div><span dangerouslySetInnerHTML={{ __html: p.h }} /></div> }
export function DangerDiv(p) @{ <div dangerouslySetInnerHTML={{ __html: p.h }} /> }
export function NoscriptChildren() @{ <noscript><div>Enable JavaScript to run this app.</div></noscript> }
export function PreNl(p) @{ <pre>{p.t as string}</pre> }
export function DivNl(p) @{ <div>{p.t as string}</div> }

// ---- component hierarchies (Elements :620-:794) ----
export function Stateless() @{ <div>foo</div> }
export function Box(p) @{ <div>{p.children}</div> }
export function SingleHier() @{ <Box><Box><Box><Box /></Box></Box></Box> }
export function MultiHier() @{ <Box><Box><Box /><Box /></Box><Box><Box /><Box /></Box></Box> }
export function ParentChild() @{ <div id="parent"><div id="child" /></div> }
export function ParentChildren() @{ <div id="parent"><div id="child1" /><div id="child2" /></div> }
export function WsSeparated() @{ <div id="parent"><div id="child1" />{' '}<div id="child2" /></div> }
export function Composite() @{ <Box>{['a', 'b', [undefined], [[false, 'c']]]}</Box> }

// ---- escaping (Elements :797-:915) ----
export function EscOne() @{ <div>{"<span>Text&quot;</span>"}</div> }
export function EscTwo() @{ <div>{"<span>Text1&quot;</span>"}{"<span>Text2&quot;</span>"}</div> }

// ---- badly-typed / object children (Elements :948-:1033) ----
export function BadType(p) { const C = p.C; return <C />; }

// ---- attribute matrix (Attributes :52-:690) ----
export function WidthDiv(p) @{ <div width={p.w} /> }
export function AnchorHref(p) @{ <a href={p.v} /> }
export function ImgSrc(p) @{ <img src={p.v} /> }
export function BaseHref(p) @{ <base href={p.v} /> }
export function LinkHref(p) @{ <link rel="stylesheet" href={p.v} /> }
export function Hidden(p) @{ <div hidden={p.v} /> }
export function Download(p) @{ <a download={p.v} /> }
export function ClsName(p) @{ <div className={p.v} /> }
export function HtmlFor(p) @{ <label htmlFor={p.v} /> }
export function InputSize(p) @{ <input size={p.v} /> }
export function OlStart(p) @{ <ol start={p.v} /> }
export function RefKeyProps(p) @{ <div ref={p.r} key="foo" suppressHydrationWarning={true} /> }
export function Scew() @{ <div suppressContentEditableWarning={true} /> }
export function StyleDiv(p) @{ <div style={p.s} /> }
export function AriaLabel(p) @{ <div aria-label={p.v} /> }
export function AriaBare(p) @{ <div aria={p.v} /> }
export function DataFoo(p) @{ <div data-foobar={p.v} /> }
export function DataCased(p) @{ <div data-fooBar={p.v} /> }
export function ObjectData(p) @{ <object data={p.v} /> }
export function UnknownFoo(p) @{ <div foo={p.v} /> }
export function CasedFooBar() @{ <div fooBar="test" /> }
export function StaticOdd() @{ <div CHILDREN="5" classname="test" /> }
export function FormCharset() @{ <form acceptcharset="utf-8" /> }
export function WithOnClick(p) @{ <div onClick={p.f} /> }
export function OnUnknown(p) @{ <div onunknownevent={p.v} /> }
export function OnAttr() @{ <div on="tap:do-something" /> }
export function NonStdFoo() @{ <nonstandard foo="bar" /> }

// ---- uncontrolled form-control serialization ----
export function InputValue(p) @{ <input value={p.v} checked={p.c} /> }
export function TextareaChildren(p) @{ <textarea>{p.v as string}</textarea> }
export function OptionSelected(p) @{ <select><option selected={p.sel} value="a">{'A'}</option></select> }

// ---- custom elements (Attributes :695-:797) ----
export function CustomCls() @{ <custom-element className="test" /> }
export function CustomFor() @{ <custom-element htmlFor="test" /> }
export function CustomFoo(p) @{ <custom-element foo={p.v} /> }
export function CustomData(p) @{ <custom-element data-foo={p.v} /> }
export function CustomOn() @{ <custom-element onunknown="bar" /> }
export function IsElement(p) @{ <div is="custom-element" className="test" foo={p.foo} /> }
export function InertDiv(p) @{ <div inert={p.v} /> }

// ---- fragments (Fragment :41-:113) ----
export function FragOne() @{ <><div>text1</div></> }
function Header() @{ <p>header</p> }
function Footer() @{ <><h2>footer</h2><h3>about</h3></> }
export function FragSeveral() @{ <>
	<div>text1</div>
	<span>text2</span>
	<Header />
	<Footer />
</> }
export function FragNested() @{ <>
	<><div>text1</div></>
	<span>text2</span>
	<><><>{null}<p /></>{false}</></>
</> }
export function FragEmpty() @{ <div><></></div> }
`;

function evalMod(rt: any, opts: any): Record<string, any> {
	let { code } = compile(SRC, FILE, opts);
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane(?:\/server)?['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(rt, {});
}

const server = evalMod(ServerRT, { mode: 'server' });
// dev: true so hydration mismatch warnings fire (they are dev-only).
const client = evalMod(ClientRT, { mode: 'client', dev: true });

const ssr = (name: string, props?: any) => ServerRT.renderToString(server[name], props).html;

// React's serverRender path: parse the server markup with the DOM parser.
function parse(html: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host;
}

// Non-comment child nodes — octane's hydration protocol (`<!--[-->`/`<!--]-->`)
// lives in comments; React's child-count assertions map to the filtered list.
function realChildren(el: Element | HTMLElement): Node[] {
	return Array.from(el.childNodes).filter((n) => n.nodeType !== 8);
}

let container: HTMLElement;
let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	errSpy.mockRestore();
});
const warns = () =>
	errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

// Server-render, adopt via hydrateRoot, return before/after for the no-rebuild check.
function hydrate(name: string, props?: any) {
	const html = ssr(name, props);
	container.innerHTML = html;
	const before = container.innerHTML;
	hydrateRoot(container, client[name], props);
	flushSync(() => {});
	return { html, before, after: container.innerHTML };
}

// Expand counted post-hydration markers back to their logically equivalent
// legacy wire representation. This preserves the old byte-stability assertion
// without requiring redundant physical Comment nodes to survive adoption.
const expandCountedHydrationMarkers = (html: string) =>
	html.replace(/<!--([\[\]])([1-9]\d*)-->/g, (whole, marker: string, raw: string) => {
		const multiplicity = Number(raw);
		if (!Number.isSafeInteger(multiplicity) || multiplicity < 2) return whole;
		return `<!--${marker}-->`.repeat(multiplicity);
	});

// Assert the case hydrates as a pure adoption: logically byte-stable DOM and no
// mismatch warnings. Counted marker pairs expand to the exact server protocol.
function expectCleanHydrate(name: string, props?: any) {
	const r = hydrate(name, props);
	expect(warns()).toEqual([]);
	expect(expandCountedHydrationMarkers(r.after)).toBe(r.before);
	return r;
}

const stripComments = (html: string) => html.replace(/<!--[^>]*-->/g, '');

// CONTENT-level adoption check for octane's markerless-hole family: the server
// deliberately serializes an only-child text hole (and a component's bare-text /
// null return) WITHOUT an anchor node, so the client mints its `<!---->` anchor
// during hydration. That is by-design protocol (see ssrChildText in
// runtime.server.ts), not a rebuild — elements and text must still be identical.
function expectContentHydrate(name: string, props?: any) {
	const r = hydrate(name, props);
	expect(warns()).toEqual([]);
	expect(stripComments(r.after)).toBe(stripComments(r.before));
	return r;
}

// ===========================================================================
// ReactDOMServerIntegrationElements-test.js
// ===========================================================================

describe('conformance: SSR serialization — text children (Elements)', () => {
	it('renders a div with text (Per ReactDOMServerIntegrationElements-test.js:73)', () => {
		expect(ssr('DivText')).toBe('<div>Text</div>');
		const e = parse(ssr('DivText')).firstElementChild!;
		expect(e.childNodes.length).toBe(1);
		expect(e.firstChild!.nodeType).toBe(3);
		expectCleanHydrate('DivText');
	});

	it('renders text with flanking whitespace (Per :80)', () => {
		expect(ssr('FlankWs')).toBe('<div>  Text </div>');
		expectCleanHydrate('FlankWs');
	});

	it('renders an empty text child as no node (Per :87)', () => {
		expect(ssr('EmptyText')).toBe('<div></div>');
		expect(parse(ssr('EmptyText')).firstElementChild!.childNodes.length).toBe(0);
		expectCleanHydrate('EmptyText');
	});

	it('renders multiple empty text children as nothing (Per :92)', () => {
		expect(ssr('MultiEmptyText')).toBe('<div></div>');
	});

	it('hydrates multiple empty text children (Per :92)', () => {
		const r = hydrate('MultiEmptyText');
		expect(warns()).toEqual([]);
		expect(stripComments(r.after)).toBe(stripComments(r.before));
	});

	// Octane divergence from React's markup: React separates the three ' ' holes
	// with `<!-- -->` comments (5 child nodes); octane folds/merges the literal
	// whitespace run into one text node. The rendered TEXT is identical.
	it('renders multiple whitespace children (Per :104 — outcome level)', () => {
		expect(ssr('MultiWs')).toBe('<div>   </div>');
		expectCleanHydrate('MultiWs');
		expect(container.querySelector('div')!.textContent).toBe('   ');
	});

	it('renders text sibling to a node (Per :126)', () => {
		expect(ssr('TextSibling')).toBe('<div>Text<span>More Text</span></div>');
		const e = parse(ssr('TextSibling')).firstElementChild!;
		expect(e.childNodes.length).toBe(2);
		expect(e.childNodes[0].nodeValue).toBe('Text');
		expect((e.childNodes[1] as Element).tagName).toBe('SPAN');
		expectCleanHydrate('TextSibling');
	});

	// React's warning half ("<nonstandard> is unrecognized") is a DEV warning —
	// out of scope; the serialization outcome is what's asserted.
	it('renders a non-standard element with text (Per :140)', () => {
		expect(ssr('NonStandardText')).toBe('<nonstandard>Text</nonstandard>');
		expectCleanHydrate('NonStandardText');
	});

	it('renders a custom element with text (Per :163)', () => {
		expect(ssr('CustomText')).toBe('<custom-element>Text</custom-element>');
		const e = parse(ssr('CustomText')).firstElementChild!;
		expect(e.tagName).toBe('CUSTOM-ELEMENT');
		expect(e.childNodes.length).toBe(1);
		expectCleanHydrate('CustomText');
	});

	it('renders a leading blank child with a text sibling (Per :170)', () => {
		expect(ssr('LeadingBlank')).toBe('<div>foo</div>');
		expectCleanHydrate('LeadingBlank');
		expect(container.querySelector('div')!.textContent).toBe('foo');
	});

	it('renders a trailing blank child with a text sibling (Per :176)', () => {
		expect(ssr('TrailingBlank')).toBe('<div>foo</div>');
		expectCleanHydrate('TrailingBlank');
		expect(container.querySelector('div')!.textContent).toBe('foo');
	});

	// Adjacent LITERAL text holes are compile-time-folded into the template on
	// the client, so the server's merged 'foobar' text node adopts cleanly.
	it('renders an element with two literal text children (Per :182)', () => {
		expect(ssr('TwoTextLit')).toBe('<div>foobar</div>');
		expectCleanHydrate('TwoTextLit');
		expect(container.querySelector('div')!.textContent).toBe('foobar');
	});

	// The server separates adjacent dynamic text holes with a `<!-- -->` comment
	// (React's convention) so the parser can't merge them into one node; the
	// client's hole-aware sibling() walk steps across it.
	it('hydrates adjacent dynamic text holes without a mismatch (Per :182)', () => {
		const r = hydrate('TwoTextDyn', { a: 'foo', b: 'bar' });
		expect(warns()).toEqual([]);
		expect(r.after).toBe(r.before);
		expect(container.querySelector('div')!.textContent).toBe('foobar');
	});

	it('renders a component returning text between two text nodes (Per :205)', () => {
		expect(ssr('TextCompText')).toBe('<div>a<!--[-->b<!--]-->c</div>');
		const e = parse(ssr('TextCompText')).firstElementChild!;
		expect(e.textContent).toBe('abc');
		// Content-level: the adopted bare-text component mints its update anchor.
		expectContentHydrate('TextCompText');
		expect(container.querySelector('div')!.textContent).toBe('abc');
	});

	it('renders a tree with sibling host and text nodes (Per :235)', () => {
		const e = parse(ssr('SiblingTree')).firstElementChild!;
		// [['a'],'b'] flatten + nested null/false components + 'c' + 'd' + 'e'.
		expect(e.textContent).toBe('abcde');
		expect(e.querySelector('div')!.textContent).toBe('cd');
	});

	// The client de-opt list flattens nested-array members one-item-per-leaf
	// (matching the server's ssrChildItem emission), so hydration adopts the
	// per-leaf `<!--[-->…<!--]-->` ranges 1:1.
	it('hydrates a nested-array component return cleanly (Per :235)', () => {
		const r = hydrate('SiblingTree');
		expect(warns()).toEqual([]);
		expect(stripComments(r.after)).toBe(stripComments(r.before));
	});
});

describe('conformance: SSR serialization — number children (Elements)', () => {
	it('renders a number as single child (Per :285)', () => {
		expect(parse(ssr('Hole', { x: 3 })).firstElementChild!.textContent).toBe('3');
		expectCleanHydrate('Hole', { x: 3 });
	});

	it('renders zero as single child (Per :291)', () => {
		expect(parse(ssr('Hole', { x: 0 })).firstElementChild!.textContent).toBe('0');
		expectCleanHydrate('Hole', { x: 0 });
	});

	it('renders an element with number and text children (Per :296)', () => {
		const e = parse(ssr('NumText')).firstElementChild!;
		expect(e.textContent).toBe('foo40');
		expectCleanHydrate('NumText');
	});
});

describe('conformance: SSR serialization — null, false, undefined children (Elements)', () => {
	for (const [label, x] of [
		['null', null],
		['false', false],
		['undefined', undefined],
	] as const) {
		it(`renders ${label} single child as blank (Per :322/:327/:332)`, () => {
			const e = parse(ssr('Hole', { x }));
			expect(realChildren(e.firstElementChild!).length).toBe(0);
			expect(e.firstElementChild!.textContent).toBe('');
			expectContentHydrate('Hole', { x });
		});
	}

	it('renders a null-returning component child as empty (Per :337)', () => {
		const e = parse(ssr('NullComp')).firstElementChild!;
		expect(realChildren(e).length).toBe(0);
		expectContentHydrate('NullComp');
	});

	it('renders an undefined-returning component child as empty (Per :933)', () => {
		const e = parse(ssr('UndefComp')).firstElementChild!;
		expect(realChildren(e).length).toBe(0);
		expectContentHydrate('UndefComp');
	});

	it('renders null children as blank (Per :347)', () => {
		const e = parse(ssr('HoleThenFoo', { x: null })).firstElementChild!;
		expect(e.textContent).toBe('foo');
		expectCleanHydrate('HoleThenFoo', { x: null });
	});

	it('renders false children as blank (Per :353)', () => {
		const e = parse(ssr('HoleThenFoo', { x: false })).firstElementChild!;
		expect(e.textContent).toBe('foo');
		expectCleanHydrate('HoleThenFoo', { x: false });
	});

	it('renders null and false children together as blank (Per :359)', () => {
		const e = parse(ssr('MixedNulls')).firstElementChild!;
		const real = realChildren(e);
		expect(real.length).toBe(1);
		expect(real[0].nodeValue).toBe('foo');
		expectCleanHydrate('MixedNulls');
	});

	it('renders only null and false children as blank (Per :371)', () => {
		const e = parse(ssr('OnlyNulls')).firstElementChild!;
		expect(realChildren(e).length).toBe(0);
		expect(e.textContent).toBe('');
		expectCleanHydrate('OnlyNulls');
	});
});

describe('conformance: SSR serialization — void elements + dangerouslySetInnerHTML (Elements)', () => {
	it('renders an img (Per :470)', () => {
		expect(ssr('JustImg')).toBe('<img/>');
		const e = parse(ssr('JustImg')).firstElementChild!;
		expect(e.tagName).toBe('IMG');
		expect(e.childNodes.length).toBe(0);
		expectCleanHydrate('JustImg');
	});

	it('renders a button (Per :477)', () => {
		expect(ssr('JustButton')).toBe('<button></button>');
		expectCleanHydrate('JustButton');
	});

	it('renders dangerouslySetInnerHTML number (Per :484)', () => {
		const e = parse(ssr('DangerSpan', { h: 0 })).querySelector('span')!;
		expect(e.childNodes.length).toBe(1);
		expect(e.textContent).toBe('0');
	});

	it('renders dangerouslySetInnerHTML boolean (Per :500)', () => {
		const e = parse(ssr('DangerSpan', { h: false })).querySelector('span')!;
		expect(e.textContent).toBe('false');
	});

	it('renders dangerouslySetInnerHTML text string (Per :516)', () => {
		const e = parse(ssr('DangerSpan', { h: 'hello' })).querySelector('span')!;
		expect(e.textContent).toBe('hello');
		expectCleanHydrate('DangerSpan', { h: 'hello' });
	});

	it('renders dangerouslySetInnerHTML element string (Per :535)', () => {
		const e = parse(ssr('DangerDiv', { h: "<span id='child'/>" })).firstElementChild!;
		expect(e.childNodes.length).toBe(1);
		expect((e.firstChild as Element).tagName).toBe('SPAN');
		expect((e.firstChild as Element).getAttribute('id')).toBe('child');
	});

	it('renders dangerouslySetInnerHTML object with toString (Per :548)', () => {
		const obj = { toString: () => "<span id='child'/>" };
		const e = parse(ssr('DangerDiv', { h: obj })).firstElementChild!;
		expect((e.firstChild as Element).tagName).toBe('SPAN');
	});

	it('renders dangerouslySetInnerHTML null/undefined as empty (Per :561/:571)', () => {
		expect(parse(ssr('DangerDiv', { h: null })).firstElementChild!.childNodes.length).toBe(0);
		expect(parse(ssr('DangerDiv', { h: undefined })).firstElementChild!.childNodes.length).toBe(0);
	});

	// Octane divergence: React SSR escapes noscript children into a TEXT payload
	// (scripting-enabled browsers treat <noscript> content as raw text); octane
	// serializes real elements. Both display the content when JS is off — the
	// functional outcome. Server-output half only (React's clientCleanRender half
	// diverges in React itself).
	it('renders a noscript with children (Per :581 — outcome level)', () => {
		expect(ssr('NoscriptChildren')).toBe(
			'<noscript><div>Enable JavaScript to run this app.</div></noscript>',
		);
	});
});

describe('conformance: SSR serialization — newline-eating elements (Elements)', () => {
	it('renders pre content not starting with \\n (Per :600)', () => {
		expect(parse(ssr('PreNl', { t: 'Hello' })).querySelector('pre')!.textContent).toBe('Hello');
		expectCleanHydrate('PreNl', { t: 'Hello' });
	});

	// The HTML parser eats a newline immediately after <pre> (and <textarea>/
	// <listing>); the serializer protects it by emitting an EXTRA leading \n
	// (ssrTextPre / the compiler's static first-child guard), React-style.
	it('renders pre content starting with \\n (Per :607)', () => {
		const e = parse(ssr('PreNl', { t: '\nHello' })).querySelector('pre')!;
		expect(e.textContent).toBe('\nHello');
	});

	it('renders a normal tag with content starting with \\n (Per :614)', () => {
		const e = parse(ssr('DivNl', { t: '\nHello' })).querySelector('div')!;
		expect(e.textContent).toBe('\nHello');
		expectCleanHydrate('DivNl', { t: '\nHello' });
	});
});

describe('conformance: SSR serialization — component hierarchies (Elements)', () => {
	it('renders stateless components (Per :626)', () => {
		expect(ssr('Stateless')).toBe('<div>foo</div>');
		expectCleanHydrate('Stateless');
	});

	it('renders single-child hierarchies of components (Per :657)', () => {
		let e = parse(ssr('SingleHier')).querySelector('div')!;
		for (let i = 0; i < 3; i++) {
			expect(e.tagName).toBe('DIV');
			const inner = realChildren(e).filter((n) => n.nodeType === 1);
			expect(inner.length).toBe(1);
			e = inner[0] as HTMLElement;
		}
		expect(e.tagName).toBe('DIV');
		expect(e.querySelectorAll('div').length).toBe(0);
		expectCleanHydrate('SingleHier');
	});

	// Nested `{children}` component chains hydrate protocol-stably: the server emits
	// one `<!--[-->…<!--]-->` range per layer (children-fn block AND nested
	// component block), the client childSlot/componentSlot/componentSlotLite each
	// adopt their own range, and every slot advances the hydration cursor past
	// its adopted close marker so SIBLING slots (MultiHier) adopt the right range.
	// Exactly-coextensive pairs may then share a counted physical pair.
	it('hydrates component hierarchies with logical protocol stability (Per :657/:677)', () => {
		const one = hydrate('SingleHier');
		expect(expandCountedHydrationMarkers(one.after)).toBe(one.before);
		const multi = hydrate('MultiHier');
		expect(expandCountedHydrationMarkers(multi.after)).toBe(multi.before);
	});

	it('renders multi-child hierarchies of components (Per :677)', () => {
		const root = parse(ssr('MultiHier')).querySelector('div')!;
		const level1 = Array.from(root.children);
		expect(level1.length).toBe(2);
		for (const child of level1) {
			expect(child.tagName).toBe('DIV');
			const level2 = Array.from(child.children);
			expect(level2.length).toBe(2);
			for (const grandchild of level2) {
				expect(grandchild.tagName).toBe('DIV');
				expect(grandchild.children.length).toBe(0);
			}
		}
		expectCleanHydrate('MultiHier');
	});

	it('renders a div with a child (Per :705)', () => {
		expect(ssr('ParentChild')).toBe('<div id="parent"><div id="child"></div></div>');
		expectCleanHydrate('ParentChild');
	});

	it('renders a div with multiple children (Per :717)', () => {
		expect(ssr('ParentChildren')).toBe(
			'<div id="parent"><div id="child1"></div><div id="child2"></div></div>',
		);
		expectCleanHydrate('ParentChildren');
	});

	it('renders multiple children separated by whitespace (Per :732)', () => {
		const e = parse(ssr('WsSeparated')).firstElementChild!;
		expect(e.childNodes.length).toBe(3);
		expect((e.childNodes[0] as Element).id).toBe('child1');
		expect(e.childNodes[1].nodeValue).toBe(' ');
		expect((e.childNodes[2] as Element).id).toBe('child2');
		expectCleanHydrate('WsSeparated');
	});

	it('renders a composite with multiple (nested-array) children (Per :770)', () => {
		const e = parse(ssr('Composite')).querySelector('div')!;
		expect(e.textContent).toBe('abc');
		expectCleanHydrate('Composite');
	});
});

describe('conformance: SSR serialization — escaping >, <, and & (Elements)', () => {
	it('escapes >, <, and & as single child (Per :798)', () => {
		const html = ssr('EscOne');
		expect(html).toContain('&lt;span&gt;');
		expect(html).not.toContain('<span>');
		const e = parse(html).firstElementChild!;
		expect(e.childNodes.length).toBe(1);
		expect(e.firstChild!.nodeValue).toBe('<span>Text&quot;</span>');
		expectCleanHydrate('EscOne');
	});

	it('escapes >, <, and & as multiple children (Per :804 — outcome level)', () => {
		// Octane merges the adjacent literal runs (no `<!-- -->` separator); the
		// decoded text is what React asserts per node.
		const e = parse(ssr('EscTwo')).firstElementChild!;
		expect(e.textContent).toBe('<span>Text1&quot;</span><span>Text2&quot;</span>');
		expectCleanHydrate('EscTwo');
	});
});

describe('conformance: SSR serialization — carriage return / null character (Elements)', () => {
	it('parses CR/CRLF text to LF from server markup (Per :834)', () => {
		const e = parse(ssr('DivNl', { t: 'foo\rbar\r\nbaz\nqux' })).querySelector('div')!;
		// HTML parsing normalizes CR and CRLF to LF.
		expect(e.textContent).toBe('foo\nbar\nbaz\nqux');
	});

	// A client value differing from the adopted server text ONLY by parser
	// CR/CRLF→LF normalization is not a mismatch (React parity) — the hydration
	// text compare normalizes before warning/patching.
	it('does not report a mismatch for CR/CRLF-normalized text (Per :834)', () => {
		hydrate('DivNl', { t: 'foo\rbar\r\nbaz\nqux' });
		expect(warns()).toEqual([]);
	});
});

describe('conformance: SSR serialization — badly-typed children (Elements)', () => {
	// A plain (non-descriptor) object child throws, like React's 'Objects are
	// not valid as a React child' — serializing it would put '[object Object]'
	// into the markup.
	it('throws for a plain-object child (Per :948)', () => {
		expect(() => ssr('Hole', { x: { x: 123 } })).toThrow();
	});

	it('throws when rendering a null/undefined component type (Per :1008/:1019)', () => {
		expect(() => ssr('BadType', { C: null })).toThrow();
		expect(() => ssr('BadType', { C: undefined })).toThrow();
	});
});

// ===========================================================================
// ReactDOMServerIntegrationAttributes-test.js
// ===========================================================================

describe('conformance: SSR serialization — string properties (Attributes)', () => {
	it('renders simple numbers and strings (Per ReactDOMServerIntegrationAttributes-test.js:54/:59)', () => {
		expect(ssr('WidthDiv', { w: 30 })).toBe('<div width="30"></div>');
		expect(ssr('WidthDiv', { w: '30' })).toBe('<div width="30"></div>');
		expectCleanHydrate('WidthDiv', { w: 30 });
	});

	it('keeps empty href on anchor (Per :69)', () => {
		expect(
			parse(ssr('AnchorHref', { v: '' }))
				.querySelector('a')!
				.getAttribute('href'),
		).toBe('');
	});

	// An empty url on <img src>, <base href>, <link href> strips (the browser
	// would fetch the page itself) — mirrors the client setAttribute policy;
	// <a href=""> stays (a legitimate link to this page).
	it('strips empty src/href on img/base/link (Per :64/:74/:89)', () => {
		expect(
			parse(ssr('ImgSrc', { v: '' }))
				.querySelector('img')!
				.getAttribute('src'),
		).toBe(null);
		expect(
			parse(ssr('BaseHref', { v: '' }))
				.querySelector('base')!
				.getAttribute('href'),
		).toBe(null);
		expect(
			parse(ssr('LinkHref', { v: '' }))
				.querySelector('link')!
				.getAttribute('href'),
		).toBe(null);
	});

	// A boolean on a string-typed prop (href={true}) drops — a bare href would
	// be a present empty-URL link (React's value-type filter).
	it('drops a string prop with true value (Per :94)', () => {
		expect(
			parse(ssr('AnchorHref', { v: true }))
				.querySelector('a')!
				.hasAttribute('href'),
		).toBe(false);
	});

	it('drops a string prop with false/null value (Per :99/:104)', () => {
		expect(
			parse(ssr('AnchorHref', { v: false }))
				.querySelector('a')!
				.hasAttribute('href'),
		).toBe(false);
		expect(
			parse(ssr('WidthDiv', { w: null }))
				.querySelector('div')!
				.hasAttribute('width'),
		).toBe(false);
	});

	// Function- and symbol-valued attributes drop entirely (client setAttribute
	// parity) — stringifying a function would leak source into the markup.
	it('drops string props with function/symbol values (Per :109/:114)', () => {
		expect(
			parse(ssr('WidthDiv', { w: function () {} }))
				.querySelector('div')!
				.hasAttribute('width'),
		).toBe(false);
		expect(
			parse(ssr('WidthDiv', { w: Symbol('foo') }))
				.querySelector('div')!
				.hasAttribute('width'),
		).toBe(false);
	});
});

describe('conformance: SSR serialization — boolean properties (Attributes)', () => {
	it('renders boolean prop with true value (Per :121)', () => {
		const e = parse(ssr('Hidden', { v: true })).querySelector('div')!;
		expect(e.getAttribute('hidden')).toBe('');
		expectCleanHydrate('Hidden', { v: true });
	});

	it('drops boolean prop with false/null value (Per :126/:174)', () => {
		expect(
			parse(ssr('Hidden', { v: false }))
				.querySelector('div')!
				.hasAttribute('hidden'),
		).toBe(false);
		expect(
			parse(ssr('Hidden', { v: null }))
				.querySelector('div')!
				.hasAttribute('hidden'),
		).toBe(false);
		expectCleanHydrate('Hidden', { v: false });
	});

	// React normalizes truthy non-boolean values on boolean props to the
	// canonical `hidden=""`. Matched since 2026-07-08 (the shared boolean-attr
	// table in constants.ts — reverses the 2026-07-04 value-as-written
	// adjudication). Per :131/:145/:151/:157/:163.
	it('normalizes truthy non-boolean values on boolean props to "" (Per :131-:166)', () => {
		for (const v of ['hidden', 'foo', ['foo', 'bar'], { foo: 'bar' }, 10]) {
			expect(parse(ssr('Hidden', { v })).querySelector('div')!.getAttribute('hidden')).toBe('');
		}
	});

	// React drops FALSY non-boolean values on boolean props (hidden={0},
	// hidden=""). Matched since 2026-07-08 (reverses the 2026-07-04 native-write
	// adjudication) — the value's JS truthiness decides presence, like React.
	it('drops falsy non-boolean values on boolean props (Per :139/:169)', () => {
		expect(
			parse(ssr('Hidden', { v: 0 }))
				.querySelector('div')!
				.hasAttribute('hidden'),
		).toBe(false);
		expect(
			parse(ssr('Hidden', { v: '' }))
				.querySelector('div')!
				.hasAttribute('hidden'),
		).toBe(false);
	});

	// Function/symbol family (see string properties above).
	it('drops boolean props with function/symbol values (Per :179/:184)', () => {
		expect(
			parse(ssr('Hidden', { v: function () {} }))
				.querySelector('div')!
				.hasAttribute('hidden'),
		).toBe(false);
		expect(
			parse(ssr('Hidden', { v: Symbol('foo') }))
				.querySelector('div')!
				.hasAttribute('hidden'),
		).toBe(false);
	});
});

describe('conformance: SSR serialization — download (overloaded boolean) (Attributes)', () => {
	it('serializes the download matrix (Per :191-:229)', () => {
		const dl = (v: any) =>
			parse(ssr('Download', { v })).querySelector('a')!.getAttribute('download');
		expect(dl(true)).toBe(''); // :191
		expect(dl(false)).toBe(null); // :196
		expect(dl('myfile')).toBe('myfile'); // :201
		expect(dl('false')).toBe('false'); // :206
		expect(dl('true')).toBe('true'); // :211
		expect(dl(0)).toBe('0'); // :216
		expect(dl(null)).toBe(null); // :221
		expect(dl(undefined)).toBe(null); // :226
		expectCleanHydrate('Download', { v: 'myfile' });
	});
});

describe('conformance: SSR serialization — className / htmlFor (Attributes)', () => {
	it('serializes className strings (Per :243/:248/:263)', () => {
		expect(ssr('ClsName', { v: 'myClassName' })).toBe('<div class="myClassName"></div>');
		expect(ssr('ClsName', { v: '' })).toBe('<div class=""></div>');
		expect(
			parse(ssr('ClsName', { v: null }))
				.querySelector('div')!
				.hasAttribute('class'),
		).toBe(false);
		expectCleanHydrate('ClsName', { v: 'myClassName' });
	});

	// Documented octane divergence: class/className compose clsx-style at every
	// apply site. `className={false}` drops (like React); `className={true}` is
	// truthy-but-empty and composes to class="" where React drops the attribute
	// (React: :253/:258 expect no class attribute for both).
	it('clsx-composes boolean className (documented divergence, Per :253/:258)', () => {
		expect(
			parse(ssr('ClsName', { v: true }))
				.querySelector('div')!
				.getAttribute('class'),
		).toBe('');
		expect(
			parse(ssr('ClsName', { v: false }))
				.querySelector('div')!
				.hasAttribute('class'),
		).toBe(false);
	});

	it('serializes htmlFor as for (Per :292/:303)', () => {
		expect(ssr('HtmlFor', { v: 'myFor' })).toBe('<label for="myFor"></label>');
		expect(ssr('HtmlFor', { v: '' })).toBe('<label for=""></label>');
		expect(
			parse(ssr('HtmlFor', { v: null }))
				.querySelector('label')!
				.hasAttribute('for'),
		).toBe(false);
		expectCleanHydrate('HtmlFor', { v: 'myFor' });
	});

	// Boolean values on htmlFor drop (value-type filter family).
	it('drops htmlFor with true value (Per :308)', () => {
		expect(
			parse(ssr('HtmlFor', { v: true }))
				.querySelector('label')!
				.hasAttribute('for'),
		).toBe(false);
	});
});

describe('conformance: SSR serialization — numeric properties (Attributes)', () => {
	it('renders positive numeric property (Per :325) and zero on plain numeric (Per :333)', () => {
		expect(
			parse(ssr('InputSize', { v: 2 }))
				.querySelector('input')!
				.getAttribute('size'),
		).toBe('2');
		expect(
			parse(ssr('OlStart', { v: 0 }))
				.querySelector('ol')!
				.getAttribute('start'),
		).toBe('0');
		expectCleanHydrate('InputSize', { v: 2 });
	});

	// `size` is a POSITIVE-numeric prop — zero drops (size="0" is invalid per
	// the HTML spec: size must be > 0).
	it('drops positive numeric property with zero value (Per :338)', () => {
		expect(
			parse(ssr('InputSize', { v: 0 }))
				.querySelector('input')!
				.hasAttribute('size'),
		).toBe(false);
	});
});

describe('conformance: SSR serialization — props with special meaning (Attributes)', () => {
	it('serializes no ref/key/suppressHydrationWarning attributes (Per :371/:386/:403)', () => {
		const e = parse(ssr('RefKeyProps', { r: () => {} })).querySelector('div')!;
		expect(e.attributes.length).toBe(0);
		expectCleanHydrate('RefKeyProps', { r: () => {} });
	});

	it('serializes no children attribute (Per :381)', () => {
		const e = parse(ssr('Box', { children: 'foo' })).querySelector('div')!;
		expect(e.getAttribute('children')).toBe(null);
		expect(e.textContent).toBe('foo');
	});

	it('serializes no dangerouslySetInnerHTML attribute (Per :391)', () => {
		const e = parse(ssr('DangerDiv', { h: '<foo />' })).querySelector('div')!;
		expect(e.getAttribute('dangerouslySetInnerHTML')).toBe(null);
		expect(e.getAttribute('dangerouslysetinnerhtml')).toBe(null);
	});

	// suppressContentEditableWarning is a React-only hint — never serializes
	// (compiler skip-list + ssrAttr, mirroring the client setAttribute skip).
	it('serializes no suppressContentEditableWarning attribute (Per :398)', () => {
		const e = parse(ssr('Scew')).querySelector('div')!;
		expect(e.attributes.length).toBe(0);
	});
});

describe('conformance: SSR serialization — inline styles (Attributes)', () => {
	const style = (s: any) => parse(ssr('StyleDiv', { s })).querySelector('div')! as HTMLElement;

	it('renders simple styles (Per :410)', () => {
		const e = style({ color: 'red', width: '30px' });
		expect(e.style.color).toBe('red');
		expect(e.style.width).toBe('30px');
	});

	it('appends px to relevant styles (Per :416)', () => {
		const e = style({ left: 0, margin: 16, opacity: 0.5, padding: '4px' });
		expect(e.style.left).toBe('0px');
		expect(e.style.margin).toBe('16px');
		expect(e.style.opacity).toBe('0.5');
		expect(e.style.padding).toBe('4px');
	});

	it('renders custom properties (Per :433/:438)', () => {
		expect(style({ '--foo': 5 }).style.getPropertyValue('--foo')).toBe('5');
		expect(style({ '--someColor': '#000000' }).style.getPropertyValue('--someColor')).toBe(
			'#000000',
		);
	});

	it('skips undefined and null styles (Per :443/:451)', () => {
		const e = style({ color: undefined, width: '30px' });
		expect(e.style.color).toBe('');
		expect(e.style.width).toBe('30px');
		const e2 = style({ color: null, width: '30px' });
		expect(e2.style.color).toBe('');
		expect(e2.style.width).toBe('30px');
	});

	it('omits the style attribute when all values are empty (Per :457)', () => {
		expect(style({ color: null, width: null }).hasAttribute('style')).toBe(false);
	});

	it('keeps unitless-number rules unitless (Per :464)', () => {
		const html = ssr('StyleDiv', { s: { lineClamp: 10 } });
		expect(html).toContain('line-clamp:10');
		expect(html).not.toContain('10px');
	});
});

describe('conformance: SSR serialization — aria + unknown attributes (Attributes)', () => {
	it('serializes aria-label strings and enumerated booleans (Per :507/:513/:518)', () => {
		expect(ssr('AriaLabel', { v: 'hello' })).toBe('<div aria-label="hello"></div>');
		expect(ssr('AriaLabel', { v: false })).toBe('<div aria-label="false"></div>');
		expect(
			parse(ssr('AriaLabel', { v: null }))
				.querySelector('div')!
				.hasAttribute('aria-label'),
		).toBe(false);
		expectCleanHydrate('AriaLabel', { v: 'hello' });
	});

	it('serializes a bare "aria" attribute (Per :523 — warning half N/A)', () => {
		expect(
			parse(ssr('AriaBare', { v: 'hello' }))
				.querySelector('div')!
				.getAttribute('aria'),
		).toBe('hello');
	});

	it('serializes unknown attributes (Per :589/:594/:604/:610)', () => {
		expect(
			parse(ssr('UnknownFoo', { v: 'bar' }))
				.querySelector('div')!
				.getAttribute('foo'),
		).toBe('bar');
		expect(
			parse(ssr('DataFoo', { v: 'bar' }))
				.querySelector('div')!
				.getAttribute('data-foobar'),
		).toBe('bar');
		expect(
			parse(ssr('ObjectData', { v: 'hello' }))
				.querySelector('object')!
				.getAttribute('data'),
		).toBe('hello');
		expect(
			parse(ssr('DataFoo', { v: null }))
				.querySelector('div')!
				.hasAttribute('data-foobar'),
		).toBe(false);
		expectCleanHydrate('UnknownFoo', { v: 'bar' });
	});

	it('serializes badly-cased / cased attributes verbatim (Per :599/:615/:669 — outcome level)', () => {
		// The HTML parser lowercases attribute names, so pass-through serialization
		// reaches React's asserted outcome without an alias table.
		const odd = parse(ssr('StaticOdd')).querySelector('div')!;
		expect(odd.getAttribute('children')).toBe('5'); // CHILDREN="5" per :599
		expect(odd.getAttribute('classname')).toBe('test'); // per Attributes :268
		expect(odd.hasAttribute('class')).toBe(false);
		const cased = parse(ssr('CasedFooBar')).querySelector('div')!;
		expect(cased.getAttribute('foobar')).toBe('test'); // per :669
		const form = parse(ssr('FormCharset')).querySelector('form')!;
		expect(form.getAttribute('acceptcharset')).toBe('utf-8'); // per :531
		expect(form.hasAttribute('accept-charset')).toBe(false);
	});

	// data-* attributes stringify booleans (data-foobar={true} → "true") — a
	// dataset consumer reads the string value.
	it('stringifies booleans on data- attributes (Per :620/:625)', () => {
		expect(
			parse(ssr('DataFoo', { v: true }))
				.querySelector('div')!
				.getAttribute('data-foobar'),
		).toBe('true');
		expect(
			parse(ssr('DataFoo', { v: false }))
				.querySelector('div')!
				.getAttribute('data-foobar'),
		).toBe('false');
	});

	it('serializes custom attributes for non-standard elements (Per :638)', () => {
		expect(parse(ssr('NonStdFoo')).firstElementChild!.getAttribute('foo')).toBe('bar');
	});
});

describe('conformance: SSR serialization — events (Attributes)', () => {
	it('serializes no HTML events (Per :675)', () => {
		const e = parse(ssr('WithOnClick', { f: () => {} })).querySelector('div')!;
		expect(e.attributes.length).toBe(0);
	});

	// Unknown lowercase on* attributes drop on standard elements (injection
	// surface, not an attribute); custom elements and the bare `on` attr pass.
	it('serializes no unknown events (Per :682)', () => {
		const e = parse(ssr('OnUnknown', { v: 'alert("hack")' })).querySelector('div')!;
		expect(e.getAttribute('onunknownevent')).toBe(null);
	});

	it('serializes a custom attribute named "on" (Per :687)', () => {
		expect(parse(ssr('OnAttr')).querySelector('div')!.getAttribute('on')).toBe('tap:do-something');
	});
});

describe('conformance: SSR serialization — uncontrolled form controls', () => {
	// Octane's uncontrolled contract (documented divergence): `value`/`checked`
	// are plain attributes. The SERIALIZED half matches React's initial markup
	// for an uncontrolled input; the controlled re-assertion half is out of scope.
	it('serializes input value/checked as plain attributes (uncontrolled halves)', () => {
		expect(ssr('InputValue', { v: 'v', c: true })).toBe('<input value="v" checked/>');
		expect(ssr('InputValue', { v: '', c: false })).toBe('<input value=""/>');
		expectCleanHydrate('InputValue', { v: 'v', c: true });
		const input = container.querySelector('input') as HTMLInputElement;
		expect(input.value).toBe('v');
		expect(input.checked).toBe(true);
	});

	// React maps <textarea value/defaultValue> into children server-side; the
	// UNCONTROLLED octane form is children-as-content directly, which serializes
	// to the same markup (Per ReactDOMServerIntegrationTextarea-test.js —
	// controlled halves out of scope per §2).
	it('serializes textarea children as content (uncontrolled half)', () => {
		expect(ssr('TextareaChildren', { v: 'hello' })).toBe('<textarea>hello</textarea>');
		const e = parse(ssr('TextareaChildren', { v: 'hello' })).querySelector('textarea')!;
		expect(e.value).toBe('hello');
		expectCleanHydrate('TextareaChildren', { v: 'hello' });
	});

	// React derives `selected` from <select value>; the UNCONTROLLED octane form
	// is the native selected attribute on the option (controlled halves out of
	// scope per §2). (Per ReactDOMServerIntegrationSelect-test.js — outcome.)
	it('serializes option selected as a native boolean attribute (uncontrolled half)', () => {
		const on = parse(ssr('OptionSelected', { sel: true })).querySelector('option')!;
		expect(on.hasAttribute('selected')).toBe(true);
		const off = parse(ssr('OptionSelected', { sel: false })).querySelector('option')!;
		expect(off.hasAttribute('selected')).toBe(false);
		expectCleanHydrate('OptionSelected', { sel: true });
	});
});

describe('conformance: SSR serialization — custom elements (Attributes)', () => {
	it('serializes className as class on custom elements (Per :707)', () => {
		const e = parse(ssr('CustomCls')).firstElementChild!;
		expect(e.getAttribute('className')).toBe(null);
		expect(e.getAttribute('class')).toBe('test');
	});

	// Custom elements get htmlFor VERBATIM (raw props, no `for` alias) —
	// className→class still applies.
	it('keeps htmlFor verbatim on custom elements (Per :719)', () => {
		const e = parse(ssr('CustomFor')).firstElementChild!;
		expect(e.getAttribute('htmlfor')).toBe('test');
		expect(e.getAttribute('for')).toBe(null);
	});

	it('serializes unknown + on* attributes for custom elements (Per :731/:736)', () => {
		expect(parse(ssr('CustomFoo', { v: 'bar' })).firstElementChild!.getAttribute('foo')).toBe(
			'bar',
		);
		expect(parse(ssr('CustomOn')).firstElementChild!.getAttribute('onunknown')).toBe('bar');
	});

	// data-* booleans stringify on custom elements too (same as standard
	// elements — the client setAttribute writes the identical string, so
	// hydration adopts cleanly).
	it('stringifies data-* booleans on custom elements', () => {
		expect(parse(ssr('CustomData', { v: true })).firstElementChild!.getAttribute('data-foo')).toBe(
			'true',
		);
		expect(parse(ssr('CustomData', { v: false })).firstElementChild!.getAttribute('data-foo')).toBe(
			'false',
		);
		expectCleanHydrate('CustomData', { v: true });
		expectCleanHydrate('CustomData', { v: false });
	});

	it('serializes unknown boolean attributes on custom elements (Per :741/:746/:774)', () => {
		expect(parse(ssr('CustomFoo', { v: true })).firstElementChild!.getAttribute('foo')).toBe('');
		expect(parse(ssr('CustomFoo', { v: false })).firstElementChild!.hasAttribute('foo')).toBe(
			false,
		);
		expect(parse(ssr('CustomFoo', { v: null })).firstElementChild!.hasAttribute('foo')).toBe(false);
	});

	it('serializes the new boolean inert (Per :751/:768)', () => {
		expect(
			parse(ssr('InertDiv', { v: true }))
				.querySelector('div')!
				.getAttribute('inert'),
		).toBe('');
		expect(
			parse(ssr('InertDiv', { v: false }))
				.querySelector('div')!
				.hasAttribute('inert'),
		).toBe(false);
	});

	// React 19 treats inert="" as false and drops it. Matched since 2026-07-08
	// (`inert` sits in the shared boolean-attr table — mirrors the client half
	// in dom-attributes.test.ts; reverses the 2026-07-04 adjudication).
	it('drops inert="" (boolean-prop coercion — Per :757)', () => {
		expect(
			parse(ssr('InertDiv', { v: '' }))
				.querySelector('div')!
				.hasAttribute('inert'),
		).toBe(false);
	});

	it('serializes attributes on is="custom-element" hosts (Per :701/:782)', () => {
		const e = parse(ssr('IsElement', { foo: 'bar' })).querySelector('div')!;
		expect(e.getAttribute('is')).toBe('custom-element');
		expect(e.getAttribute('class')).toBe('test');
		expect(e.getAttribute('foo')).toBe('bar');
		expect(
			parse(ssr('IsElement', { foo: null }))
				.querySelector('div')!
				.hasAttribute('foo'),
		).toBe(false);
	});
});

// ===========================================================================
// ReactDOMServerIntegrationFragment-test.js
// ===========================================================================

describe('conformance: SSR serialization — fragments (Fragment)', () => {
	it('renders a fragment with one child (Per ReactDOMServerIntegrationFragment-test.js:41)', () => {
		const host = parse(ssr('FragOne'));
		expect(host.firstElementChild!.tagName).toBe('DIV');
		expect(host.firstElementChild!.textContent).toBe('text1');
		expectCleanHydrate('FragOne');
	});

	it('renders a fragment with several children, flattened (Per :51)', () => {
		const host = parse(ssr('FragSeveral'));
		const tags = Array.from(host.querySelectorAll('*')).map((el) => el.tagName);
		expect(tags).toEqual(['DIV', 'SPAN', 'P', 'H2', 'H3']);
		// Flattened: all siblings at the top level (component content included).
		expect(host.querySelector('p')!.parentNode).toBe(host);
		expect(host.querySelector('h2')!.parentNode).toBe(host);
	});

	it('hydrates a fragment with component members cleanly (Per :51)', () => {
		const r = hydrate('FragSeveral');
		expect(warns()).toEqual([]);
		expect(r.after).toBe(r.before);
	});

	it('renders a nested fragment, flattened, with nullish members dropped (Per :79)', () => {
		const host = parse(ssr('FragNested'));
		const tags = Array.from(host.querySelectorAll('*')).map((el) => el.tagName);
		expect(tags).toEqual(['DIV', 'SPAN', 'P']);
		expect(host.textContent).toBe('text1text2');
	});

	it('hydrates a nested fragment cleanly (Per :79)', () => {
		const r = hydrate('FragNested');
		expect(warns()).toEqual([]);
		expect(stripComments(r.after)).toBe(stripComments(r.before));
		expect(container.querySelector('div')!.textContent).toBe('text1');
	});

	it('renders an empty fragment as nothing (Per :103)', () => {
		const e = parse(ssr('FragEmpty')).firstElementChild!;
		expect(realChildren(e).length).toBe(0);
		expectCleanHydrate('FragEmpty');
	});
});

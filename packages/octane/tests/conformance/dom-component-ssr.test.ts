import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as Server from 'octane/server';
import { createElement } from '../../src/index.js';

// ============================================================================
// ReactDOMComponent-test.js — server-markup ports (createOpenTagMarkup /
// createContentMarkup / tag sanitization / escaping)
// ============================================================================
// Uses the inline compile+eval pattern from ssr-render-apis.test.ts: compile a
// .tsrx source in server mode and evaluate it against the octane/server runtime.

function evalServer(source: string, file: string): Record<string, any> {
	let { code } = compile(source, file, { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = $1; function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(Server, {});
}

// Round-trip a rendered fragment through the DOM parser — the assertions below
// are OUTCOME-level (what an HTML parser reconstructs), because octane's
// escapers pick different-but-equivalent entities than React's
// (escapeAttr: & and " only; escapeHtml: & < > — both attribute/text safe).
function parse(html: string): HTMLElement {
	const host = document.createElement('div');
	host.innerHTML = html;
	return host;
}

const spread = evalServer(`export function Spread(p) @{ <div {...p.sp} /> }`, 'dc-spread.tsrx');
const customSpread = evalServer(
	`export function Spread(p) @{ <x-foo-component {...p.sp} /> }`,
	'dc-custom-spread.tsrx',
);

describe('ReactDOMComponent — SSR attribute-name injection', () => {
	// Per ReactDOMComponent-test.js:877 — should reject attribute key injection attack on markup for regular DOM (SSR)
	it('drops injection-unsafe attribute names on a regular element', () => {
		for (let i = 0; i < 3; i++) {
			const r1 = Server.renderToString(spread.Spread, {
				sp: { 'blah" onclick="beevil" noise="hi': 'selected' },
			});
			const r2 = Server.renderToString(spread.Spread, {
				sp: { '></div><script>alert("hi")</script>': 'selected' },
			});
			expect(r1.html.toLowerCase()).not.toContain('onclick');
			expect(r2.html.toLowerCase()).not.toContain('script');
		}
	});

	// Per ReactDOMComponent-test.js:902 — should reject attribute key injection attack on markup for custom elements (SSR)
	it('drops injection-unsafe attribute names on a custom element', () => {
		for (let i = 0; i < 3; i++) {
			const r1 = Server.renderToString(customSpread.Spread, {
				sp: { 'blah" onclick="beevil" noise="hi': 'selected' },
			});
			const r2 = Server.renderToString(customSpread.Spread, {
				sp: { '></x-foo-component><script>alert("hi")</script>': 'selected' },
			});
			expect(r1.html.toLowerCase()).not.toContain('onclick');
			expect(r2.html.toLowerCase()).not.toContain('script');
		}
	});
});

describe('ReactDOMComponent — SSR open-tag markup', () => {
	const classed = evalServer(`export function C(p) @{ <div class={p.cls} /> }`, 'dc-class.tsrx');

	// Per ReactDOMComponent-test.js:1598 — should generate the correct markup with className
	it('serializes class="a", class="a b", and class=""', () => {
		expect(Server.renderToString(classed.C, { cls: 'a' }).html).toContain(' class="a"');
		expect(Server.renderToString(classed.C, { cls: 'a b' }).html).toContain(' class="a b"');
		expect(Server.renderToString(classed.C, { cls: '' }).html).toContain(' class=""');
	});

	// Per ReactDOMComponent-test.js:1604 — should escape style names and values
	// (outcome-level: octane escapeAttr escapes & and " — `<` stays raw, which is
	// attribute-safe; the parser round-trip must reproduce the exact value)
	it('escapes style names and values (round-trip)', () => {
		const styled = evalServer(`export function S(p) @{ <div style={p.s} /> }`, 'dc-style.tsrx');
		const { html } = Server.renderToString(styled.S, { s: { 'b&ckground': '<3' } });
		// The ampersand in the property NAME must be escaped in the serialized attr.
		expect(html).toContain('b&amp;ckground');
		const el = parse(html).querySelector('div')!;
		expect(el.getAttribute('style')).toBe('b&ckground:<3;');
	});
});

describe('ReactDOMComponent — SSR content markup', () => {
	// Per ReactDOMComponent-test.js:1628 — should handle dangerouslySetInnerHTML
	it('emits dangerouslySetInnerHTML content raw', () => {
		const danger = evalServer(
			`export function D(p) @{ <div dangerouslySetInnerHTML={{ __html: p.h }} /> }`,
			'dc-danger.tsrx',
		);
		const { html } = Server.renderToStaticMarkup(danger.D, { h: 'testContent' });
		expect(html).toContain('testContent');
		const el = parse(html).querySelector('div')!;
		expect(el.innerHTML).toBe('testContent');
	});

	// Per ReactDOMComponent-test.js:2134 — should properly escape text content and attributes values
	// (outcome-level round-trip; octane's entity choices differ from React's
	// byte-for-byte output but decode to the same document)
	it('escapes text content and attribute values (round-trip)', () => {
		const esc = evalServer(
			`export function E(p) @{ <div title={p.t} style={p.s}>{p.txt}</div> }`,
			'dc-escape.tsrx',
		);
		const nasty = '\'"<>&';
		const { html } = Server.renderToStaticMarkup(esc.E, {
			t: nasty,
			s: { textAlign: nasty },
			txt: nasty,
		});
		const el = parse(html).querySelector('div')!;
		expect(el.getAttribute('title')).toBe(nasty);
		expect(el.getAttribute('style')).toBe('text-align:\'"<>&;');
		expect(el.textContent).toBe(nasty);
	});
});

describe('ReactDOMComponent — SSR tag sanitization', () => {
	const bad = evalServer(`export function Bad(p) { return p.desc; }`, 'dc-badtag.tsrx');

	// Per ReactDOMComponent-test.js:2188 — should throw when an invalid tag name is used server-side
	// Per ReactDOMComponent-test.js:2195 — should throw when an attack vector is used server-side
	// GAP: React validates tag names server-side (VALID_TAG_REGEX) and throws
	// "Invalid tag"; octane's ssrHostElement string-concatenates the descriptor's
	// tag verbatim — `createElement('div><img /><div')` becomes live markup
	// (`<div><img /><div …>`) in the response. The SSR serializer validates
	// attribute NAMES (VALID_ATTR_NAME, runtime.server.ts:499) but not TAG names.
	// Runtime location: ssrHostElement (runtime.server.ts:343).
	it('throws for invalid tag names in a server render', () => {
		expect(() => Server.renderToString(bad.Bad, { desc: createElement('script tag') })).toThrow();
		expect(() =>
			Server.renderToString(bad.Bad, { desc: createElement('div><img /><div') }),
		).toThrow();
	});
});

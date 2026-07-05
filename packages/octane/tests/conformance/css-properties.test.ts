import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import * as ServerRT from 'octane/server';
import { mount } from '../_helpers';
import { StyleObj } from './_fixtures/css-properties.tsrx';

// ============================================================================
// CSSPropertyOperations-test.js (React v19.2.7) — the edges NOT already
// covered by tests/style.test.ts and tests/style-px.test.ts.
//
// Already covered (not duplicated here):
//  - :20 'should automatically append `px` to relevant styles' →
//    tests/style-px.test.ts (client, static bake, AND SSR: width 100 → 100px,
//    opacity stays bare, margin-top:0 stays bare).
//  - :43 unitless props keep bare numbers → style-px.test.ts (opacity, zIndex,
//    lineHeight; the SSR case adds z-index). The React-specific `flex: 0` value
//    is pinned below via SSR for completeness.
//  - :72 'should set style attribute when styles exist' → tests/style.test.ts
//    (static + dynamic object forms assert the style attribute exists).
//  - :275 'should not add units to CSS custom properties' →
//    tests/style-px.test.ts ('--gap': 8 → '8', client + SSR).
//
// Not ported (DEV-warning-only cases; octane's warning policy differs, and the
// functional outcome — the style still applies / renders — is covered by the
// tests here and in style.test.ts):
//  - :97 hyphenated style name warning (octane ACCEPTS kebab keys by design —
//    tests/style.test.ts uses 'font-size' keys throughout),
//  - :118 updating hyphenated names warning, :149 miscapitalized vendor prefix
//    warning, :184 trailing-semicolon warning, :219 NaN warning, :240 no-warn
//    for custom properties, :254 Infinity warning.
// ============================================================================

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/conformance/_fixtures/css-properties.tsrx',
);

// Compile the fixture in server mode against the real server runtime — the
// same pattern as tests/style-px.test.ts / tests/clsx-class.test.ts.
function evalServerModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'css-properties.tsrx', {
		mode: 'server',
	});
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		'const {$1} = __rt;',
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}

describe('CSSPropertyOperations — serialization edges (SSR)', () => {
	const server = evalServerModule();

	// Per CSSPropertyOperations-test.js:32 — should trim values. React trims
	// string style values before serializing ('16 ' → '16'); octane's
	// cssStyleValue stringifies verbatim, leaving the whitespace in the markup.
	// (Client CSSOM trims on parse, so this is only observable in SSR output —
	// but it IS a server/client byte difference React doesn't have.)
	// GAP: cssStyleValue (constants.ts) / styleObjectToCss (runtime.server.ts)
	// don't trim string values the way React's serializer does.
	it('trims string style values', async () => {
		const { html } = await ServerRT.renderToString(server.StyleObj, {
			s: { left: '16 ', opacity: 0.5, right: ' 4 ' },
		});
		expect(html).toContain('left:16;opacity:0.5;right:4');
	});

	// Per CSSPropertyOperations-test.js:43 — should not append `px` to styles
	// that might need a number (`flex: 0` stays bare).
	it('does not append px to flex: 0', async () => {
		const { html } = await ServerRT.renderToString(server.StyleObj, {
			s: { flex: 0, opacity: 0.5 },
		});
		expect(html).toContain('flex:0;opacity:0.5');
	});

	// Per CSSPropertyOperations-test.js:53 — should create vendor-prefixed markup
	// correctly (msTransition → -ms-transition, MozTransition → -moz-transition).
	it('serializes vendor-prefixed camelCase names with the leading dash', async () => {
		const { html } = await ServerRT.renderToString(server.StyleObj, {
			s: { msTransition: 'none', MozTransition: 'none' },
		});
		expect(html).toContain('-ms-transition:none;-moz-transition:none');
	});

	// Per CSSPropertyOperations-test.js:63 — should not hyphenate custom CSS
	// property (case preserved verbatim).
	it('does not hyphenate a camelCase custom property name', async () => {
		const { html } = await ServerRT.renderToString(server.StyleObj, {
			s: { '--someColor': '#000000' },
		});
		expect(html).toContain('--someColor:#000000');
	});

	// Per CSSPropertyOperations-test.js:87 — should not set style attribute when
	// no styles exist.
	it('omits the style attribute when every value is null', async () => {
		const { html } = await ServerRT.renderToString(server.StyleObj, {
			s: { backgroundColor: null, display: null },
		});
		expect(/style=/.test(html)).toBe(false);
	});
});

describe('CSSPropertyOperations — client CSSOM edges', () => {
	// Per CSSPropertyOperations-test.js:63 — custom property casing is preserved
	// on the live CSSOM too (custom properties are case-sensitive).
	it('applies a camelCase custom property without hyphenating', () => {
		const r = mount(StyleObj, { s: { '--someColor': '#000000' } });
		const el = r.find('#so') as HTMLElement;
		expect(el.style.getPropertyValue('--someColor')).toBe('#000000');
		expect(el.style.getPropertyValue('--some-color')).toBe('');
		r.unmount();
	});

	// Per CSSPropertyOperations-test.js:87 — an all-null style object never
	// creates the style attribute on the client either.
	it('does not create a style attribute when every value is null', () => {
		const r = mount(StyleObj, { s: { backgroundColor: null, display: null } });
		expect(r.find('#so').hasAttribute('style')).toBe(false);
		r.unmount();
	});
});

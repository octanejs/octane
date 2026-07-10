import { describe, it, expect } from 'vitest';
import { compile } from 'octane/compiler';
import * as domTables from '../src/dom-tables.js';
import * as constants from '../src/constants.js';

// The DOM truth tables (boolean/must-use-property attributes, attribute
// aliases, SVG-only tags, unitless style props, void elements) used to be
// hand-duplicated between compile.js, constants.ts, and the runtimes with
// "keep in sync" comments — drift surfaced as client/SSR/hydration
// disagreement (docs/project-analysis-concerns.md §5). They now live ONLY in
// src/dom-tables.js; this file pins the single-source wiring itself, not just
// representative behavior, so a re-fork fails loudly.

function clientHtml(src: string): string {
	// The client template bake is the hoisted `_$template("<html>")` literal.
	const code = compile(src, 'table-probe.tsrx').code;
	const m = code.match(/_\$template\("((?:[^"\\]|\\.)*)"/);
	if (!m) throw new Error('no template literal in:\n' + code);
	return m[1].replace(/\\"/g, '"');
}

describe('dom-tables is the single source of truth', () => {
	it('constants.ts re-exports the SAME instances (not re-forked copies)', () => {
		expect(constants.VOID_ELEMENTS).toBe(domTables.VOID_ELEMENTS);
		expect(constants.BOOLEAN_ATTR_PROPS).toBe(domTables.BOOLEAN_ATTR_PROPS);
		expect(constants.MUST_USE_PROPERTY_PROPS).toBe(domTables.MUST_USE_PROPERTY_PROPS);
		expect(constants.SVG_ONLY_TAGS).toBe(domTables.SVG_ONLY_TAGS);
		expect(constants.ATTRIBUTE_ALIASES).toBe(domTables.ATTRIBUTE_ALIASES);
		expect(constants.isEnumeratedBooleanAttr).toBe(domTables.isEnumeratedBooleanAttr);
		expect(constants.isUnitlessStyleProp).toBe(domTables.isUnitlessStyleProp);
		expect(constants.cssStyleValue).toBe(domTables.cssStyleValue);
	});

	it('the compiler reads the shared tables, not a private copy', () => {
		// Direct table-identity proof across the JS/TS module boundary: mutate the
		// shared Set and watch the compiler's static bake follow. If compile.js
		// ever re-declares its own table, the probe attribute bakes as a dropped
		// boolean-on-non-boolean-attr and this fails.
		const probe = 'x-octane-table-probe';
		domTables.BOOLEAN_ATTR_PROPS.add(probe);
		try {
			expect(clientHtml(`export function T() @{ <div ${probe}={true}/> }`)).toContain(
				`${probe}=""`,
			);
		} finally {
			domTables.BOOLEAN_ATTR_PROPS.delete(probe);
		}
		// And with the probe removed, the same value drops (React: `title={true}`
		// never renders) — proving the assertion above came from the table.
		expect(clientHtml(`export function T() @{ <div ${probe}={true}/> }`)).not.toContain(probe);
	});

	it('static bakes agree with the runtime tables at every category', () => {
		const html = clientHtml(
			`export function T() @{ <div hidden={true} htmlFor="x" spellCheck={false} style={{width: 10, opacity: 1, color: ' red '}}/> }`,
		);
		expect(html).toContain('hidden=""'); // BOOLEAN_ATTR_PROPS presence form
		expect(html).toContain('for="x"'); // ATTRIBUTE_ALIASES
		expect(html).toMatch(/spellcheck="false"/i); // enumerated boolean stringifies
		expect(html).toContain('width: 10px'); // px coercion
		expect(html).toContain('opacity: 1'); // unitless stays raw
		// String style values TRIM in the static bake exactly like the runtimes'
		// cssStyleValue (React parity: client CSSOM trims on parse). Before the
		// dedup the compiler had a private cssStyleValueStatic WITHOUT the trim —
		// the one real drift the single-sourcing fixed.
		expect(html).toContain('color: red');
		expect(html).not.toContain('color:  red');
	});

	it('SVG-only tag classification drives the compiler namespace bake', () => {
		// <g> root: only SVG_ONLY_TAGS membership can tell the compiler this
		// template needs the SVG namespace (no lexical <svg> ancestor).
		const code = compile('export function T() @{ <g><path/></g> }', 'svg-probe.tsrx').code;
		expect(code).toMatch(/_\$template\("(?:[^"\\]|\\.)*",\s*1\)/); // ns flag 1 = svg
	});

	it('void elements reject content on the shared table', () => {
		expect(() => compile('export function T() @{ <br>x</br> }', 'void-probe.tsrx')).toThrow(
			/void element/,
		);
	});
});

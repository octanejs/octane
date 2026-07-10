import { describe, it, expect, vi } from 'vitest';
import { mount } from '../_helpers';
import {
	ImgHeight,
	ImgSrc,
	ClassedDiv,
	AnchorHref,
	LinkHref,
	FormAction,
	FormButton,
	FormAcceptCharset,
	FormAcceptCharsetNative,
	SvgArabicForm,
	DivId,
	DivValue,
	AudioMuted,
	ButtonIs,
	DivDir,
	SpellCheck,
	DivWhatever,
	CasedAttrs,
	DivBareSpread,
	CustomBareSpread,
} from './_fixtures/dom-component-attributes.tsrx';

// ============================================================================
// ReactDOMComponent-test.js — HTML attribute add/remove/change matrix
// ============================================================================
// NOTE: tests deliberately avoid `find('#id')` — jsdom resolves `#id` selectors
// document-wide, and an `it.fails` port that dies mid-test leaves its container
// (and its ids) attached. `container.firstElementChild` / tag selectors only.

const first = (r: { container: HTMLElement }) => r.container.firstElementChild as HTMLElement;

describe('ReactDOMComponent — attribute removal', () => {
	// Per ReactDOMComponent-test.js:530 — should remove attributes
	it('removes an attribute when the prop goes away', () => {
		const r = mount(ImgHeight, { h: '17' });
		const img = first(r);
		expect(img.hasAttribute('height')).toBe(true);
		r.update(ImgHeight, {});
		expect(img.hasAttribute('height')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:544 — should remove properties
	it('removes className when the prop goes away', () => {
		const r = mount(ClassedDiv, { cls: 'monkey' });
		const div = first(r);
		expect(div.className).toBe('monkey');
		r.update(ClassedDiv, {});
		expect(div.className).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:558 — should not set null/undefined attributes
	it('never materializes null/undefined attributes across updates', () => {
		const r = mount(ImgSrc, { src: null, foo: undefined });
		const node = first(r);
		expect(node.hasAttribute('src')).toBe(false);
		expect(node.hasAttribute('data-foo')).toBe(false);
		r.update(ImgSrc, { src: undefined, foo: null });
		expect(node.hasAttribute('src')).toBe(false);
		expect(node.hasAttribute('data-foo')).toBe(false);
		r.update(ImgSrc, { src: null, foo: undefined });
		expect(node.hasAttribute('src')).toBe(false);
		expect(node.hasAttribute('data-foo')).toBe(false);
		r.update(ImgSrc, {});
		expect(node.hasAttribute('src')).toBe(false);
		expect(node.hasAttribute('data-foo')).toBe(false);
		r.update(ImgSrc, { src: undefined, foo: null });
		expect(node.hasAttribute('src')).toBe(false);
		expect(node.hasAttribute('data-foo')).toBe(false);
		r.unmount();
	});
});

describe('ReactDOMComponent — empty-string URL attributes', () => {
	// Per ReactDOMComponent-test.js:594 — should not add an empty src attribute
	// (setAttribute's empty-URL guard removes src=""/href="" — an empty URL
	// resolves to the current page and would trigger a refetch)
	it('does not write src=""', () => {
		const r = mount(ImgSrc, { src: '' });
		const node = first(r);
		expect(node.hasAttribute('src')).toBe(false);
		r.update(ImgSrc, { src: 'abc' });
		expect(node.hasAttribute('src')).toBe(true);
		r.update(ImgSrc, { src: '' });
		expect(node.hasAttribute('src')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:628 — should not add an empty href attribute (on <link>)
	// (href="" is filtered everywhere except <a>/<area>, where an empty href is
	// a legitimate same-page link.)
	// NOTE: octane hoists <link> into document.head (head-singleton support), so
	// the assertion targets the hoisted element.
	it('does not write href="" on <link>', () => {
		const before = document.head.querySelectorAll('link').length;
		const r = mount(LinkHref, { href: '' });
		const links = document.head.querySelectorAll('link');
		expect(links.length).toBe(before + 1);
		const link = links[links.length - 1];
		try {
			expect(link.hasAttribute('href')).toBe(false);
			r.update(LinkHref, { href: 'abc' });
			expect(link.hasAttribute('href')).toBe(true);
			r.update(LinkHref, { href: '' });
			expect(link.hasAttribute('href')).toBe(false);
		} finally {
			r.unmount();
		}
	});

	// Per ReactDOMComponent-test.js:660 — should allow an empty href attribute on anchors
	it('keeps href="" on <a>', () => {
		const r = mount(AnchorHref, { href: '' });
		expect(first(r).getAttribute('href')).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:670 — should allow an empty action attribute
	it('keeps action="" on <form>', () => {
		const r = mount(FormAction, { a: '' });
		const node = first(r);
		expect(node.getAttribute('action')).toBe('');
		r.update(FormAction, { a: 'abc' });
		expect(node.hasAttribute('action')).toBe(true);
		r.update(FormAction, { a: '' });
		expect(node.getAttribute('action')).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:690 — allows empty string of a formAction to override the default of a parent
	it('keeps formaction="" on a <button> inside a <form action>', () => {
		const r = mount(FormButton, { fa: '' });
		const btn = r.find('button');
		expect(btn.hasAttribute('formaction')).toBe(true);
		expect(btn.getAttribute('formaction')).toBe('');
		r.unmount();
	});
});

describe('ReactDOMComponent — React-specific attribute aliases', () => {
	// Per ReactDOMComponent-test.js:720 — React maps `acceptCharset` →
	// `accept-charset` (also :3457). Octane applies React 19's PROD write-path
	// `aliases` map (ATTRIBUTE_ALIASES, constants.ts) — the canonical camelCase
	// JSX prop writes the native attribute. (Adjudication history: the 2026-07-04
	// ruling rejected the loose possibleStandardNames DEV table — any-spelling
	// normalization — and that part stands. The prod aliases map was adopted
	// 2026-07-07: without it, React-ecosystem SVG libraries spread `strokeWidth`
	// et al. onto SVG hosts as dead attributes. The alias is additive — the
	// native hyphenated spelling still writes verbatim and stays the TSRX idiom.)
	it('aliases `acceptCharset` → `accept-charset`; native spelling also works', () => {
		const r = mount(FormAcceptCharset, { v: 'foo' });
		const node = first(r);
		expect(node.getAttribute('accept-charset')).toBe('foo');
		expect(node.hasAttribute('acceptcharset')).toBe(false);
		r.unmount();
		// The native spelling writes verbatim (not in the alias map).
		const r2 = mount(FormAcceptCharsetNative, { v: 'foo' });
		const node2 = first(r2);
		expect(node2.getAttribute('accept-charset')).toBe('foo');
		r2.update(FormAcceptCharsetNative, { v: null });
		expect(node2.hasAttribute('accept-charset')).toBe(false);
		r2.unmount();
	});

	// Per ReactDOMComponent-test.js:768 — React maps `arabicForm` → `arabic-form`
	// on SVG. Same aliases map; matters doubly on SVG hosts, whose setAttribute
	// preserves case (an unaliased camelCase name never styles the element).
	it('aliases SVG `arabicForm` → `arabic-form`', () => {
		const r = mount(SvgArabicForm, { v: 'foo' });
		const node = first(r);
		expect(node.getAttribute('arabic-form')).toBe('foo');
		expect(node.hasAttribute('arabicForm')).toBe(false);
		r.unmount();
	});
});

describe('ReactDOMComponent — DOM mutation minimization', () => {
	// Per ReactDOMComponent-test.js:1286 — should not incur unnecessary DOM mutations for attributes
	it('only touches setAttribute/removeAttribute when the id value actually changes', () => {
		const r = mount(DivId, { id: '' });
		const node = first(r);

		const setSpy = vi.fn(node.setAttribute.bind(node));
		const removeSpy = vi.fn(node.removeAttribute.bind(node));
		node.setAttribute = setSpy;
		node.removeAttribute = removeSpy;

		r.update(DivId, { id: '' });
		expect(setSpy).toHaveBeenCalledTimes(0);
		expect(removeSpy).toHaveBeenCalledTimes(0);

		r.update(DivId, { id: 'foo' });
		expect(setSpy).toHaveBeenCalledTimes(1);
		expect(removeSpy).toHaveBeenCalledTimes(0);

		r.update(DivId, { id: 'foo' });
		expect(setSpy).toHaveBeenCalledTimes(1);
		expect(removeSpy).toHaveBeenCalledTimes(0);

		r.update(DivId, {});
		expect(setSpy).toHaveBeenCalledTimes(1);
		expect(removeSpy).toHaveBeenCalledTimes(1);

		r.update(DivId, { id: '' });
		expect(setSpy).toHaveBeenCalledTimes(2);
		expect(removeSpy).toHaveBeenCalledTimes(1);

		r.update(DivId, {});
		expect(setSpy).toHaveBeenCalledTimes(2);
		expect(removeSpy).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1339 — should not incur unnecessary DOM mutations for string properties
	it('dedups writes for a custom `value` attribute on a <div>', () => {
		const r = mount(DivValue, { v: '' });
		const node = first(r);

		const setSpy = vi.fn(node.setAttribute.bind(node));
		node.setAttribute = setSpy;

		r.update(DivValue, { v: 'foo' });
		expect(setSpy).toHaveBeenCalledTimes(1);
		r.update(DivValue, { v: 'foo' });
		expect(setSpy).toHaveBeenCalledTimes(1);
		r.update(DivValue, {});
		expect(setSpy).toHaveBeenCalledTimes(1);
		r.update(DivValue, { v: null });
		expect(setSpy).toHaveBeenCalledTimes(1);
		r.update(DivValue, { v: '' });
		expect(setSpy).toHaveBeenCalledTimes(2);
		r.update(DivValue, {});
		expect(setSpy).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1460 — React writes known boolean props
	// (audio.muted) as DOM PROPERTIES via its property-routing table. Matched
	// since 2026-07-08 (MUST_USE_PROPERTY_PROPS in constants.ts — reverses the
	// 2026-07-04 plain-attributes adjudication): the muted ATTRIBUTE doesn't
	// reflect to the live property post-creation, so a dynamic write must set
	// the property or a playing element never (un)mutes. Static literals and
	// SSR still emit the attribute (correct initial state).
	it('writes muted as a DOM property (mustUseProperty), never the attribute', () => {
		const r = mount(AudioMuted, { m: true });
		const node = first(r);
		expect((node as HTMLMediaElement).muted).toBe(true);
		expect(node.hasAttribute('muted')).toBe(false);
		const setter = vi.fn();
		Object.defineProperty(node, 'muted', {
			get: () => true,
			set: setter,
			configurable: true,
		});
		r.update(AudioMuted, { m: false, u: 'ok' });
		expect(setter).toHaveBeenCalledTimes(1);
		expect(setter).toHaveBeenCalledWith(false);
		expect(node.hasAttribute('muted')).toBe(false); // attribute untouched
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:1512 — should not update when switching between null/undefined
	it('null ↔ undefined transitions never call setAttribute', () => {
		const r = mount(DivDir, {});
		const node = first(r);
		const setSpy = vi.fn(node.setAttribute.bind(node));
		node.setAttribute = setSpy;

		r.update(DivDir, { dir: null });
		r.update(DivDir, { dir: undefined });
		r.update(DivDir, {});
		expect(setSpy).toHaveBeenCalledTimes(0);
		r.update(DivDir, { dir: 'ltr' });
		expect(setSpy).toHaveBeenCalledTimes(1);
		r.unmount();
	});
});

describe('ReactDOMComponent — `is` attribute', () => {
	// Per ReactDOMComponent-test.js:1490 — should ignore attribute list for elements with the "is" attribute
	it('keeps arbitrary attributes on an element with is=', () => {
		const r = mount(ButtonIs);
		expect(first(r).hasAttribute('cowabunga')).toBe(true);
		r.unmount();
	});
});

describe('ReactDOMComponent — enumerated attributes', () => {
	// Per ReactDOMComponent-test.js:3569/:3582/:3595 — stringifies booleans for
	// allowed (enumerated) attributes: spellCheck={true} → "true", {false} →
	// "false" (isEnumeratedBooleanAttr: spellcheck/draggable/contenteditable).
	it('stringifies spellCheck={true} to "true" and {false} to "false"', () => {
		const r = mount(SpellCheck, { v: true });
		const node = first(r);
		expect(node.getAttribute('spellCheck')).toBe('true');
		r.update(SpellCheck, { v: false });
		expect(node.getAttribute('spellCheck')).toBe('false');
		r.unmount();
	});
});

describe('ReactDOMComponent — custom attributes', () => {
	// Per ReactDOMComponent-test.js:3228 — allows assignment of custom attributes with string values
	// Per ReactDOMComponent-test.js:3241 — removes custom attributes
	// Per ReactDOMComponent-test.js:3296 — assigns a numeric custom attributes as a string
	// Per ReactDOMComponent-test.js:3403 — NaN stringifies (warning skipped; outcome kept)
	it('writes string/number/NaN custom attribute values, removes null', () => {
		const r = mount(DivWhatever, { w: '30' });
		const node = first(r);
		expect(node.getAttribute('whatever')).toBe('30');
		r.update(DivWhatever, { w: null });
		expect(node.hasAttribute('whatever')).toBe(false);
		r.update(DivWhatever, { w: 3 });
		expect(node.getAttribute('whatever')).toBe('3');
		r.update(DivWhatever, { w: NaN });
		expect(node.getAttribute('whatever')).toBe('NaN');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3309 — will not assign a function custom attributes
	// (also accounts :3420 — removes a property when it becomes invalid;
	// function/symbol values route to removeAttribute)
	it('drops function-valued custom attributes', () => {
		const r = mount(DivWhatever, { w: 0 });
		const node = first(r);
		expect(node.getAttribute('whatever')).toBe('0');
		r.update(DivWhatever, { w: () => {} });
		expect(node.hasAttribute('whatever')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3329 — will assign an object custom attributes
	// Per ReactDOMComponent-test.js:3507 — passes objects on custom attributes if they do not define toString
	it('stringifies plain objects to [object Object]', () => {
		const r = mount(DivWhatever, { w: {} });
		expect(first(r).getAttribute('whatever')).toBe('[object Object]');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:3469 — should pass objects as attributes if they define toString
	// Per ReactDOMComponent-test.js:3520 — allows objects that inherit a custom toString method
	// Per ReactDOMComponent-test.js:3535 — assigns ajaxify (an important internal FB attribute)
	it('uses toString() for object attribute values (own and inherited)', () => {
		const obj = {
			toString() {
				return 'hello';
			},
		};
		const r = mount(ImgSrc, { src: obj });
		expect((first(r) as HTMLImageElement).getAttribute('src')).toBe('hello');
		r.unmount();

		const r2 = mount(DivWhatever, { w: obj });
		expect(first(r2).getAttribute('whatever')).toBe('hello');
		r2.unmount();

		const parent = { toString: () => 'hello.jpg' };
		const child = Object.create(parent);
		const r3 = mount(ImgSrc, { src: child });
		expect(first(r3).getAttribute('src')).toBe('hello.jpg');
		r3.unmount();
	});

	// Per ReactDOMComponent-test.js:3365 — allows cased data attributes
	// Per ReactDOMComponent-test.js:3384 — allows cased custom attributes
	// (React lowercases via a warning; the HTML DOM lowercases natively — same outcome)
	it('cased data-* and custom attributes land lowercased', () => {
		const r = mount(CasedAttrs, { d: 'true', f: 'true' });
		const node = first(r);
		expect(node.getAttribute('data-foobar')).toBe('true');
		expect(node.getAttribute('foobar')).toBe('true');
		r.unmount();
	});
});

describe('ReactDOMComponent — attribute-name injection (client)', () => {
	const evil1 = 'blah" onclick="beevil" noise="hi';
	const evil2 = '></div><script>alert("hi")</script>';

	// Per ReactDOMComponent-test.js:927 — should reject attribute key injection attack on mount for regular DOM
	// Per ReactDOMComponent-test.js:1019 — …on update for regular DOM
	// GAP: React validates attribute names and SKIPS invalid ones (render
	// completes, zero attributes). Octane's client setAttribute passes the name
	// straight to el.setAttribute, which throws InvalidCharacterError — the
	// render CRASHES instead of dropping the attribute. (The SSR serializer
	// already has the guard: VALID_ATTR_NAME in runtime.server.ts — the client
	// path needs the same.) Runtime location: setAttribute/setSpread
	// (runtime.ts:3501/3819).
	it('skips injection-unsafe attribute names on a regular element (mount + update)', () => {
		const r = mount(DivBareSpread, { sp: { [evil1]: 'selected' } });
		const node = first(r);
		expect(node.attributes.length).toBe(0);
		r.update(DivBareSpread, { sp: { [evil2]: 'selected' } });
		expect(node.attributes.length).toBe(0);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:972 — …on mount for custom elements
	// Per ReactDOMComponent-test.js:1064 — …on update for custom elements
	// GAP: same client-side attribute-name validation gap, custom-element arm.
	it('skips injection-unsafe attribute names on a custom element (mount + update)', () => {
		const r = mount(CustomBareSpread, { sp: { [evil1]: 'selected' } });
		const node = first(r);
		expect(node.attributes.length).toBe(0);
		r.update(CustomBareSpread, {
			sp: { ['></x-foo-component><script>alert("hi")</script>']: 'selected' },
		});
		expect(node.attributes.length).toBe(0);
		r.unmount();
	});
});

/* ============================================================================
 * ReactDOMComponent-test.js (React v19.2.7, 163 cases) — full port accounting
 * ============================================================================
 * Files: dom-component-{styles,attributes,children,custom-elements,events,ssr}.test.ts
 * "ported*" = ported as it.fails (genuine octane GAP, see the test's // GAP note).
 *
 *   :42   should handle className                                  → ported (styles)
 *   :63   should gracefully handle various style value types       → ported (styles; boolean-true arm ported* — style true not dropped)
 *   :97   should not update styles when mutating a proxy object    → ported (styles)
 *   :170  should throw when mutating style objects                 → skipped (DEV-only style-object freeze)
 *   :192  should warn for unknown prop                             → skipped (DEV warning text)
 *   :206  should group multiple unknown prop warnings together     → skipped (DEV warning text)
 *   :220  should warn for onDblClick prop                          → skipped (DEV warning text)
 *   :232  should warn for unknown string event handlers            → skipped (DEV warning + React's unknown-handler filtering; octane has no handler allowlist)
 *   :265  should warn for unknown function event handlers          → skipped (same)
 *   :297  should warn for badly cased React attributes             → skipped (DEV warning text)
 *   :310  should not warn for "0" as a unitless style value        → skipped (warning-absence assertion; class component)
 *   :324  should warn nicely about NaN in style                    → skipped (DEV warning text)
 *   :340  throws with Temporal-like objects as style values        → ported (styles — octane's `'' + value` coercion throws identically)
 *   :368  should update styles if initially null                   → ported (styles)
 *   :386  should update styles if updated to null multiple times   → ported (styles)
 *   :418  named slot projection                                    → ported (custom-elements)
 *   :437  should skip reserved props on web components             → ported (custom-elements; suppressContentEditableWarning arm ported*)
 *   :476  should skip dangerouslySetInnerHTML on web components    → ported (custom-elements; octane applies the HTML as a property — attribute-absence outcome matches)
 *   :495  render null/undefined empty, print other falsy __html    → ported (children)
 *   :530  should remove attributes                                 → ported (attributes)
 *   :544  should remove properties                                 → ported (attributes)
 *   :558  should not set null/undefined attributes                 → ported (attributes)
 *   :594  should not add an empty src attribute                    → ported (attributes — setAttribute's empty-URL guard)
 *   :628  should not add an empty href attribute                   → ported (attributes — empty-URL guard; link is head-hoisted)
 *   :660  should allow an empty href attribute on anchors          → ported (attributes)
 *   :670  should allow an empty action attribute                   → ported (attributes)
 *   :690  empty formAction overrides the parent default            → ported (attributes)
 *   :705  should not filter attributes for custom elements         → ported (custom-elements)
 *   :720  React-specific aliases on HTML elements                  → ported* (attributes — no possibleStandardNames alias table)
 *   :768  React-specific aliases on SVG elements                   → ported* (attributes — same alias gap)
 *   :816  update custom attributes on custom elements              → ported (custom-elements)
 *   :833  no React-specific aliases on custom elements             → ported (custom-elements)
 *   :859  clear a single style prop when changing `style`          → ported (styles)
 *   :877  attr-key injection on markup, regular DOM (SSR)          → ported (ssr — VALID_ATTR_NAME guard passes)
 *   :902  attr-key injection on markup, custom elements (SSR)      → ported (ssr)
 *   :927  attr-key injection on mount, regular DOM                 → ported* (attributes — client setAttribute throws instead of skipping)
 *   :972  attr-key injection on mount, custom elements             → ported* (attributes — same, custom-element arm)
 *   :1019 attr-key injection on update, regular DOM                → ported* (attributes — merged into the :927 test's update leg)
 *   :1064 attr-key injection on update, custom elements            → ported* (attributes — merged into the :972 test's update leg)
 *   :1109 update arbitrary attributes for dashed tags              → ported (custom-elements)
 *   :1126 clear all styles when removing `style`                   → ported (styles)
 *   :1143 update styles when `style` changes null → object         → ported (styles)
 *   :1163 not reset innerHTML when children is null                → ported (children)
 *   :1178 reset innerHTML text child → empty child                 → ported (children)
 *   :1196 empty element when removing innerHTML                    → ported (children)
 *   :1210 transition string content → innerHTML                    → ported (children — de-opt in-place patch)
 *   :1224 transition innerHTML → string content                    → ported (children)
 *   :1238 transition innerHTML → children in nested el             → ported (children)
 *   :1262 transition children → innerHTML in nested el             → ported (children)
 *   :1286 no unnecessary DOM mutations for attributes              → ported (attributes)
 *   :1339 no unnecessary DOM mutations for string properties       → ported (attributes)
 *   :1387 …for controlled string properties                        → skipped (§2 intentional divergence — controlled inputs)
 *   :1460 no unnecessary DOM mutations for boolean properties      → ported* (attributes — boolean props are attributes, never DOM properties)
 *   :1490 ignore attribute list for elements with "is"             → ported (attributes)
 *   :1499 warn about non-string "is" attribute                     → skipped (DEV warning text)
 *   :1512 not update when switching between null/undefined         → ported (attributes)
 *   :1538 handles multiple child updates without interference      → covered-by-existing (conformance/multichild-identity.test.ts, fuzz-keyed-list.test.ts)
 *   :1598 correct markup with className (SSR)                      → ported (ssr)
 *   :1604 escape style names and values (SSR)                      → ported (ssr — outcome-level round-trip; entity choice differs)
 *   :1628 handle dangerouslySetInnerHTML (SSR)                     → ported (ssr)
 *   :1652 error event on <source> element                          → ported (events — NON_BUBBLING_TARGET_EVENTS delegation)
 *   :1676 warn for uppercased selfclosing tags                     → skipped (DEV warning; uppercase tags are component refs in TSRX)
 *   :1695 warn on upper case HTML tags                             → skipped (DEV warning; same)
 *   :1724 warn on props reserved for future use (`aria`)           → skipped (DEV warning text)
 *   :1738 warn if the tag is unrecognized                          → skipped (DEV warning text)
 *   :1794 throw on children for void elements                      → ported* (children — void children silently dropped, no error)
 *   :1807 throw on dangerouslySetInnerHTML for void elements       → ported* (children — innerHTML assigned silently)
 *   :1820 menuitem void element closing tag                        → skipped (obsolete element; React-specific void list + DEV warning)
 *   :1852 validate against multiple children props (mount)         → ported* (children — no dangerouslySetInnerHTML shape validation)
 *   :1861 validate against use of innerHTML                        → covered-by-existing (danger-html.test.ts — bare innerHTML is a plain attribute)
 *   :1870 …innerHTML without case sensitivity                      → covered-by-existing (same danger-html pin; `innerhtml` is equally a plain attribute)
 *   :1879 validate dangerouslySetInnerHTM with JSX (string)        → ported* (children — merged into the :1852 test)
 *   :1888 validate dangerouslySetInnerHTML with object             → ported* (children — merged into the :1852 test)
 *   :1897 should allow {__html: null}                              → ported (children)
 *   :1903 warn about contentEditable and children (mount)          → skipped (DEV warning)
 *   :1914 respect suppressContentEditableWarning                   → skipped (warning-suppression for a warning octane doesn't emit)
 *   :1922 validate against invalid styles (string)                 → skipped (intentional divergence — octane SUPPORTS string cssText styles; pinned in tests/style.test.ts)
 *   :1932 throw for children on void elements (class comp)         → ported* (children — class-component duplicate of :1794)
 *   :1951 custom elements which extend native elements (is=)       → ported (custom-elements — outcome-level: attribute present; createElement(tag,{is}) upgrade not exercised, octane clones templates)
 *   :1963 load/error events on <image> element in SVG              → ported (events)
 *   :1992 load event on <link> elements                            → ported* (events — head-hoisted link sits outside delegation targets)
 *   :2010 error event on <link> elements                           → ported* (events — same)
 *   :2038 warn against children for void elements (update)         → ported* (children — merged into the :1794 pin)
 *   :2053 warn against dangerouslySetInnerHTML for void (update)   → ported* (children — merged into the :1807 pin)
 *   :2068 validate against multiple children props (update)        → ported* (children — children+dSIH exclusivity not enforced; HTML wins)
 *   :2084 warn about contentEditable and children (update)         → skipped (DEV warning)
 *   :2100 validate against invalid styles (number, update)         → skipped (intentional divergence — style value types; octane no-ops a non-object/string)
 *   :2116 report component containing invalid styles               → skipped (same + class component)
 *   :2134 escape text content and attributes values (SSR)          → ported (ssr — outcome-level round-trip)
 *   :2157 unmounts children before unsetting DOM node info         → skipped (findDOMNode + class-lifecycle internals)
 *   :2188 throw when an invalid tag name is used server-side       → ported* (ssr — ssrHostElement doesn't validate descriptor tags)
 *   :2195 throw when an attack vector is used server-side          → ported* (ssr — merged into the :2188 test)
 *   :2202 throw when an invalid tag name is used                   → ported (children — document.createElement throws natively)
 *   :2213 throw when an attack vector is used                      → ported (children)
 *   :2226 warns on invalid nesting                                 → skipped (DEV nesting validation)
 *   :2248 warns on invalid nesting at root                         → skipped (DEV nesting validation)
 *   :2267 warns nicely for table rows                              → skipped (DEV nesting validation; class components)
 *   :2334 warns nicely for updating table rows to use text         → skipped (DEV nesting validation)
 *   :2401 gives useful context in warnings                         → skipped (DEV warning component stacks)
 *   :2448 gives useful context in warnings 2                       → skipped (same)
 *   :2512 gives useful context in warnings 3                       → skipped (same)
 *   :2563 gives useful context in warnings 4                       → skipped (same)
 *   :2599 gives useful context in warnings 5                       → skipped (same)
 *   :2671 warn about incorrect casing on properties (ssr)          → skipped (DEV casing warning)
 *   :2681 warn about incorrect casing on event handlers (ssr)      → skipped (same)
 *   :2703 warn about incorrect casing on properties                → skipped (same)
 *   :2717 warn about incorrect casing on event handlers            → skipped (same)
 *   :2740 should warn about class                                  → skipped (class-component warning; `class` is octane's native spelling)
 *   :2752 should warn about class (ssr)                            → skipped (same)
 *   :2762 warn about props that are no longer supported            → skipped (DEV warning text)
 *   :2792 …without case sensitivity                                → skipped (same)
 *   :2821 …no longer supported (ssr)                               → skipped (same)
 *   :2837 …without case sensitivity (ssr)                          → skipped (same)
 *   :2853 source code refs for unknown prop warning                → skipped (DEV warning refs)
 *   :2875 …(ssr)                                                   → skipped (same)
 *   :2893 …for update render                                       → skipped (same)
 *   :2911 …for exact elements                                      → skipped (same)
 *   :2933 …for exact elements (ssr)                                → skipped (same)
 *   :2952 …for exact elements in composition                       → skipped (same)
 *   :3007 …for exact elements in composition (ssr)                 → skipped (same)
 *   :3061 suggest property name if available                       → skipped (DEV suggestion warning; octane supports native `for` AND the htmlFor alias — see prop-removal.test.ts)
 *   :3084 suggest property name if available (ssr)                 → skipped (same)
 *   :3103 renders innerHTML and preserves whitespace               → ported (children)
 *   :3116 render and then updates innerHTML, preserves whitespace  → ported (children)
 *   :3136 sets aliased attributes on HTML attributes (`class`)     → covered-by-existing (`class` is the native TSRX spelling — attrs-events.test.ts, clsx-class.test.ts)
 *   :3152 incorrectly cased aliased attributes with a warning      → skipped (DEV casing warning)
 *   :3168 aliased attributes on SVG elements with a warning        → covered-by-existing (conformance/svg-attributes.test.ts — kebab passthrough)
 *   :3189 sets aliased attributes on custom elements               → ported (custom-elements)
 *   :3200 aliased attributes on custom elements with bad casing    → skipped (DEV casing warning)
 *   :3213 updates aliased attributes on custom elements            → ported (custom-elements)
 *   :3228 allows custom attributes with string values              → ported (attributes)
 *   :3241 removes custom attributes                                → ported (attributes)
 *   :3257 does not assign a boolean custom attribute as a string   → skipped (intentional divergence — octane's generic boolean-attr handling: true→bare attr, no unknown-attr allowlist; pinned in attrs-events.test.ts)
 *   :3275 does not assign an implicit boolean custom attribute     → skipped (same)
 *   :3296 assigns a numeric custom attribute as a string           → ported (attributes)
 *   :3309 will not assign a function custom attribute              → ported (attributes — function/symbol values are removed)
 *   :3329 will assign an object custom attribute                   → ported (attributes)
 *   :3341 allows Temporal-like objects as HTML                     → ported (children)
 *   :3365 allows cased data attributes                             → ported (attributes — DOM lowercases natively; warning skipped)
 *   :3384 allows cased custom attributes                           → ported (attributes — same)
 *   :3403 warns on NaN attributes                                  → ported (attributes — outcome only: "NaN" lands; warning skipped)
 *   :3420 removes a property when it becomes invalid               → ported (attributes — merged into the :3309 test)
 *   :3439 warns on bad casing of known HTML attributes             → skipped (DEV casing warning; SiZe lowercases to size natively anyway)
 *   :3457 allows objects on known properties (acceptCharset)       → ported* (attributes — folded into the :720 alias pin; the alias is the missing piece)
 *   :3469 pass objects as attributes if they define toString       → ported (attributes — img src + custom attr arms; the arabicForm arm is the :768 alias pin)
 *   :3494 objects on known SVG attributes without toString         → skipped (alias-table variant of :768 — same single gap, no extra behavior)
 *   :3507 objects on custom attributes without toString            → ported (attributes)
 *   :3520 allows objects that inherit a custom toString            → ported (attributes)
 *   :3535 assigns ajaxify                                          → ported (attributes — merged into the toString test)
 *   :3551 no string boolean attributes for custom attributes       → skipped (duplicate of :3257)
 *   :3569 stringifies boolean true for allowed attributes          → ported (attributes — isEnumeratedBooleanAttr)
 *   :3582 stringifies boolean false for allowed attributes         → ported (attributes — same test)
 *   :3595 stringifies implicit booleans for allowed attributes     → ported (attributes — same test; implicit true ≡ true)
 *   :3611 warns on the ambiguous string value "false"              → skipped (DEV warning; octane writes hidden="false" — still truthy boolean attr, functional outcome equivalent)
 *   :3629 warns on the potentially-ambiguous string value "true"   → skipped (same)
 *   :3649 the font-face element is not a custom element            → skipped (React attribute-allowlist behavior; octane has no attr filtering — alias/allowlist family)
 *   :3671 font-face does not allow unknown boolean values          → skipped (DEV warning; outcome coincidentally identical — false drops in octane's generic handling)
 *   :3701 does not strip unknown boolean attributes                → ported (custom-elements)
 *   :3723 does not strip the on* attributes                        → ported (custom-elements)
 *   :3746 receives events in specific order                        → ported (events — octane's root-container delegation matches React's order)
 *   :3817 adds onclick handler to elements with onClick prop       → ported* (events — iOS tap-highlight stub missing)
 *   :3832 adds onclick handler to a portal root                    → ported* (events — same, portal target)
 *   :3851 no onclick handler on the React root in legacy mode      → skipped (§2 — legacy/sync mode; octane is concurrent-root only)
 *
 * Totals: 95 ported — the 23 case-lines marked ported* (plus the partial arms
 * of :63 and :437) were ORIGINALLY pinned as it.fails across 15 tests; those
 * gaps have since been fixed and every pin flipped to a plain `it`, so the
 * ported* markers are a historical record of which cases once diverged, not a
 * live gap list (this family currently has zero it.fails) — 5
 * covered-by-existing (:1538 :1861 :1870 :3136 :3168), 63 skipped.
 * The live parity backlog is generated into docs/parity-gaps.md
 * (`pnpm parity:gaps`).
 * ========================================================================== */

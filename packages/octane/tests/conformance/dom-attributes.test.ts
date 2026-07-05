import { describe, it, expect, vi } from 'vitest';
import { mount } from '../_helpers';
import {
	UnknownAttr,
	UnknownSpread,
	BoolInert,
	BoolDisabled,
	DownloadAttr,
	AllowFullScreen,
	DataFoo,
	HiddenAttr,
	TitleAttr,
	RoleAttr,
	ClassNullable,
	ProgressValue,
	OptionValues,
	InputEmptyValue,
	SpellCheck,
	ImgSrc,
	LinkHref,
	AnchorHref,
	FormAction,
	CustomElFoo,
	CustomElStatic,
	CustomElOnAttrs,
	CustomElCustomEvent,
	CustomElClick,
	CustomElChangeInput,
} from './_fixtures/dom-attributes.tsrx';

// ============================================================================
// HTML attribute matrix — ports of ReactDOMAttribute-test.js and
// DOMPropertyOperations-test.js (React v19.2.7), plus the empty-string
// src/href/action + enumerated-attribute core from ReactDOMComponent-test.js.
//
// Scope notes (per docs/react-parity-migration-plan.md §2):
//  - controlled inputs / synthetic onChange are an INTENTIONAL divergence —
//    none of those cases are ported (see the accounting comments below).
//  - class/className composes clsx-style (intentional divergence) — React's
//    coercion cases are not ported.
//  - DEV-warning cases port their FUNCTIONAL outcome only.
// ============================================================================

describe('ReactDOMAttribute — unknown attributes', () => {
	// Per ReactDOMAttribute-test.js:62 — removes values null and undefined
	it('removes values null and undefined', () => {
		const r = mount(UnknownAttr, { value: 'something' });
		const el = r.find('#u');
		expect(el.getAttribute('unknown')).toBe('something');
		r.update(UnknownAttr, { value: null });
		expect(el.hasAttribute('unknown')).toBe(false);
		r.update(UnknownAttr, { value: 'something' });
		expect(el.getAttribute('unknown')).toBe('something');
		r.update(UnknownAttr, { value: undefined });
		expect(el.hasAttribute('unknown')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:67 — changes values true, false to null
	// (false half; warning not ported). `unknown={false}` removes the attribute
	// in both React and octane.
	it('removes an unknown attribute set to false', () => {
		const r = mount(UnknownAttr, { value: 'something' });
		const el = r.find('#u');
		r.update(UnknownAttr, { value: false });
		expect(el.hasAttribute('unknown')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:67 (true half) — React REMOVES `unknown={true}`
	// on a non-boolean attribute via its known-attribute table (+ warns).
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-04): octane has no known-attribute
	// table — `attr={true}` uniformly writes boolean-attribute PRESENCE (`attr=""`),
	// exactly what that markup means in raw HTML, which is also what custom-element
	// consumers want. `false`/null/undefined still remove (asserted above).
	it('renders an unknown attribute set to true as boolean presence (native pass-through)', () => {
		const r = mount(UnknownAttr, { value: 'something' });
		const el = r.find('#u');
		r.update(UnknownAttr, { value: true });
		expect(el.getAttribute('unknown')).toBe('');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:78 — removes unknown attributes that were
	// rendered but are now missing. A direct binding can't vanish between renders,
	// so this exercises the spread removal loop (setSpread → removeHostProp).
	it('removes unknown attributes that were rendered but are now missing (spread)', () => {
		const r = mount(UnknownSpread, { sp: { unknown: 'something' } });
		const el = r.find('#us');
		expect(el.getAttribute('unknown')).toBe('something');
		r.update(UnknownSpread, { sp: {} });
		expect(el.hasAttribute('unknown')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:95 — removes new boolean props
	it('renders new boolean props (`inert`) as an empty-string attribute', () => {
		const r = mount(BoolInert, { v: true });
		const el = r.find('#bi');
		expect(el.getAttribute('inert')).toBe('');
		r.update(BoolInert, { v: false });
		expect(el.hasAttribute('inert')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:106 — React coerces `inert=""` to FALSE (its
	// boolean-prop JS semantics) and removes the attribute.
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-04): octane writes attribute
	// values through natively — `inert=""` stays present, and per the HTML boolean-
	// attribute rules PRESENCE means TRUE, exactly as if you had written the markup
	// by hand. NOTE the semantic flip vs React for this edge: pass a real boolean
	// (`inert={cond}`) for JS-boolean behavior; `false` removes as expected.
	it('passes `inert=""` through natively (present ⇒ platform-true)', () => {
		const r = mount(BoolInert, { v: '' });
		expect(r.find('#bi').getAttribute('inert')).toBe('');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:129 — passes through strings
	it('passes through strings', () => {
		const r = mount(UnknownAttr, { value: 'a string' });
		expect(r.find('#u').getAttribute('unknown')).toBe('a string');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:133 — coerces numbers to strings
	it('coerces numbers to strings', () => {
		const r = mount(UnknownAttr, { value: 0 });
		const el = r.find('#u');
		expect(el.getAttribute('unknown')).toBe('0');
		r.update(UnknownAttr, { value: -1 });
		expect(el.getAttribute('unknown')).toBe('-1');
		r.update(UnknownAttr, { value: 42 });
		expect(el.getAttribute('unknown')).toBe('42');
		r.update(UnknownAttr, { value: 9000.99 });
		expect(el.getAttribute('unknown')).toBe('9000.99');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:140 — coerces NaN to strings (and warns —
	// warning not ported, functional outcome only).
	it('coerces NaN to the string "NaN"', () => {
		const r = mount(UnknownAttr, { value: NaN });
		expect(r.find('#u').getAttribute('unknown')).toBe('NaN');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:149 — coerces objects to strings (and warns —
	// warning not ported, functional outcome only).
	it('coerces objects to strings', () => {
		const r = mount(UnknownAttr, { value: { hello: 'world' } });
		const el = r.find('#u');
		expect(el.getAttribute('unknown')).toBe('[object Object]');
		r.update(UnknownAttr, {
			value: {
				toString() {
					return 'lol';
				},
			},
		});
		expect(el.getAttribute('unknown')).toBe('lol');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:160 — throws with Temporal-like objects.
	// React coerces with `'' + value` (→ valueOf → the Temporal proposal throws);
	// octane's setAttribute coerces with String(value) (→ toString → '2020-01-01')
	// and does NOT throw.
	// GAP: setAttribute (runtime.ts) uses String(value), so valueOf-throwing
	// Per ReactDOMAttribute-test.js:160 — React coerces with `'' + value`, so a
	// Temporal-like object (throwing valueOf) surfaces the TypeError.
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-04): octane coerces with
	// String(value), which uses toString() — the value renders instead of
	// throwing. Lenient by design; no attribute-coercion crash surface.
	it('renders a Temporal-like object via toString() instead of throwing', () => {
		class TemporalLike {
			valueOf() {
				throw new TypeError('prod message');
			}
			toString() {
				return '2020-01-01';
			}
		}
		const r = mount(UnknownAttr, { value: new TemporalLike() });
		expect(r.find('#u').getAttribute('unknown')).toBe('2020-01-01');
		r.unmount();
	});

	// Per ReactDOMAttribute-test.js:182 — removes symbols (warning not ported,
	// functional outcome only). setAttribute guards function/symbol values.
	it('removes symbols', () => {
		const r = mount(UnknownAttr, { value: 'something' });
		const el = r.find('#u');
		r.update(UnknownAttr, { value: Symbol('foo') });
		const has = el.hasAttribute('unknown');
		r.unmount();
		expect(has).toBe(false);
	});

	// Per ReactDOMAttribute-test.js:192 — removes functions (warning not ported,
	// functional outcome only). setAttribute guards function/symbol values so a
	// function's source text can never leak into the DOM.
	it('removes functions', () => {
		const r = mount(UnknownAttr, { value: 'something' });
		const el = r.find('#u');
		r.update(UnknownAttr, { value: function someFunction() {} });
		const has = el.hasAttribute('unknown');
		r.unmount();
		expect(has).toBe(false);
	});

	// Per ReactDOMAttribute-test.js:203 — allows camelCase unknown attributes (and
	// warns — warning not ported). The browser lowercases HTML attribute names, so
	// `helloWorld` lands in the DOM as `helloworld`. Spread path (arbitrary keys).
	it('allows camelCase unknown attributes (DOM name is lowercased)', () => {
		const r = mount(UnknownSpread, { sp: { helloWorld: 'something' } });
		expect(r.find('#us').getAttribute('helloworld')).toBe('something');
		r.unmount();
	});
});

describe('DOMPropertyOperations — attributes and reflected properties', () => {
	// Per DOMPropertyOperations-test.js:40 — should set values as properties by
	// default. octane writes the `title` ATTRIBUTE; the DOM reflects it into the
	// property, so the observable outcome matches.
	it('title is readable as a property', () => {
		const r = mount(TitleAttr, { v: 'Tip!' });
		const el = r.find('#ti') as HTMLElement;
		expect(el.title).toBe('Tip!');
		expect(el.getAttribute('title')).toBe('Tip!');
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:49 — should set values as attributes if
	// necessary. (React's `.role === undefined` assertion is a jsdom-version
	// artifact — ARIA property reflection varies by environment — so only the
	// attribute outcome is pinned.)
	it('role is written as an attribute', () => {
		const r = mount(RoleAttr, { v: '#' });
		expect(r.find('#ro').getAttribute('role')).toBe('#');
		r.unmount();
	});

	// DOMPropertyOperations-test.js:59 (namespaced xlink:href via setAttributeNS)
	// — COVERED BY EXISTING conformance/svg-attributes.test.ts ('xlink:href={null}
	// removes the attribute' + spread variant assert namespaceURI === XLINK_NS).

	// Per DOMPropertyOperations-test.js:76 — should set values as boolean
	// properties (the dynamic true/false/null/undefined transitions).
	it('boolean attribute transitions: true ↔ false/null/undefined', () => {
		const r = mount(BoolDisabled, { v: true });
		const el = r.find('#bd');
		expect(el.getAttribute('disabled')).toBe('');
		r.update(BoolDisabled, { v: false });
		expect(el.getAttribute('disabled')).toBe(null);
		r.update(BoolDisabled, { v: true });
		r.update(BoolDisabled, { v: null });
		expect(el.getAttribute('disabled')).toBe(null);
		r.update(BoolDisabled, { v: true });
		r.update(BoolDisabled, { v: undefined });
		expect(el.getAttribute('disabled')).toBe(null);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:76 (string half) — React normalizes
	// `disabled="disabled"` to the canonical empty-string attribute via its
	// known-attribute table.
	// INTENTIONAL DIVERGENCE (adjudicated 2026-07-04): octane writes the string
	// verbatim — `disabled="disabled"` — which is a FUNCTIONALLY IDENTICAL DOM
	// state (any value = true for a boolean attribute) and exactly what the
	// hand-written markup would contain. No normalization table by design.
	it('passes a truthy string on a boolean attribute through verbatim', () => {
		const r = mount(BoolDisabled, { v: 'disabled' });
		const el = r.find('#bd') as HTMLButtonElement;
		expect(el.getAttribute('disabled')).toBe('disabled');
		expect(el.disabled).toBe(true); // same platform state React produces
		r.unmount();
	});

	// DOMPropertyOperations-test.js:107 (className object with toString →
	// 'css-class') — NOT PORTED: intentional divergence. octane composes
	// class/className clsx-style (an object contributes its truthy KEYS), per
	// docs/react-parity-migration-plan.md §2; pinned in tests/clsx-class.test.ts.

	// Per DOMPropertyOperations-test.js:124 — should not remove empty attributes
	// for special input properties. Uncontrolled half only (§2): the `value=""`
	// ATTRIBUTE stays present and the DOM property reads ''.
	it('input value="" keeps the empty attribute', () => {
		const r = mount(InputEmptyValue, { v: '' });
		const el = r.find('#iv') as HTMLInputElement;
		expect(el.getAttribute('value')).toBe('');
		expect(el.value).toBe('');
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:138 — should not remove empty attributes
	// for special option properties (regression for facebook/react#6219).
	it('option value="" reads as "" and a valueless option falls back to its text', () => {
		const r = mount(OptionValues);
		const sel = r.find('#sel') as HTMLSelectElement;
		expect((sel.firstChild as HTMLOptionElement).value).toBe('');
		expect((sel.lastChild as HTMLOptionElement).value).toBe('filled');
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:154 — should remove for falsey boolean
	// properties (+ the true half for symmetry).
	it('allowFullScreen={false} never lands in the DOM', () => {
		const r = mount(AllowFullScreen, { v: false });
		const el = r.find('#ifs');
		expect(el.hasAttribute('allowFullScreen')).toBe(false);
		r.update(AllowFullScreen, { v: true });
		expect(el.getAttribute('allowfullscreen')).toBe('');
		r.update(AllowFullScreen, { v: false });
		expect(el.hasAttribute('allowFullScreen')).toBe(false);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:163 — should remove when setting custom
	// attr to null
	it('data-foo removes on null', () => {
		const r = mount(DataFoo, { v: 'bar' });
		const el = r.find('#df');
		expect(el.hasAttribute('data-foo')).toBe(true);
		r.update(DataFoo, { v: null });
		expect(el.hasAttribute('data-foo')).toBe(false);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:176 — should set className to empty string
	// instead of null (property half — matches).
	it('className null reads back as "" from the property', () => {
		const r = mount(ClassNullable, { cls: 'selected' });
		const el = r.find('#cl') as HTMLElement;
		expect(el.className).toBe('selected');
		r.update(ClassNullable, { cls: null });
		expect(el.className).toBe('');
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:176 (attribute half) — React removes the
	// `class` attribute entirely on null; octane's setClassName assigns
	// `el.className = ''`, which leaves an EMPTY `class=""` attribute behind.
	// GAP: setClassName (runtime.ts) should removeAttribute('class') when the
	// composed class is empty — the spread/de-opt removal path already does
	// exactly that via removeHostProp ("never leave class=''", pinned in
	// tests/prop-removal.test.ts), so the direct-binding null path is the odd one out.
	it('className null removes the class attribute', () => {
		const r = mount(ClassNullable, { cls: 'selected' });
		const el = r.find('#cl');
		r.update(ClassNullable, { cls: null });
		const v = el.getAttribute('class');
		r.unmount();
		expect(v).toBe(null);
	});

	// Per DOMPropertyOperations-test.js:192 — should remove property properly for
	// boolean properties (`hidden`)
	it('hidden true → present, false → removed', () => {
		const r = mount(HiddenAttr, { v: true });
		const el = r.find('#hd');
		expect(el.hasAttribute('hidden')).toBe(true);
		r.update(HiddenAttr, { v: false });
		expect(el.hasAttribute('hidden')).toBe(false);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:205 — should always assign the value
	// attribute for non-inputs (<progress> value goes through setAttribute, never
	// the .value property).
	it('progress value is always assigned as an attribute', () => {
		const r = mount(ProgressValue, { v: undefined });
		const el = r.find('#pv');
		const spy = vi.spyOn(el, 'setAttribute');
		r.update(ProgressValue, { v: 30 });
		r.update(ProgressValue, { v: '30' });
		expect(spy).toHaveBeenCalledTimes(2);
		expect(el.getAttribute('value')).toBe('30');
		spy.mockRestore();
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:221 — should return the progress to
	// intermediate state on null value (regression for facebook/react#6119).
	it('progress value={null} removes the attribute (indeterminate)', () => {
		const r = mount(ProgressValue, { v: 30 });
		const el = r.find('#pv');
		expect(el.getAttribute('value')).toBe('30');
		r.update(ProgressValue, { v: null });
		expect(el.hasAttribute('value')).toBe(false);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:1352 — should remove attributes for normal
	// properties (a prop present last render and absent this render → spread path).
	it('title removes when the prop disappears (spread)', () => {
		const r = mount(UnknownSpread, { sp: { title: 'foo' } });
		const el = r.find('#us');
		expect(el.getAttribute('title')).toBe('foo');
		r.update(UnknownSpread, { sp: {} });
		expect(el.getAttribute('title')).toBe(null);
		r.unmount();
	});

	// DOMPropertyOperations-test.js:1365 ('should not remove attributes for
	// special properties' — controlled input value re-assertion) — NOT PORTED:
	// intentional divergence (§2 controlled components / synthetic onChange).
});

describe('DOMPropertyOperations — custom elements', () => {
	// Per DOMPropertyOperations-test.js:1398 — should not remove attributes for
	// custom component tag
	it('static attribute on a custom tag passes through', () => {
		const r = mount(CustomElStatic);
		expect(r.find('#mi').getAttribute('size')).toBe('5px');
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:1107 — boolean props should not be
	// stringified in attributes (custom elements): true → "", false → removed.
	it('boolean props on custom elements: true → "", false → removed', () => {
		const r = mount(CustomElFoo, { foo: true });
		const el = r.find('#ce');
		expect(el.getAttribute('foo')).toBe('');
		r.update(CustomElFoo, { foo: false });
		expect(el.getAttribute('foo')).toBe(null);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:322 — custom elements shouldnt have
	// non-functions for on* attributes treated as event listeners.
	it('non-function lowercase on* props land as plain attributes', () => {
		const r = mount(CustomElOnAttrs, {
			onstring: 'hello',
			onobj: { hello: 'world' },
			onarray: ['one', 'two'],
			ontrue: true,
			onfalse: false,
		});
		const el = r.find('#ceoa');
		expect(el.getAttribute('onstring')).toBe('hello');
		expect(el.getAttribute('onobj')).toBe('[object Object]');
		expect(el.getAttribute('onarray')).toBe('one,two');
		expect(el.getAttribute('ontrue')).toBe('');
		expect(el.getAttribute('onfalse')).toBe(null);
		// Dispatch the corresponding event names to make sure nothing crashes.
		el.dispatchEvent(new Event('string'));
		el.dispatchEvent(new Event('obj'));
		el.dispatchEvent(new Event('array'));
		el.dispatchEvent(new Event('true'));
		el.dispatchEvent(new Event('false'));
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:235 — custom element custom events
	// lowercase. React 19 attaches a real `customevent` listener when a custom
	// element receives a function-valued lowercase on* prop; octane routes every
	// lowercase on* name to setAttribute (its delegated-event system only handles
	// React-shape `onXxx` props), so no listener exists and the handler never
	// fires (the function value is now guarded and removed, so no attribute is
	// written either).
	// GAP (deferred — needs a maintainer decision on React-19 custom-element
	// semantics): no custom-element event-listener path — eventSlot/isEventKey
	// (runtime.ts) require the React `on[A-Z]` shape. Representative pin for the
	// whole custom-element custom-event family (see the skip list below).
	it.fails('function-valued lowercase on* on a custom element attaches a listener', () => {
		const handler = vi.fn();
		const r = mount(CustomElCustomEvent, { handler });
		r.find('#cel').dispatchEvent(new Event('customevent'));
		r.unmount();
		expect(handler).toHaveBeenCalledTimes(1);
	});

	// Per DOMPropertyOperations-test.js:351 — custom elements should still have
	// onClick treated like regular elements. octane's handler receives the NATIVE
	// event (no synthetic wrapper), so the `.nativeEvent` unwrap becomes an
	// identity check.
	it('onClick on a custom element behaves like a regular element', () => {
		let octaneEvent: Event | null = null;
		const onClick = vi.fn((e: Event) => (octaneEvent = e));
		const r = mount(CustomElClick, { onClick });
		const el = r.find('#cec') as HTMLElement;
		let nativeEvent: Event | null = null;
		const nativeHandler = vi.fn((e: Event) => (nativeEvent = e));
		el.onclick = nativeHandler;
		r.click('#cec');
		expect(nativeHandler).toHaveBeenCalledTimes(1);
		expect(onClick).toHaveBeenCalledTimes(1);
		expect(octaneEvent).toBe(nativeEvent);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:378 — custom elements should have working
	// onChange event listeners (native `change`, remove + re-add).
	it('onChange on a custom element: fires, removes, re-adds', () => {
		let seen: Event | null = null;
		const handler = vi.fn((e: Event) => (seen = e));
		const r = mount(CustomElChangeInput, { onChange: handler });
		const el = r.find('#cci');
		const changeEvent = new Event('change', { bubbles: true });
		el.dispatchEvent(changeEvent);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(seen).toBe(changeEvent); // octane hands over the native event itself

		r.update(CustomElChangeInput, { onChange: undefined });
		expect(r.find('#cci')).toBe(el); // same element — no remount
		el.dispatchEvent(new Event('change', { bubbles: true }));
		expect(handler).toHaveBeenCalledTimes(1);

		r.update(CustomElChangeInput, { onChange: handler });
		el.dispatchEvent(new Event('change', { bubbles: true }));
		expect(handler).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:410 — custom elements should have working
	// onInput event listeners (native `input`, remove + re-add).
	it('onInput on a custom element: fires, removes, re-adds', () => {
		let seen: Event | null = null;
		const handler = vi.fn((e: Event) => (seen = e));
		const r = mount(CustomElChangeInput, { onInput: handler });
		const el = r.find('#cci');
		const inputEvent = new Event('input', { bubbles: true });
		el.dispatchEvent(inputEvent);
		expect(handler).toHaveBeenCalledTimes(1);
		expect(seen).toBe(inputEvent);

		r.update(CustomElChangeInput, { onInput: undefined });
		el.dispatchEvent(new Event('input', { bubbles: true }));
		expect(handler).toHaveBeenCalledTimes(1);

		r.update(CustomElChangeInput, { onInput: handler });
		el.dispatchEvent(new Event('input', { bubbles: true }));
		expect(handler).toHaveBeenCalledTimes(2);
		r.unmount();
	});

	// Per DOMPropertyOperations-test.js:442 — custom elements should have separate
	// onInput and onChange handling.
	it('onInput and onChange stay independent on a custom element', () => {
		const onInput = vi.fn();
		const onChange = vi.fn();
		const r = mount(CustomElChangeInput, { onInput, onChange });
		const el = r.find('#cci');
		el.dispatchEvent(new Event('input', { bubbles: true }));
		expect(onInput).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledTimes(0);
		el.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onInput).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenCalledTimes(1);
		r.unmount();
	});

	/* Accounting — DOMPropertyOperations custom-element cases NOT ported:
	 *  - :251 (uppercase onCustomevent), :267 (dashed oncustom-event),
	 *    :283 (remove custom-event handler), :467 (remove/re-add custom-event
	 *    listeners), :975 (custom events with capture listeners), :1126
	 *    (handlers alternating string ↔ function) → all share the ONE root gap
	 *    pinned by the :235 it.fails above: octane has no custom-element
	 *    event-listener path for arbitrary lowercase on* props (delegation-only,
	 *    React-shape `on[A-Z]` names). Porting each would add five more red
	 *    variants of the same pin.
	 *  - :493, :586, :670 (`<input is=…>` etc. onChange matrix), :748, :829,
	 *    :866, :903, :940 (simulated-change targeting matrix) → intentional
	 *    divergence (§2): React's SYNTHETIC onChange simulation (input→change
	 *    promotion on form controls, change suppressed on divs). octane fires
	 *    native delegated events only.
	 *  - :999 (innerHTML), :1018 (innerText), :1037 (textContent) on custom
	 *    elements → octane has no unknown-prop blocklist; a bare `innerHTML` prop
	 *    is a PLAIN ATTRIBUTE by design (never content) — pinned in
	 *    tests/danger-html.test.ts ('bare `innerHTML` is NOT raw HTML'). The
	 *    "no children created" outcome matches React; the attribute-suppression
	 *    half is the documented no-blocklist divergence.
	 *  - :1056, :1179, :1238, :1264, :1301, :1407 → React-19 custom-element
	 *    PROPERTY semantics (`in`-heuristic property assignment, undefined-to-
	 *    restore-defaults). octane always writes attributes — the attribute-side
	 *    outcomes are pinned by :322/:1107/:1398 above.
	 *  - :1322 (popoverTarget={HTMLElement} warning) → DEV-warning-only case.
	 */
});

describe('empty-string URL attributes (ReactDOMComponent-test.js core)', () => {
	// Per ReactDOMComponent-test.js:558 — should not set null/undefined attributes
	it('src/data-foo null and undefined never land in the DOM', () => {
		const r = mount(ImgSrc, { src: null });
		const el = r.find('#im');
		expect(el.hasAttribute('src')).toBe(false);
		r.update(ImgSrc, { src: undefined });
		expect(el.hasAttribute('src')).toBe(false);
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:594 — should not add an empty src attribute.
	// React 19 removes `src=""` (dev + prod) so the browser can't re-download the
	// page; octane's native setAttribute writes the empty string verbatim.
	// GAP: setAttribute (runtime.ts) has no per-attribute empty-string policy for
	// src/href (React strips "" on `src` everywhere and on `href` except <a>).
	it('img src="" is not added (React strips it)', () => {
		const r = mount(ImgSrc, { src: '' });
		const el = r.find('#im');
		const afterEmpty = el.hasAttribute('src');
		// Round-trip: a real value applies, and going back to '' strips again.
		r.update(ImgSrc, { src: 'abc' });
		const afterValue = el.hasAttribute('src');
		r.update(ImgSrc, { src: '' });
		const afterEmptyAgain = el.hasAttribute('src');
		r.unmount();
		expect(afterEmpty).toBe(false);
		expect(afterValue).toBe(true);
		expect(afterEmptyAgain).toBe(false);
	});

	// Per ReactDOMComponent-test.js:628 — should not add an empty href attribute.
	// NB: octane hoists <link> to document.head (head-singleton support), so the
	// element is queried there, not in the mount container.
	it('link href="" is not added (React strips it)', () => {
		const r = mount(LinkHref, { href: '' });
		const ln = document.getElementById('ln');
		expect(ln).not.toBe(null);
		const has = ln!.hasAttribute('href');
		r.unmount();
		expect(has).toBe(false);
	});

	// Per ReactDOMComponent-test.js:660 — should allow an empty href attribute on
	// anchors.
	it('a href="" keeps the empty attribute', () => {
		const r = mount(AnchorHref, { href: '' });
		expect(r.find('#an').getAttribute('href')).toBe('');
		r.unmount();
	});

	// Per ReactDOMComponent-test.js:670 — should allow an empty action attribute.
	it('form action="" keeps the empty attribute', () => {
		const r = mount(FormAction, { action: '' });
		const el = r.find('#fa');
		expect(el.getAttribute('action')).toBe('');
		r.update(FormAction, { action: 'abc' });
		expect(el.hasAttribute('action')).toBe(true);
		r.update(FormAction, { action: '' });
		expect(el.getAttribute('action')).toBe('');
		r.unmount();
	});
});

describe('enumerated + overloaded boolean attributes', () => {
	// Per ReactDOMComponent-test.js:3569 + :3582 — stringifies the boolean
	// true/false for allowed (enumerated) attributes. React renders
	// spellCheck={true} → "true" and spellCheck={false} → "false" (an EXPLICIT
	// false — removing the attribute means "inherit", a different behavior);
	// octane renders ""/removed.
	// GAP: setAttribute (runtime.ts) special-cases only aria-* as enumerated;
	// contentEditable/spellCheck/draggable need the same 'true'/'false'
	// stringification for functional parity (removed ≠ "false" for these).
	it('spellCheck stringifies true/false to "true"/"false"', () => {
		const r = mount(SpellCheck, { v: true });
		const el = r.find('#sc');
		const whenTrue = el.getAttribute('spellcheck');
		r.update(SpellCheck, { v: false });
		const whenFalse = el.getAttribute('spellcheck');
		r.unmount();
		expect(whenTrue).toBe('true');
		expect(whenFalse).toBe('false');
	});

	// Overloaded boolean (`download`) — React's attribute table: true → bare
	// attribute, false → removed, string → the string. octane's generic handling
	// produces the identical matrix. (No standalone `it` in the three ported
	// files; behavior per the react-dom attribute table / task brief.)
	it('download: true → "", false → removed, string → string', () => {
		const r = mount(DownloadAttr, { v: true });
		const el = r.find('#dl');
		expect(el.getAttribute('download')).toBe('');
		r.update(DownloadAttr, { v: false });
		expect(el.hasAttribute('download')).toBe(false);
		r.update(DownloadAttr, { v: 'file.txt' });
		expect(el.getAttribute('download')).toBe('file.txt');
		r.unmount();
	});
});

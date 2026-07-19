import { describe, it, expect, vi } from 'vitest';
import { mount } from '../_helpers';
import {
	UnknownAttr,
	UnknownSpread,
	StaticInvalidBooleans,
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
	AutoFocusInput,
	AutoFocusBare,
} from './_fixtures/dom-attributes.tsrx';

// ============================================================================
// HTML attribute matrix — ports of the latest ReactDOMAttribute-test.js and
// DOMPropertyOperations-test.js, plus the empty-string src/href/action +
// enumerated-attribute core from ReactDOMComponent-test.js.
//
// Scope notes (per docs/react-parity-migration-plan.md §2):
//  - controlled `value`/`checked` are SUPPORTED since 2026-07-08 (React
//    semantics on native events; see tests/conformance/controlled-*.test.ts).
//    Synthetic onChange remains an INTENTIONAL divergence — change-timing
//    cases are not ported.
//  - class/className composes clsx-style (intentional divergence) — React's
//    coercion cases are not ported.
//  - Existing Octane DEV warnings are asserted exactly; cases whose warning is
//    not implemented still call out their functional-only coverage locally.
// ============================================================================

const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

function expectDevError(error: ReturnType<typeof vi.spyOn>, message: string): void {
	expect(error.mock.calls).toEqual(PROD_COMPILE ? [] : [[message]]);
}

describe('ReactDOMAttribute — unknown attributes', () => {
	it('warns for static true and false values on non-boolean attributes', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(StaticInvalidBooleans);
		try {
			const el = r.find('#static-invalid-booleans');
			expect(el.hasAttribute('title')).toBe(false);
			expect(el.hasAttribute('alt')).toBe(false);
			expect(el.getAttribute('data-ready')).toBe('true');
			expect(el.getAttribute('aria-hidden')).toBe('true');
			expect(el.getAttribute('hidden')).toBe('');
			expect(error.mock.calls).toEqual(
				PROD_COMPILE
					? []
					: [
							[
								'Received `true` for a non-boolean attribute `title`. ' +
									'If you want to write it to the DOM, pass a string instead: ' +
									'title="true" or title={value.toString()}.',
							],
							[
								'Received `false` for a non-boolean attribute `alt`. ' +
									'If you used to conditionally omit it with alt={condition && value}, ' +
									'pass alt={condition ? value : undefined} instead.',
							],
						],
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

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

	// Per latest ReactDOMAttribute-test.js:67 — "changes values true, false to
	// null, and also warns once" (false variant). Octane preserves the actionable
	// condition-to-ternary guidance without React's component-stack suffix.
	it('removes an unknown attribute set to false and warns in development', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownSpread, { sp: { conditionalvalue: 'something' } });
		try {
			const el = r.find('#us');
			r.update(UnknownSpread, { sp: { conditionalvalue: false } });
			expect(el.hasAttribute('conditionalvalue')).toBe(false);
			expectDevError(
				error,
				'Received `false` for a non-boolean attribute `conditionalvalue`. ' +
					'If you used to conditionally omit it with conditionalvalue={condition && value}, ' +
					'pass conditionalvalue={condition ? value : undefined} instead.',
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	// Per latest ReactDOMAttribute-test.js:67 — "changes values true, false to
	// null, and also warns once" (true variant). Booleans never write on
	// non-boolean attributes; boolean attrs retain presence semantics.
	it('removes an unknown attribute set to true and warns in development', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownAttr, { value: 'something' });
		try {
			const el = r.find('#u');
			r.update(UnknownAttr, { value: true });
			expect(el.hasAttribute('unknown')).toBe(false);
			expectDevError(
				error,
				'Received `true` for a non-boolean attribute `unknown`. ' +
					'If you want to write it to the DOM, pass a string instead: ' +
					'unknown="true" or unknown={value.toString()}.',
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
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
	// boolean-prop JS semantics) and removes the attribute. Matched since
	// 2026-07-08 (reverses the 2026-07-04 native-write adjudication): `inert`
	// sits in the shared boolean-attr table (constants.ts), so any falsy value
	// ('' included) removes and any truthy value renders `inert=""`.
	it('inert="" removes the attribute (boolean-prop coercion)', () => {
		const r = mount(BoolInert, { v: '' });
		expect(r.find('#bi').hasAttribute('inert')).toBe(false);
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

	// Per latest ReactDOMAttribute-test.js:140 — coerces NaN to a string and
	// warns with explicit-cast guidance.
	it('coerces NaN to the string "NaN" and warns in development', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownSpread, { sp: { nanvalue: NaN } });
		try {
			expect(r.find('#us').getAttribute('nanvalue')).toBe('NaN');
			expectDevError(
				error,
				'Received NaN for the `nanvalue` attribute. If this is expected, cast the value to a string.',
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	// Per latest ReactDOMAttribute-test.js:149 — "coerces objects to strings and
	// warns". Octane warns only for the ambiguous Object.prototype.toString case;
	// an object with a meaningful custom toString remains silent.
	it('coerces objects to strings and warns only for plain object coercion', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownSpread, { sp: { objectvalue: { hello: 'world' } } });
		try {
			const el = r.find('#us');
			expect(el.getAttribute('objectvalue')).toBe('[object Object]');
			expectDevError(
				error,
				'The provided `objectvalue` attribute is an object; it will stringify to ' +
					'"[object Object]". Pass a string (or a value with a meaningful toString) instead.',
			);

			error.mockClear();
			r.update(UnknownSpread, {
				sp: {
					objectvalue: {
						toString() {
							return 'lol';
						},
					},
				},
			});
			expect(el.getAttribute('objectvalue')).toBe('lol');
			expect(error).not.toHaveBeenCalled();
		} finally {
			error.mockRestore();
			r.unmount();
		}
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

	// Per latest ReactDOMAttribute-test.js:182 — symbols are invalid attribute
	// values. They are removed and share the actionable invalid-value warning.
	it('removes symbols and warns in development', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownSpread, { sp: { symbolvalue: 'something' } });
		try {
			const el = r.find('#us');
			r.update(UnknownSpread, { sp: { symbolvalue: Symbol('foo') } });
			expect(el.hasAttribute('symbolvalue')).toBe(false);
			expectDevError(
				error,
				'Invalid value for prop `symbolvalue` on <div> tag. ' +
					'Either remove it from the element, or pass a string or number value to keep it in the DOM.',
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	// Per latest ReactDOMAttribute-test.js:192 — functions are invalid attribute
	// values. Their source text must never leak into the DOM.
	it('removes functions and warns in development', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownSpread, { sp: { functionvalue: 'something' } });
		try {
			const el = r.find('#us');
			r.update(UnknownSpread, { sp: { functionvalue: function someFunction() {} } });
			expect(el.hasAttribute('functionvalue')).toBe(false);
			expectDevError(
				error,
				'Invalid value for prop `functionvalue` on <div> tag. ' +
					'Either remove it from the element, or pass a string or number value to keep it in the DOM.',
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
	});

	// ReactDOMUnknownPropertyHook's `warnedProperties` object lives at module
	// scope, not on a root. Two independently-created roots therefore share the
	// once-per-prop diagnostic lifetime.
	it('deduplicates an invalid attribute warning across independent roots', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const first = mount(UnknownSpread, { sp: { globaldedupe: Symbol('first') } });
		const second = mount(UnknownSpread, { sp: { globaldedupe: Symbol('second') } });
		try {
			expectDevError(
				error,
				'Invalid value for prop `globaldedupe` on <div> tag. ' +
					'Either remove it from the element, or pass a string or number value to keep it in the DOM.',
			);
		} finally {
			error.mockRestore();
			first.unmount();
			second.unmount();
		}
	});

	// Per latest ReactDOMComponent-test.js invalid-event-name case. Octane's
	// native delegated model preserves the same camelCase repair while explaining
	// why lowercase on* attributes are never written.
	it('drops a lowercase function event prop and suggests the delegated spelling', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(UnknownSpread, { sp: { onclick: () => undefined } });
		try {
			expect(r.find('#us').hasAttribute('onclick')).toBe(false);
			expectDevError(
				error,
				'Unknown event handler property `onclick` was dropped — did you mean `onClick`? ' +
					'(lowercase on* attributes never write; octane delegates camelCase handlers natively)',
			);
		} finally {
			error.mockRestore();
			r.unmount();
		}
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
	// boolean-attr table. Matched since 2026-07-08 (reverses the 2026-07-04
	// verbatim-write adjudication): any truthy value on a boolean attribute
	// renders `disabled=""` — client, SSR, and static bake agree byte-for-byte.
	it('normalizes a truthy string on a boolean attribute to ""', () => {
		const r = mount(BoolDisabled, { v: 'disabled' });
		const el = r.find('#bd') as HTMLButtonElement;
		expect(el.getAttribute('disabled')).toBe('');
		expect(el.disabled).toBe(true); // same platform state React produces
		r.unmount();
	});

	// DOMPropertyOperations-test.js:107 (className object with toString →
	// 'css-class') — NOT PORTED: intentional divergence. octane composes
	// class/className clsx-style (an object contributes its truthy KEYS), per
	// docs/react-parity-migration-plan.md §2; pinned in tests/clsx-class.test.ts.

	// Per DOMPropertyOperations-test.js:124 — should not remove empty attributes
	// for special input properties. `value=""` is CONTROLLED (2026-07-08): the
	// mount syncs the value ATTRIBUTE from the prop (React's attribute-syncing
	// cascade), so it stays present and the DOM property reads ''.
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
	// element receives a function-valued lowercase on* prop. Octane's custom-
	// element path now attaches the same listener; this is representative
	// executable coverage for the wider custom-event family below.
	it('function-valued lowercase on* on a custom element attaches a listener', () => {
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
	 *    (handlers alternating string ↔ function) → covered at the behavior seam
	 *    by the passing :235 representative above; port each matrix variant only
	 *    when its distinct add/remove/capture behavior needs dedicated coverage.
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

describe('autoFocus — commit-phase focus, never an attribute (React parity, 2026-07-08)', () => {
	// Per ReactDOMComponent's autoFocus handling: React writes NO attribute and
	// calls .focus() at commitMount. octane queues the focus into the commit
	// (drained before layout effects, so a layout effect moving focus wins).
	it('focuses the element at mount commit and writes no attribute', () => {
		const r = mount(AutoFocusBare);
		const el = r.find('#afb') as HTMLInputElement;
		expect(el.hasAttribute('autofocus')).toBe(false);
		expect(document.activeElement).toBe(el);
		r.unmount();
	});

	it('a falsy autoFocus neither focuses nor writes', () => {
		const r = mount(AutoFocusInput, { v: false });
		const el = r.find('#afi') as HTMLInputElement;
		expect(el.hasAttribute('autofocus')).toBe(false);
		expect(document.activeElement).not.toBe(el);
		// autoFocus is mount-only (React ignores later changes).
		r.update(AutoFocusInput, { v: true });
		expect(document.activeElement).not.toBe(el);
		r.unmount();
	});
});

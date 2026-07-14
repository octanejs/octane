import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '../_helpers';
import {
	ControlledInput,
	AcceptingInput,
	BailingInput,
	DigitsInput,
	NumberInput,
	Checkbox,
	RadioGroup,
	MaybeControlled,
	DefaultsInput,
	DefaultsCheckbox,
	SpreadInput,
} from './_fixtures/controlled-forms.tsrx';

// The dev warnings asserted below are gated on the dev-compile `__oct_loc`
// stamp (silent in prod output, like React's prod bundle) — the octane-prod
// vitest project compiles fixtures in prod mode and sets this env marker.
const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

// ============================================================================
// Controlled <input> — ports of ReactDOMInput-test.js (React v19.2.7) and the
// restore half of ReactControlledComponent-test.js. Controlled components are
// SUPPORTED since 2026-07-08 on NATIVE events: `onInput` is the per-keystroke
// handler (no synthetic `onChange`; native change fires on blur/commit).
//
// Edits are driven the way the browser produces them: mutate the DOM value,
// then dispatch a bubbling native event — it flows through the real delegated
// dispatch, the discrete flush, and the controlled restore pass.
// ============================================================================

afterEach(() => {
	vi.restoreAllMocks();
});

function type(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
	el.value = text;
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('conformance: controlled <input> value', () => {
	// Per ReactDOMInput-test.js:1355 ('should control a value in reentrant
	// events' family) — the mount writes both the property and the value
	// ATTRIBUTE (React's attribute-syncing cascade).
	it('mount writes the property and mirrors the value attribute', () => {
		const r = mount(ControlledInput, { value: 'hello' });
		const el = r.find('#ci') as HTMLInputElement;
		expect(el.value).toBe('hello');
		expect(el.getAttribute('value')).toBe('hello');
		r.unmount();
	});

	// Per ReactControlledComponent-test.js:59 ('should restore controlled
	// inputs after a change event with no handler').
	it('reverts an edit when nothing handles it', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {}); // missing-onInput dev warning
		const r = mount(ControlledInput, { value: 'locked' });
		const el = r.find('#ci') as HTMLInputElement;
		type(el, 'lockedX');
		expect(el.value).toBe('locked');
		r.unmount();
	});

	// The handler HEARS the typed value before the restore reverts it (React:
	// the event fires against the drifted DOM, then the commit reasserts).
	it('the rejecting handler sees the typed value; the DOM snaps back', () => {
		const seen: string[] = [];
		const r = mount(ControlledInput, {
			value: 'locked',
			onInput: (e: Event) => seen.push((e.target as HTMLInputElement).value),
		});
		const el = r.find('#ci') as HTMLInputElement;
		type(el, 'lockedX');
		expect(seen).toEqual(['lockedX']);
		expect(el.value).toBe('locked');
		r.unmount();
	});

	// Per ReactDOMInput-test.js (accepting handler) — setState from onInput
	// commits synchronously in the discrete flush; the restore then compares
	// equal and the typed value sticks. The value ATTRIBUTE tracks the prop.
	it('an accepting onInput keeps the typed value and syncs the attribute', () => {
		const r = mount(AcceptingInput, { initial: 'a' });
		const el = r.find('#ai') as HTMLInputElement;
		type(el, 'ab');
		expect(el.value).toBe('ab');
		expect(el.getAttribute('value')).toBe('ab');
		r.unmount();
	});

	// Per ReactControlledComponent-test.js — an Object.is-equal setState
	// schedules NO render; the restore alone must revert the DOM.
	it('an Object.is-bailing setState still reverts the edit', () => {
		const r = mount(BailingInput, { initial: 'locked' });
		const el = r.find('#bi') as HTMLInputElement;
		type(el, 'lockedX');
		expect(el.value).toBe('locked');
		r.unmount();
	});

	// The classic filtered input: the handler transforms, the DOM converges on
	// the transformed value within the same discrete dispatch.
	it('a filtering onInput leaves the DOM at the filtered value', () => {
		const r = mount(DigitsInput);
		const el = r.find('#di') as HTMLInputElement;
		type(el, 'a1b2');
		expect(el.value).toBe('12');
		r.unmount();
	});

	// Programmatic writes OUTSIDE any event stick until the owning block next
	// renders — then the per-commit reassert restores the rendered value.
	it('programmatic writes stick until the next commit reasserts', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'v1' });
		const el = r.find('#ci') as HTMLInputElement;
		el.value = 'drifted';
		expect(el.value).toBe('drifted'); // no event, no restore
		r.update(ControlledInput, { value: 'v1' }); // unrelated re-render
		expect(el.value).toBe('v1'); // reassert caught the drift
		r.unmount();
	});
});

describe('conformance: number input compare rule', () => {
	// Per ReactDOMInput-test.js:390 ('should not incur unnecessary DOM
	// mutations for numeric type conversion') — rendered 1 vs DOM "1.0"
	// compares LOOSELY against the raw prop, so mid-edit text survives.
	it('does not clobber "1.0" when the rendered value is 1', () => {
		const r = mount(NumberInput, {
			value: 1,
			onInput: () => {}, // hears the edit, keeps rendered value at 1
		});
		const el = r.find('#ni') as HTMLInputElement;
		type(el, '1.0');
		expect(el.value).toBe('1.0'); // '1.0' == 1 → no write
		r.unmount();
	});

	// Per ReactDOMInput-test.js:435 — value={0} vs an empty DOM writes "0"
	// (the loose rule's explicit exception).
	it('writes "0" over an emptied number input', () => {
		const r = mount(NumberInput, { value: 0, onInput: () => {} });
		const el = r.find('#ni') as HTMLInputElement;
		type(el, '');
		expect(el.value).toBe('0');
		r.unmount();
	});
});

describe('conformance: controlled checkbox / radio', () => {
	// Per ReactControlledComponent-test.js:100 ('should restore controlled
	// checkboxes...') — the platform toggles on click; a handler that doesn't
	// commit the toggle sees it reverted before the browser regains control.
	it('a rejected checkbox click snaps back', () => {
		const r = mount(Checkbox, { initial: false, accept: false });
		const el = r.find('#cb') as HTMLInputElement;
		r.click('#cb');
		expect(el.checked).toBe(false);
		r.unmount();
	});

	it('an accepted checkbox click sticks', () => {
		const r = mount(Checkbox, { initial: false, accept: true });
		const el = r.find('#cb') as HTMLInputElement;
		r.click('#cb');
		expect(el.checked).toBe(true);
		r.unmount();
	});

	// The checked ATTRIBUTE mirrors only the INITIAL state (React with
	// attribute-syncing never updates it afterwards).
	it('checked updates never touch the attribute', () => {
		const r = mount(Checkbox, { initial: true, accept: true });
		const el = r.find('#cb') as HTMLInputElement;
		expect(el.hasAttribute('checked')).toBe(true);
		r.click('#cb'); // → unchecked, accepted
		expect(el.checked).toBe(false);
		expect(el.hasAttribute('checked')).toBe(true); // attribute untouched
		r.unmount();
	});

	// Per ReactDOMInput-test.js radio-group cases + React's updateNamedCousins:
	// clicking radio B natively unchecks A; a rejected pick must restore BOTH.
	it('a rejected radio pick restores the whole group', () => {
		const r = mount(RadioGroup, { initial: 'a', accept: false });
		const ra = r.find('#ra') as HTMLInputElement;
		const rb = r.find('#rb') as HTMLInputElement;
		expect(ra.checked).toBe(true);
		r.click('#rb'); // platform: rb=true, ra=false
		expect(rb.checked).toBe(false); // restored
		expect(ra.checked).toBe(true); // cousin restored
		r.unmount();
	});

	it('an accepted radio pick moves the group', () => {
		const r = mount(RadioGroup, { initial: 'a', accept: true });
		const ra = r.find('#ra') as HTMLInputElement;
		const rb = r.find('#rb') as HTMLInputElement;
		r.click('#rb');
		expect(rb.checked).toBe(true);
		expect(ra.checked).toBe(false);
		r.unmount();
	});
});

describe('conformance: controlled ↔ uncontrolled transitions', () => {
	// Per ReactDOMInput-test.js:1471 ('should warn if controlled input switches
	// to uncontrolled') — the DOM keeps its value; dev warns.
	it('controlled → uncontrolled keeps the DOM value and dev-warns', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(MaybeControlled, { value: 'a' });
		const el = r.find('#mc') as HTMLInputElement;
		errSpy.mockClear(); // ignore the mount-time missing-onInput warning
		r.update(MaybeControlled, { value: null });
		expect(el.value).toBe('a');
		if (!PROD_COMPILE) {
			if (!PROD_COMPILE) {
				expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('to be uncontrolled'));
			}
		}
		r.unmount();
	});

	// Per ReactDOMInput-test.js:1512 ('should warn if uncontrolled input
	// switches to controlled') — the new value writes; dev warns.
	it('uncontrolled → controlled writes the value and dev-warns', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(MaybeControlled, { value: null });
		const el = r.find('#mc') as HTMLInputElement;
		type(el, 'typed'); // uncontrolled: sticks
		expect(el.value).toBe('typed');
		errSpy.mockClear();
		r.update(MaybeControlled, { value: 'b' });
		expect(el.value).toBe('b');
		if (!PROD_COMPILE) {
			expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('to be controlled'));
		}
		r.unmount();
	});
});

describe('conformance: defaultValue / defaultChecked (uncontrolled)', () => {
	// Per ReactDOMInput-test.js:900 ('should render defaultValue for SSR' /
	// defaultValue family) — the default writes the ATTRIBUTE; typing is
	// user-owned and survives re-renders.
	it('defaultValue seeds the value; typing sticks across re-renders', () => {
		const r = mount(DefaultsInput, { dv: 'seed' });
		const el = r.find('#dvi') as HTMLInputElement;
		expect(el.value).toBe('seed');
		expect(el.getAttribute('value')).toBe('seed');
		type(el, 'typed');
		expect(el.value).toBe('typed'); // uncontrolled: no restore
		r.update(DefaultsInput, { dv: 'seed' });
		expect(el.value).toBe('typed'); // re-render doesn't clobber
		r.unmount();
	});

	// Per ReactDOMInput-test.js:1035 — changing defaultValue updates the
	// attribute but not a dirty control's live value.
	it('a changed defaultValue re-syncs the attribute only', () => {
		const r = mount(DefaultsInput, { dv: 'one' });
		const el = r.find('#dvi') as HTMLInputElement;
		type(el, 'typed'); // control is now dirty
		r.update(DefaultsInput, { dv: 'two' });
		expect(el.getAttribute('value')).toBe('two');
		expect(el.value).toBe('typed');
		r.unmount();
	});

	it('defaultChecked seeds checked; toggling sticks', () => {
		const r = mount(DefaultsCheckbox, { dc: true });
		const el = r.find('#dci') as HTMLInputElement;
		expect(el.checked).toBe(true);
		r.click('#dci');
		expect(el.checked).toBe(false); // uncontrolled: platform toggle sticks
		r.unmount();
	});
});

describe('conformance: spread-delivered controlled value', () => {
	// Spreads bypass the compiler's classification — setAttribute's routing
	// arm must deliver identical controlled semantics.
	it('value through a spread is controlled (reverts + reasserts)', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(SpreadInput, { sp: { value: 'locked' } });
		const el = r.find('#si') as HTMLInputElement;
		expect(el.value).toBe('locked');
		type(el, 'lockedX');
		expect(el.value).toBe('locked'); // event-side restore
		el.value = 'drift';
		r.update(SpreadInput, { sp: { value: 'locked' } }); // identical spread value
		expect(el.value).toBe('locked'); // per-commit reassert bypasses the identity skip
		r.unmount();
	});

	// A vanished spread key routes removeHostProp → uncontrolled flip.
	it('removing value from the spread flips to uncontrolled', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(SpreadInput, { sp: { value: 'v' } });
		const el = r.find('#si') as HTMLInputElement;
		errSpy.mockClear();
		r.update(SpreadInput, { sp: {} });
		expect(el.value).toBe('v'); // DOM kept as-is (React parity)
		if (!PROD_COMPILE) {
			expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('to be uncontrolled'));
		}
		type(el, 'free');
		expect(el.value).toBe('free'); // no longer restored
		r.unmount();
	});
});

describe('conformance: missing-onInput dev warning', () => {
	// The octane-specific migration guard (decided 2026-07-08): a controlled
	// text control with no onInput and not readOnly/disabled warns once —
	// with an onChange-specific message when an onChange handler exists
	// (native change fires on blur, not per keystroke).
	it('warns once in development for a controlled text input without onInput', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'x' });
		const warnings = errSpy.mock.calls.filter((c) =>
			String(c[0]).includes('without an `onInput` handler'),
		);
		expect(warnings.length).toBe(PROD_COMPILE ? 0 : 1);
		errSpy.mockClear();
		r.update(ControlledInput, { value: 'y' });
		expect(errSpy).not.toHaveBeenCalled(); // once per element
		r.unmount();
	});

	it('does not warn when onInput is present', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(AcceptingInput, { initial: '' });
		expect(errSpy).not.toHaveBeenCalled();
		r.unmount();
	});
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '../_helpers';
import {
	StaticSelect,
	CaptureSelect,
	DisabledFirstSelect,
	ForSelect,
	MultiSelect,
	DefaultSelect,
} from './_fixtures/controlled-forms.tsrx';

// The dev warnings asserted below are gated on the dev-compile `__oct_loc`
// stamp (silent in prod output, like React's prod bundle) — the octane-prod
// vitest project compiles fixtures in prod mode and sets this env marker.
const PROD_COMPILE = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';

// ============================================================================
// Controlled <select> — ports of ReactDOMSelect-test.js (React v19.2.7).
// The projection follows React's updateOptions: single → first match wins,
// no match → first non-disabled; multiple → per-option set membership.
// Options built by @for land via the commit-deferred projection (binding
// mounts run before the same render's construct calls).
// ============================================================================

afterEach(() => {
	vi.restoreAllMocks();
});

const selected = (sel: HTMLSelectElement) =>
	Array.from(sel.options)
		.filter((o) => o.selected)
		.map((o) => o.value);

describe('conformance: controlled <select> (single)', () => {
	// Per ReactDOMSelect-test.js:117 ('should allow setting `value`').
	it('projects the value onto static options and re-projects on update', () => {
		const r = mount(StaticSelect, { value: 'b' });
		const sel = r.find('#ss') as HTMLSelectElement;
		expect(sel.value).toBe('b');
		r.update(StaticSelect, { value: 'c' });
		expect(sel.value).toBe('c');
		r.unmount();
	});

	// Per ReactDOMSelect-test.js:266 ('should select the first non-disabled
	// option if the value does not match any option').
	it('no match selects the first non-disabled option', () => {
		const r = mount(DisabledFirstSelect, { value: 'missing' });
		const sel = r.find('#dfs') as HTMLSelectElement;
		expect(sel.value).toBe('y');
		r.unmount();
	});

	// A rejected user pick snaps back after the discrete flush (the native
	// change/input event drives the restore; no handler commits the pick).
	it('reverts a user pick nothing committed', () => {
		const r = mount(StaticSelect, { value: 'a' });
		const sel = r.find('#ss') as HTMLSelectElement;
		sel.value = 'b'; // the user's pick
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		expect(sel.value).toBe('a');
		r.unmount();
	});

	// A REAL user pick dispatches native `input` and `change` in SEPARATE tasks
	// (popup commit, keyboard typeahead), with a microtask checkpoint between
	// them. The pick must survive that gap: restoring the controlled value
	// after the lone `input` would revert the selection before `change` even
	// dispatches, so every controlled select's onChange would read the OLD
	// value and user picks could never commit.
	it('keeps a user pick alive across the input→change task gap for onChange to commit', async () => {
		let received = '';
		let r = mount(CaptureSelect, {
			value: 'a',
			onChange: (e: Event) => {
				received = (e.target as HTMLSelectElement).value;
				r.update(CaptureSelect, { value: received, onChange: () => {} });
			},
		});
		const sel = r.find('#cs') as HTMLSelectElement;
		sel.value = 'b'; // the platform applies the pick before either event
		sel.dispatchEvent(new Event('input', { bubbles: true }));
		// The browser's microtask checkpoint between the two native events.
		await Promise.resolve();
		expect(sel.value).toBe('b');
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		expect(received).toBe('b');
		expect(sel.value).toBe('b');
		r.unmount();
	});

	// An input-only pick that no handler commits (and whose native `change`
	// never arrives — a synthetic lone `input`) still settles back to the
	// rendered value once the browser's post-event work completes. The revert
	// waits a full task, not a microtask, so it can never race the native
	// input→change sequence above.
	it('reverts an unhandled input-only pick after the event task settles', async () => {
		const r = mount(StaticSelect, { value: 'a' });
		const sel = r.find('#ss') as HTMLSelectElement;
		sel.value = 'b';
		sel.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(sel.value).toBe('a');
		r.unmount();
	});

	it('an accepting onInput keeps the pick', () => {
		let r = mount(StaticSelect, {
			value: 'a',
			onInput: (e: Event) => {
				r.update(StaticSelect, {
					value: (e.target as HTMLSelectElement).value,
					onInput: () => {},
				});
			},
		});
		const sel = r.find('#ss') as HTMLSelectElement;
		sel.value = 'b';
		sel.dispatchEvent(new Event('input', { bubbles: true }));
		expect(sel.value).toBe('b');
		r.unmount();
	});

	it('settles a rejected pick when native propagation stops after capture', async () => {
		let captured = '';
		const r = mount(CaptureSelect, {
			value: 'a',
			onChangeCapture: (e: Event) => {
				captured = (e.target as HTMLSelectElement).value;
			},
			onChange: () => {},
		});
		const sel = r.find('#cs') as HTMLSelectElement;
		sel.addEventListener('change', (event) => event.stopPropagation());
		sel.value = 'b';
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		expect(captured).toBe('b');
		await Promise.resolve();
		expect(sel.value).toBe('a');
		r.unmount();
	});
});

describe('conformance: controlled <select> with @for options', () => {
	// Per ReactDOMSelect-test.js:150 (value set before options exist) — the
	// select's value binding mounts BEFORE the @for builds its options; the
	// commit-phase projection lands the selection.
	it('projects onto options built after the value binding', () => {
		const r = mount(ForSelect, { value: 'two', options: ['one', 'two', 'three'] });
		const sel = r.find('#fs') as HTMLSelectElement;
		expect(sel.value).toBe('two');
		r.unmount();
	});

	// New options appearing in a later render re-project at that commit.
	it('re-projects when the matching option appears later', () => {
		const r = mount(ForSelect, { value: 'four', options: ['one', 'two'] });
		const sel = r.find('#fs') as HTMLSelectElement;
		expect(sel.value).toBe('one'); // no match → first non-disabled
		r.update(ForSelect, { value: 'four', options: ['one', 'two', 'four'] });
		expect(sel.value).toBe('four');
		r.unmount();
	});
});

describe('conformance: controlled <select multiple>', () => {
	// Per ReactDOMSelect-test.js:174 ('should allow setting `value` with
	// `multiple`').
	it('projects an array value as per-option membership', () => {
		const r = mount(MultiSelect, { values: ['1', '3'] });
		const sel = r.find('#ms') as HTMLSelectElement;
		expect(selected(sel)).toEqual(['1', '3']);
		r.update(MultiSelect, { values: ['2'] });
		expect(selected(sel)).toEqual(['2']);
		r.update(MultiSelect, { values: [] });
		expect(selected(sel)).toEqual([]);
		r.unmount();
	});

	// Per ReactDOMSelect-test.js:645 ('should warn if multiple is true and
	// value is not an array') — dev-warns and skips the projection.
	it('warns for a non-array value on a multiple select', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(MultiSelect, { values: ['1'] });
		errSpy.mockClear();
		r.update(MultiSelect, { values: 'nope' });
		if (!PROD_COMPILE) {
			expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('must be an array'));
		}
		const sel = r.find('#ms') as HTMLSelectElement;
		expect(selected(sel)).toEqual(['1']); // projection skipped, prior state kept
		r.unmount();
	});
});

describe('conformance: <select defaultValue> (uncontrolled)', () => {
	// Per ReactDOMSelect-test.js:238 ('should allow setting `defaultValue`') —
	// projected at commit with defaultSelected stamped.
	it('projects defaultValue with defaultSelected', () => {
		const r = mount(DefaultSelect, { dv: 'q' });
		const sel = r.find('#dsl') as HTMLSelectElement;
		expect(sel.value).toBe('q');
		expect(sel.options[1].defaultSelected).toBe(true);
		r.unmount();
	});

	// An UNCHANGED defaultValue on a re-render must not clobber the user's
	// pick (the projection re-runs only when the default changes).
	it('an unchanged defaultValue leaves the user selection alone', () => {
		const r = mount(DefaultSelect, { dv: 'q' });
		const sel = r.find('#dsl') as HTMLSelectElement;
		sel.value = 'p'; // the user's pick (uncontrolled — sticks)
		r.update(DefaultSelect, { dv: 'q' });
		expect(sel.value).toBe('p');
		// A CHANGED defaultValue re-selects (React re-projects on change).
		r.update(DefaultSelect, { dv: 'p' });
		expect(sel.value).toBe('p');
		r.unmount();
	});
});

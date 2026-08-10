import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '../_helpers';
import {
	ControlledInput,
	AcceptingInput,
	DigitsInput,
	SpreadInput,
} from './_fixtures/controlled-forms.tsrx';

// ============================================================================
// The event-side restore machinery — ports of ReactControlledComponent-test.js
// (React v19.2.7) mechanics: the restore runs AFTER the discrete flush (so it
// compares against what the handlers just committed), only for elements the
// event targeted, and holds off during IME composition.
// ============================================================================

afterEach(() => {
	vi.restoreAllMocks();
});

function type(el: HTMLInputElement, text: string): void {
	el.value = text;
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('conformance: restore timing', () => {
	// Per ReactControlledComponent-test.js:59 — the restore fires after the
	// dispatch returns to the browser, synchronously (no microtask needed).
	it('restores synchronously within the dispatch', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'locked' });
		const el = r.find('#ci') as HTMLInputElement;
		el.value = 'lockedX';
		el.dispatchEvent(new Event('input', { bubbles: true }));
		// No awaiting: dispatchEvent has returned and the value is restored.
		expect(el.value).toBe('locked');
		r.unmount();
	});

	// The restore compares against the values the handlers COMMITTED in the
	// discrete flush — an accepted edit is not a restore target.
	it('runs after the discrete flush (accepted edits survive)', () => {
		const r = mount(AcceptingInput, { initial: '' });
		const el = r.find('#ai') as HTMLInputElement;
		type(el, 'abc');
		expect(el.value).toBe('abc');
		r.unmount();
	});

	// A non-edit discrete event (keydown) targeting the element does not
	// restore — only the change-carrying set (input/change/click) enqueues.
	it('does not restore on non-edit events', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'locked' });
		const el = r.find('#ci') as HTMLInputElement;
		el.value = 'drifted';
		el.dispatchEvent(new Event('keydown', { bubbles: true }));
		expect(el.value).toBe('drifted'); // sticks until an edit event / commit
		r.unmount();
	});

	// `click` on a TEXT input never restores its value (React's change plugin
	// extracts change-from-click only for checkables) — "programmatic writes
	// stick" survives a click-to-focus.
	it('click on a text input does not restore the value', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'locked' });
		const el = r.find('#ci') as HTMLInputElement;
		el.value = 'drifted';
		el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(el.value).toBe('drifted');
		r.unmount();
	});
});

describe('conformance: IME composition guard', () => {
	// Mid-composition edits must not snap back — the restore is deferred to
	// compositionend (reverting mid-composition would cancel the IME session).
	it('holds the restore during composition, applies it at compositionend', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'locked' });
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new Event('compositionstart', { bubbles: true }));
		type(el, 'lockedあ');
		expect(el.value).toBe('lockedあ'); // composing: no restore
		el.dispatchEvent(new Event('compositionend', { bubbles: true }));
		await vi.waitFor(() => expect(el.value).toBe('locked'), { interval: 1 });
		r.unmount();
	});

	it('recognizes a composing input when its compositionstart was missed', () => {
		const r = mount(ControlledInput, { value: 'locked', onInput: () => {} });
		const el = r.find('#ci') as HTMLInputElement;
		el.value = 'locked候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
		expect(el.value).toBe('locked候');
		r.unmount();
	});

	it('recognizes composition input types when the keyboard omits isComposing', () => {
		const r = mount(ControlledInput, { value: 'locked', onInput: () => {} });
		const el = r.find('#ci') as HTMLInputElement;
		el.value = 'locked候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: false,
			}),
		);
		expect(el.value).toBe('locked候');
		r.unmount();
	});

	it('keeps the candidate available for a committed input following compositionend', async () => {
		const observed: string[] = [];
		const r = mount(ControlledInput, {
			value: 'locked',
			onInput: (event: InputEvent) => observed.push((event.target as HTMLInputElement).value),
		});
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'locked候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
		el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '候' }));
		await Promise.resolve();
		expect(el.value).toBe('locked候');

		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertText',
				isComposing: false,
			}),
		);
		expect(observed).toEqual(['locked候', 'locked候']);
		expect(el.value).toBe('locked');
		r.unmount();
	});

	it('preserves the candidate when the committed input arrives in the next task', async () => {
		const observed: string[] = [];
		const r = mount(ControlledInput, {
			value: 'locked',
			onInput: (event: InputEvent) => observed.push((event.target as HTMLInputElement).value),
		});
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'locked候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
		el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '候' }));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(el.value).toBe('locked候');

		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertText',
				isComposing: false,
			}),
		);
		expect(observed).toEqual(['locked候', 'locked候']);
		expect(el.value).toBe('locked');
		r.unmount();
	});

	it('does not let an earlier composition completion interrupt a replacement session', async () => {
		const r = mount(ControlledInput, { value: 'locked', onInput: () => {} });
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'locked候';
		el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '候' }));
		await new Promise((resolve) => setTimeout(resolve, 0));

		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'locked補';
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(el.value).toBe('locked補');
		el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '補' }));
		await vi.waitFor(() => expect(el.value).toBe('locked'), { interval: 1 });
		r.unmount();
	});

	it('resumes controlled restoration when composition is interrupted without compositionend', () => {
		const r = mount(ControlledInput, { value: 'locked', onInput: () => {} });
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'locked候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
		el.dispatchEvent(new FocusEvent('blur'));
		el.value = 'lockedX';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: 'X',
				inputType: 'insertText',
				isComposing: false,
			}),
		);
		expect(el.value).toBe('locked');
		r.unmount();
	});

	it('settles an interrupted composition after the input loses focus', async () => {
		const r = mount(ControlledInput, { value: 'locked', onInput: () => {} });
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = 'locked候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
		el.dispatchEvent(new FocusEvent('blur'));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(el.value).toBe('locked');
		r.unmount();
	});

	it('arms composition protection when a spread changes a date input into text', () => {
		const onInput = () => {};
		const r = mount(SpreadInput, {
			sp: { type: 'date', value: '2026-08-10', onInput },
		});
		const el = r.find('#si') as HTMLInputElement;
		r.update(SpreadInput, { sp: { type: 'text', value: '2026-08-10', onInput } });
		expect(r.find('#si')).toBe(el);
		el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
		el.value = '2026-08-10候';
		el.dispatchEvent(
			new InputEvent('input', {
				bubbles: true,
				data: '候',
				inputType: 'insertCompositionText',
				isComposing: true,
			}),
		);
		expect(el.value).toBe('2026-08-10候');
		r.unmount();
	});

	// An unrelated re-render with the UNCHANGED rendered value must not
	// reassert mid-composition; a genuinely CHANGED rendered value still wins
	// (React: setState during composition).
	it('reassert skips unchanged values mid-composition; changed values win', () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const r = mount(ControlledInput, { value: 'a' });
		const el = r.find('#ci') as HTMLInputElement;
		el.dispatchEvent(new Event('compositionstart', { bubbles: true }));
		el.value = 'aあ'; // in-flight composition text
		r.update(ControlledInput, { value: 'a' }); // unrelated re-render
		expect(el.value).toBe('aあ'); // composition preserved
		r.update(ControlledInput, { value: 'b' }); // the app changed the value
		expect(el.value).toBe('b'); // changed rendered value wins
		r.unmount();
	});

	// An accepting handler works normally through a composition (the common
	// IME flow: input events fire during composition and state tracks them).
	it('accepted composition input tracks state', async () => {
		const r = mount(DigitsInput);
		const el = r.find('#di') as HTMLInputElement;
		el.dispatchEvent(new Event('compositionstart', { bubbles: true }));
		type(el, '12x');
		el.dispatchEvent(new Event('compositionend', { bubbles: true }));
		await Promise.resolve();
		expect(el.value).toBe('12'); // filtered value committed + restored to
		r.unmount();
	});
});

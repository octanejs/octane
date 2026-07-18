import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { SelectHarness, ANIMALS } from './_fixtures/select.tsx';

// jsdom does not implement the CSS namespace; getItemElement builds
// `[data-key="…"]` selectors through CSS.escape (every real browser has it).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			// Minimal CSS.escape: backslash-escape everything outside [-\w].
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the select hook family (useSelect + HiddenSelect over
// useSelectState). The trigger is a real <button> (useButton), the popup is an
// inline listbox (useListBox/useOption), and a visually-hidden native <select>
// mirrors the collection for form autofill / native submission. Real focus and
// real press (jsdom .click()) drive the interactions.

type Mounted = ReturnType<typeof mount>;

function byKey(r: Mounted, key: string): HTMLElement {
	return r.container.querySelector(`[data-key="${key}"]`) as HTMLElement;
}

function output(r: Mounted): HTMLElement {
	return r.container.querySelector('output') as HTMLElement;
}

describe('@octanejs/aria — useSelect', () => {
	it('wires the trigger button role/haspopup/labelling and value association', async () => {
		const r = mount(SelectHarness, {});
		const button = r.container.querySelector('button') as HTMLButtonElement;
		expect(button).toBeTruthy();
		// The trigger opens a listbox popup.
		expect(button.getAttribute('aria-haspopup')).toBe('listbox');
		expect(button.getAttribute('aria-expanded')).toBe('false');

		// The visual label (rendered as a span via useField) labels the trigger, and
		// the trigger is also labelled by the value element so screen readers announce
		// the current value.
		const label = r.container.querySelector('span[id]') as HTMLElement;
		expect(label.id).toBeTruthy();
		const valueEl = button.querySelector('span[id]') as HTMLElement;
		expect(valueEl.id).toBeTruthy();
		const labelledby = button.getAttribute('aria-labelledby')!;
		expect(labelledby.split(' ')).toContain(valueEl.id);
		expect(labelledby.split(' ')).toContain(label.id);

		// Closed: no listbox rendered yet.
		expect(r.container.querySelector('[role="listbox"]')).toBe(null);
		expect(output(r).getAttribute('data-open')).toBe('false');
		r.unmount();
	});

	it('clicking the trigger opens the inline listbox with options', async () => {
		const r = mount(SelectHarness, {});
		const button = r.container.querySelector('button') as HTMLButtonElement;
		expect(output(r).getAttribute('data-open')).toBe('false');

		await act(() => button.click());

		expect(output(r).getAttribute('data-open')).toBe('true');
		const listbox = r.container.querySelector('[role="listbox"]') as HTMLElement;
		expect(listbox).toBeTruthy();
		expect(button.getAttribute('aria-expanded')).toBe('true');
		// aria-controls points at the now-open listbox.
		expect(button.getAttribute('aria-controls')).toBe(listbox.id);

		const options = r.container.querySelectorAll('[role="option"]');
		expect(options.length).toBe(ANIMALS.length);
		expect(byKey(r, 'cat')).toBeTruthy();
		r.unmount();
	});

	it('selecting an option updates the selected key, the value text, and closes', async () => {
		const r = mount(SelectHarness, {});
		const button = r.container.querySelector('button') as HTMLButtonElement;
		await act(() => button.click());
		expect(output(r).getAttribute('data-open')).toBe('true');

		await act(() => byKey(r, 'cat').click());

		// Single-select closes on selection.
		expect(output(r).getAttribute('data-open')).toBe('false');
		expect(output(r).getAttribute('data-selected-key')).toBe('cat');
		// The trigger's value element reflects the selection.
		const valueEl = button.querySelector('span[id]') as HTMLElement;
		expect(valueEl.textContent).toBe('Cat');
		// Listbox is torn down after selection.
		expect(r.container.querySelector('[role="listbox"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/aria — HiddenSelect', () => {
	it('renders a visually-hidden native <select> reflecting the collection and value', async () => {
		const r = mount(SelectHarness, {});
		const container = r.container.querySelector(
			'[data-testid="hidden-select-container"]',
		) as HTMLElement;
		expect(container).toBeTruthy();
		// Hidden from the accessibility tree; the real trigger is the a11y surface.
		expect(container.getAttribute('aria-hidden')).toBe('true');

		const select = container.querySelector('select') as HTMLSelectElement;
		expect(select).toBeTruthy();
		expect(select.tabIndex).toBe(-1);
		expect(select.name).toBe('animal');

		// One <option> per collection item, plus the leading empty placeholder option.
		const optionValues = Array.from(select.options, (o) => o.value);
		expect(optionValues).toEqual(['', 'red panda', 'cat', 'dog']);
		// Nothing selected yet: the empty option is current.
		expect(select.value).toBe('');
		r.unmount();
	});

	it('dispatching a native change on the hidden <select> updates the selected key', async () => {
		const r = mount(SelectHarness, {});
		const select = r.container.querySelector(
			'[data-testid="hidden-select-container"] select',
		) as HTMLSelectElement;
		expect(output(r).getAttribute('data-selected-key')).toBe('null');

		await act(() => {
			select.value = 'dog';
			select.dispatchEvent(new Event('change', { bubbles: true }));
		});

		expect(output(r).getAttribute('data-selected-key')).toBe('dog');
		// The controlled value reasserts to the new selection.
		expect(select.value).toBe('dog');
		// The trigger's value element reflects the selection made through the native select.
		const valueEl = r.container.querySelector('button span[id]') as HTMLElement;
		expect(valueEl.textContent).toBe('Dog');
		r.unmount();
	});
});

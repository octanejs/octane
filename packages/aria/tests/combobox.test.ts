import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { ComboBoxHarness } from './_fixtures/combobox.tsx';

// jsdom does not implement the CSS namespace; useComboBox's Enter/link handling and
// the listbox harness build `[data-key="…"]` selectors through CSS.escape.
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for useComboBox (over useComboBoxState + useListBox/useOption +
// useTextField/useMenuTrigger). The listbox is rendered inline so jsdom can observe the
// combobox↔listbox ARIA wiring, native-input filtering, and pointer selection.

type Mounted = ReturnType<typeof mount>;

function input(r: Mounted): HTMLInputElement {
	return r.container.querySelector('input') as HTMLInputElement;
}

function output(r: Mounted): HTMLElement {
	return r.container.querySelector('output') as HTMLElement;
}

function byKey(r: Mounted, key: string): HTMLElement {
	return r.container.querySelector(`[data-key="${key}"]`) as HTMLElement;
}

// Set the input value the way a browser would (native setter) and fire the native
// `input` event octane's controlled input listens to per keystroke.
async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
	await act(() => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
		setter.call(el, value);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

function keydown(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		width: 20,
		height: 20,
		pressure: 0.5,
		detail: 1,
		...init,
	});
}

// A full mouse press: pointerdown, then pointerup + the ensuing click.
async function pressCycle(el: HTMLElement): Promise<void> {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(
			new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				detail: 1,
				clientX: 5,
				clientY: 5,
			}),
		);
	});
}

describe('@octanejs/aria — useComboBox', () => {
	it('wires the combobox input roles and toggles aria-expanded/aria-controls with the listbox', async () => {
		const r = mount(ComboBoxHarness, {});
		const el = input(r);

		// The input is a combobox with list autocomplete; closed by default.
		expect(el.getAttribute('role')).toBe('combobox');
		expect(el.getAttribute('aria-autocomplete')).toBe('list');
		expect(el.getAttribute('aria-expanded')).toBe('false');
		expect(el.getAttribute('aria-controls')).toBe(null);
		// The input is labelled by the visible label.
		const label = r.container.querySelector('label') as HTMLElement;
		expect(el.getAttribute('aria-labelledby')).toContain(label.id);
		expect(output(r).getAttribute('data-open')).toBe('false');

		// Open via ArrowDown: the listbox appears and aria-controls points at it.
		await act(() => {
			el.focus();
			keydown(el, 'ArrowDown');
		});
		const listbox = r.container.querySelector('[role="listbox"]') as HTMLElement;
		expect(listbox).toBeTruthy();
		expect(el.getAttribute('aria-expanded')).toBe('true');
		expect(el.getAttribute('aria-controls')).toBe(listbox.id);
		r.unmount();
	});

	it('typing filters the collection, opens the listbox, and updates inputValue', async () => {
		const r = mount(ComboBoxHarness, {});
		const el = input(r);

		await act(() => el.focus());
		await typeInto(el, 'ap');

		// Menu opened from the input change and state.inputValue tracked the keystrokes.
		expect(output(r).getAttribute('data-open')).toBe('true');
		expect(output(r).getAttribute('data-input-value')).toBe('ap');
		expect(el.value).toBe('ap');

		// Only options whose text contains "ap" survive the filter (Apple, Grape).
		const listbox = r.container.querySelector('[role="listbox"]') as HTMLElement;
		expect(listbox.getAttribute('role')).toBe('listbox');
		const options = r.container.querySelectorAll('[role="option"]');
		expect([...options].map((o) => o.textContent).sort()).toEqual(['Apple', 'Grape']);

		// Narrow further: only Grape remains.
		await typeInto(el, 'grap');
		expect(r.container.querySelectorAll('[role="option"]').length).toBe(1);
		expect(r.container.querySelector('[role="option"]')!.textContent).toBe('Grape');
		r.unmount();
	});

	it('aria-activedescendant tracks the virtually focused option', async () => {
		const r = mount(ComboBoxHarness, {});
		const el = input(r);

		// Opening with ArrowDown auto-focuses the first option (focusStrategy "first").
		await act(() => {
			el.focus();
			keydown(el, 'ArrowDown');
		});
		const first = byKey(r, 'apple');
		expect(output(r).getAttribute('data-focused-key')).toBe('apple');
		expect(el.getAttribute('aria-activedescendant')).toBe(first.id);

		// Moving virtual focus down updates aria-activedescendant to the next option.
		await act(() => keydown(el, 'ArrowDown'));
		const focusedKey = output(r).getAttribute('data-focused-key')!;
		expect(focusedKey).not.toBe('apple');
		expect(el.getAttribute('aria-activedescendant')).toBe(byKey(r, focusedKey).id);
		r.unmount();
	});

	it('clicking an option sets the input value to its text, selects the key, and closes the menu', async () => {
		const selections: any[] = [];
		const r = mount(ComboBoxHarness, { onSelectionChange: (k: any) => selections.push(k) });
		const el = input(r);

		await act(() => el.focus());
		await typeInto(el, 'ba');
		expect(output(r).getAttribute('data-open')).toBe('true');
		const option = byKey(r, 'banana');
		expect(option).toBeTruthy();

		await pressCycle(option);

		// Selecting sets state.selectedKey and syncs the input value to the option text.
		expect(output(r).getAttribute('data-selected-key')).toBe('banana');
		expect(selections).toContain('banana');
		expect(el.value).toBe('Banana');
		expect(output(r).getAttribute('data-input-value')).toBe('Banana');
		// The menu closes once a selection is committed.
		expect(output(r).getAttribute('data-open')).toBe('false');
		expect(r.container.querySelector('[role="listbox"]')).toBe(null);
		expect(el.getAttribute('aria-expanded')).toBe('false');
		r.unmount();
	});
});

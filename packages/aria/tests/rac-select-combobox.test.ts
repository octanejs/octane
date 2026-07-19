import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	BasicComboBoxHarness,
	BasicSelectHarness,
	DynamicSelectHarness,
} from './_fixtures/rac-select-combobox.tsx';

// @octanejs/aria Phase 5 — RAC Select (Select / SelectValue) and ComboBox over the
// Phase-4 collection engine and overlay composition, driven through octane's NATIVE
// delegated events (the ComboBox input rides native `input` events — no synthetic
// onChange). The open Popover portals to document.body, so open-state assertions
// query the document rather than the mount container. Structural collection updates
// land one microtask after commit (the Document's MutationObserver) — flush with
// `await act(() => {})` before asserting. Positioning math is inert in jsdom (zero
// rects), so these assert roles, ARIA wiring, data attributes, focus, form
// mirroring, and open/close transitions.

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// jsdom lacks Element#getAnimations; the enter/exit animation hooks treat an empty
// animation list as "no animation" and complete immediately.
beforeAll(() => {
	(Element.prototype as any).getAnimations = () => [];
});
afterAll(() => {
	delete (Element.prototype as any).getAnimations;
});

// Strict per-test unmounts: a leaked open overlay (and its ariaHideOutside
// observers) cascades failures into later tests, so every mount goes through
// this tracker and is torn down even when an assertion fails mid-test.
const mounted: Array<{ unmount: () => void }> = [];
function mountTracked(Component: any, props: any): ReturnType<typeof mount> {
	const r = mount(Component, props);
	const unmount = r.unmount.bind(r);
	let done = false;
	r.unmount = () => {
		if (!done) {
			done = true;
			unmount();
		}
	};
	mounted.push(r);
	return r;
}
afterEach(() => {
	while (mounted.length) {
		mounted.pop()!.unmount();
	}
});

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		detail: 1,
		...init,
	});
}

async function press(el: Element): Promise<void> {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	});
}

async function keydown(el: Element, key: string, init: KeyboardEventInit = {}): Promise<void> {
	await act(() => {
		el.dispatchEvent(
			new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
		);
	});
	await act(() => {
		el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
	});
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

function q(selector: string): HTMLElement | null {
	return document.querySelector(selector) as HTMLElement | null;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('@octanejs/aria/components — Select + SelectValue', () => {
	it('labels the trigger through Label + SelectValue and closes by default', async () => {
		mountTracked(BasicSelectHarness, {});
		await act(() => {});

		const trigger = q('[data-testid="select-trigger"]')!;
		const label = q('[data-testid="select-label"]')!;
		const value = q('[data-testid="select-value"]')!;

		// Select triggers advertise a listbox popup (string form, not the menu `true`).
		expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		// The RAC Select label renders as a <span> (elementType: 'span' via LabelContext).
		expect(label.tagName).toBe('SPAN');
		const labelledBy = (trigger.getAttribute('aria-labelledby') || '').split(' ');
		expect(labelledBy).toContain(label.id);
		expect(labelledBy).toContain(value.id);

		// Placeholder value until something is selected (localized default string).
		expect(value.textContent!.trim()).toBe('Select an item');
		expect(value.hasAttribute('data-placeholder')).toBe(true);
		expect(value.className).toBe('react-aria-SelectValue');

		expect(q('[role="listbox"]')).toBeNull();
	});

	it('opens a portalled listbox on press, selects an option, and mirrors the hidden native select', async () => {
		const onSelectionChange = vi.fn();
		const openChanges: boolean[] = [];
		const r = mountTracked(BasicSelectHarness, {
			name: 'animal',
			onSelectionChange,
			onOpenChange: (o: boolean) => openChanges.push(o),
		});
		await act(() => {});

		const root = q('[data-testid="select-root"]')!;
		const trigger = q('[data-testid="select-trigger"]')!;
		await press(trigger);
		await act(() => {});

		const listbox = q('[role="listbox"]')!;
		expect(listbox).toBeTruthy();
		// The Popover portals to document.body — the listbox is OUTSIDE the mount container.
		expect(r.container.contains(listbox)).toBe(false);
		expect(document.body.contains(listbox)).toBe(true);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(root.hasAttribute('data-open')).toBe(true);
		expect(openChanges).toEqual([true]);

		const options = document.querySelectorAll('[role="option"]');
		expect(options.length).toBe(3);

		// Mouse-open autofocuses the listbox itself (no focused option).
		await nextFrame();
		expect(document.activeElement).toBe(listbox);

		await press(q('[data-testid="option-dog"]')!);
		await act(() => {});

		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		// The binding may pass (key, value) — assert the leading key argument.
		expect(onSelectionChange.mock.calls[0][0]).toBe('dog');
		expect(q('[role="listbox"]')).toBeNull();
		expect(openChanges).toEqual([true, false]);
		expect(root.hasAttribute('data-open')).toBe(false);

		const value = q('[data-testid="select-value"]')!;
		expect(value.textContent!.trim()).toBe('Dog');
		expect(value.hasAttribute('data-placeholder')).toBe(false);

		// The hidden native <select> mirrors the selection for form submission/autofill.
		const hidden = r.container.querySelector(
			'[data-testid="hidden-select-container"] select',
		) as HTMLSelectElement;
		expect(hidden).toBeTruthy();
		expect(hidden.name).toBe('animal');
		expect(hidden.value).toBe('dog');
	});

	it('opens from the keyboard and focuses the first option', async () => {
		mountTracked(BasicSelectHarness, {});
		await act(() => {});

		const trigger = q('[data-testid="select-trigger"]')!;
		await act(() => {
			trigger.focus();
		});
		await keydown(trigger, 'ArrowDown');
		await act(() => {});

		const listbox = q('[role="listbox"]')!;
		expect(listbox).toBeTruthy();
		await nextFrame();
		const focused = document.activeElement as HTMLElement;
		expect(focused.getAttribute('role')).toBe('option');
		expect(focused.getAttribute('data-testid')).toBe('option-cat');
	});

	it('builds dynamic items from the collection and picks up structural updates', async () => {
		const onSelectionChange = vi.fn();
		const r = mountTracked(DynamicSelectHarness, { onSelectionChange });
		await act(() => {});

		const add = r.container.querySelector('[data-action="add"]') as HTMLElement;
		await press(add);
		// Structural collection updates land one microtask after commit.
		await act(() => {});
		await act(() => {});

		await press(q('[data-testid="select-trigger"]')!);
		await act(() => {});

		const options = document.querySelectorAll('[role="option"]');
		expect(options.length).toBe(3);
		expect([...options].map((o) => o.textContent!.trim())).toEqual(['Red', 'Green', 'Blue']);

		await press(options[2]);
		await act(() => {});
		expect(onSelectionChange.mock.calls[0][0]).toBe('blue');
		expect(q('[data-testid="select-value"]')!.textContent!.trim()).toBe('Blue');
	});
});

describe('@octanejs/aria/components — ComboBox', () => {
	it('renders a labelled role=combobox input, closed by default', async () => {
		mountTracked(BasicComboBoxHarness, {});
		await act(() => {});

		const input = q('[data-testid="combobox-input"]') as HTMLInputElement;
		const label = q('[data-testid="combobox-label"]')!;
		expect(input.getAttribute('role')).toBe('combobox');
		expect(input.getAttribute('aria-expanded')).toBe('false');
		expect(input.getAttribute('aria-autocomplete')).toBe('list');
		expect(label.getAttribute('for')).toBe(input.id);
		expect(input.getAttribute('aria-labelledby')).toContain(label.id);
		expect(q('[role="listbox"]')).toBeNull();
		expect(q('[data-testid="combobox-error"]')).toBeNull();
	});

	it('opens and filters as the user types through native input events', async () => {
		const r = mountTracked(BasicComboBoxHarness, {});
		await act(() => {});

		const input = q('[data-testid="combobox-input"]') as HTMLInputElement;
		await act(() => {
			input.focus();
		});
		await typeInto(input, 'ka');
		await act(() => {});

		const listbox = q('[role="listbox"]')!;
		expect(listbox).toBeTruthy();
		expect(r.container.contains(listbox)).toBe(false);
		expect(input.getAttribute('aria-expanded')).toBe('true');
		expect(input.getAttribute('aria-controls')).toBe(listbox.id);
		expect(q('[data-testid="combobox-root"]')!.hasAttribute('data-open')).toBe(true);

		const options = document.querySelectorAll('[role="option"]');
		expect(options.length).toBe(1);
		expect(options[0].textContent!.trim()).toBe('Kangaroo');
	});

	it('moves virtual focus with ArrowDown and commits a clicked option', async () => {
		const onSelectionChange = vi.fn();
		mountTracked(BasicComboBoxHarness, { onSelectionChange });
		await act(() => {});

		const input = q('[data-testid="combobox-input"]') as HTMLInputElement;
		await act(() => {
			input.focus();
		});
		await typeInto(input, 'ka');
		await act(() => {});

		// Virtual focus: DOM focus stays on the input, aria-activedescendant tracks the option.
		await keydown(input, 'ArrowDown');
		await nextFrame();
		expect(document.activeElement).toBe(input);
		const option = q('[data-testid="option-kangaroo"]')!;
		expect(input.getAttribute('aria-activedescendant')).toBe(option.id);

		await press(option);
		await act(() => {});

		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		expect(onSelectionChange.mock.calls[0][0]).toBe('kangaroo');
		expect(input.value).toBe('Kangaroo');
		expect(q('[role="listbox"]')).toBeNull();
		expect(q('[data-testid="combobox-root"]')!.hasAttribute('data-open')).toBe(false);
	});

	it('keeps the menu open with allowsEmptyCollection and renders the empty state', async () => {
		mountTracked(BasicComboBoxHarness, { allowsEmptyCollection: true });
		await act(() => {});

		const input = q('[data-testid="combobox-input"]') as HTMLInputElement;
		await act(() => {
			input.focus();
		});
		await typeInto(input, 'zzz');
		await act(() => {});

		const listbox = q('[role="listbox"]')!;
		expect(listbox).toBeTruthy();
		// No real items remain; the single role=option is the display:contents
		// empty-state wrapper (upstream parity — ListBox renders renderEmptyState
		// inside a `role="option"` div).
		const options = document.querySelectorAll('[role="option"]');
		expect(options.length).toBe(1);
		expect(options[0].textContent).toBe('No results');
		expect(listbox.hasAttribute('data-empty')).toBe(true);
	});

	it('links FieldError to the input when invalid', async () => {
		mountTracked(BasicComboBoxHarness, { isInvalid: true });
		await act(() => {});

		const root = q('[data-testid="combobox-root"]')!;
		const input = q('[data-testid="combobox-input"]') as HTMLInputElement;
		const error = q('[data-testid="combobox-error"]')!;
		expect(root.hasAttribute('data-invalid')).toBe(true);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(error.textContent).toBe('Invalid animal');
		expect(error.className).toBe('react-aria-FieldError');
		expect((input.getAttribute('aria-describedby') || '').split(' ')).toContain(error.id);
	});
});

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	AutocompleteScenario,
	DndPersistedKeysScenario,
	DropIndicatorScenario,
	RenderDropIndicatorScenario,
} from './_fixtures/rac-autocomplete.tsx';
import { useDragAndDrop } from '../src/components/useDragAndDrop';

// RAC Autocomplete (Phase 5): the real <Autocomplete> provides
// AutocompleteStateContext + FieldInputContext (consumed by <TextField>/<Input>)
// + SelectableCollectionContext, and the collection side of the fixture mirrors
// upstream RAC ListBoxInner (useContextProps over SelectableCollectionContext →
// per-node filter → useListBox).
// Typing rides octane's NATIVE input events; virtual focus rides the
// FOCUS_EVENT/CLEAR_FOCUS_EVENT custom events and untrusted focusin dispatches.

// jsdom does not implement the CSS namespace; the selection machinery builds
// `[data-key="…"]` selectors through CSS.escape.
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// jsdom gap: the Web Animations API (overlay/exit paths probe getAnimations).
beforeAll(() => {
	if (typeof (Element.prototype as any).getAnimations !== 'function') {
		(Element.prototype as any).getAnimations = () => [];
	}
});

type Mounted = ReturnType<typeof mount>;

function input(r: Mounted): HTMLInputElement {
	return r.container.querySelector('input') as HTMLInputElement;
}

function listbox(r: Mounted): HTMLElement {
	return r.container.querySelector('ul') as HTMLElement;
}

function probe(r: Mounted): HTMLElement {
	return r.container.querySelector('output') as HTMLElement;
}

function options(r: Mounted): HTMLElement[] {
	return [...r.container.querySelectorAll('li')] as HTMLElement[];
}

// Set the input value the way a browser would (native setter), preceded by the
// `beforeinput` the autocomplete uses to classify the edit, then the native
// `input` event octane's controlled input listens to per keystroke.
async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
	await act(() => {
		el.dispatchEvent(
			new InputEvent('beforeinput', { inputType: 'insertText', data: value, bubbles: true }),
		);
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
		setter.call(el, value);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	});
}

async function keydown(el: Element, key: string, init: KeyboardEventInit = {}): Promise<void> {
	await act(() => {
		el.dispatchEvent(
			new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
		);
	});
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

describe('@octanejs/aria/components — Autocomplete', () => {
	it('wires the input and collection through its contexts', async () => {
		const r = mount(AutocompleteScenario, {});
		// hasCollection lands via the collection callback ref (state update) and the
		// engine's structural pass lands a microtask after commit.
		await act(() => {});

		const el = input(r);
		const ul = listbox(r);
		// Autocomplete-specific input attributes from useAutocomplete via
		// FieldInputContext → TextField → useTextField.
		expect(el.getAttribute('aria-autocomplete')).toBe('list');
		expect(el.getAttribute('autocorrect')).toBe('off');
		expect(el.getAttribute('spellcheck')).toBe('false');
		expect(el.getAttribute('autocomplete')).toBe('off');
		// The input controls the connected collection.
		expect(ul.id).not.toBe('');
		expect(el.getAttribute('aria-controls')).toBe(ul.id);
		// The collection gets the localized default label and a listbox role.
		expect(ul.getAttribute('role')).toBe('listbox');
		expect(ul.getAttribute('aria-label')).toBe('Suggestions');
		expect(options(r)).toHaveLength(4);
		r.unmount();
	});

	it('filters the collection as the user types through native input events', async () => {
		const onInputChange = vi.fn();
		const r = mount(AutocompleteScenario, { onInputChange });
		await act(() => {});

		await typeInto(input(r), 'py');
		expect(onInputChange).toHaveBeenCalledWith('py');
		expect(probe(r).getAttribute('data-input-value')).toBe('py');
		expect(options(r).map((o) => o.textContent)).toEqual(['Python']);

		// Broadening the query restores the matching items (the source collection
		// is unfiltered; the filter narrows per keystroke).
		await typeInto(input(r), 'script');
		expect(options(r).map((o) => o.textContent)).toEqual(['JavaScript', 'TypeScript']);
		r.unmount();
	});

	it('moves virtual focus into the collection with ArrowDown and reflects it in aria-activedescendant', async () => {
		const r = mount(AutocompleteScenario, {});
		await act(() => {});

		const el = input(r);
		expect(el.hasAttribute('aria-activedescendant')).toBe(false);

		await keydown(el, 'ArrowDown');
		const first = options(r)[0];
		expect(first.getAttribute('data-focused')).toBe('true');
		expect(first.id).not.toBe('');
		expect(el.getAttribute('aria-activedescendant')).toBe(first.id);

		await keydown(el, 'ArrowDown');
		const second = options(r)[1];
		expect(second.getAttribute('data-focused')).toBe('true');
		expect(el.getAttribute('aria-activedescendant')).toBe(second.id);
		r.unmount();
	});

	it('commits the virtually focused item with Enter', async () => {
		const onSelectionChange = vi.fn();
		const r = mount(AutocompleteScenario, { onSelectionChange });
		await act(() => {});

		const el = input(r);
		await keydown(el, 'ArrowDown');
		await keydown(el, 'Enter');

		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		const keys = [...onSelectionChange.mock.calls[0][0]];
		expect(keys).toEqual(['js']);
		expect(options(r)[0].getAttribute('aria-selected')).toBe('true');
		r.unmount();
	});

	it('commits an item with a mouse press on the option', async () => {
		const onSelectionChange = vi.fn();
		const r = mount(AutocompleteScenario, { onSelectionChange });
		await act(() => {});

		const python = options(r)[2];
		expect(python.textContent).toBe('Python');
		await pressCycle(python);

		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		expect([...onSelectionChange.mock.calls[0][0]]).toEqual(['py']);
		r.unmount();
	});
});

describe('@octanejs/aria/components — DragAndDrop context layer', () => {
	it('DropIndicator renders through the DropIndicatorContext render function with props and ref', async () => {
		const r = mount(DropIndicatorScenario);
		const indicator = r.container.querySelector('[data-testid="indicator"]') as HTMLElement;
		expect(indicator.textContent!.trim()).toBe('drop here');
		// The target prop reaches the render function; the forwarded ref reaches
		// the rendered element.
		expect(indicator.getAttribute('data-target-key')).toBe('a');
		r.unmount();
	});

	it('useRenderDropIndicator returns a renderer only when hooks provide useDropIndicator, and renders the default DropIndicator while virtually dragging', async () => {
		const active = mount(RenderDropIndicatorScenario, {
			hooks: { useDropIndicator: () => ({}), isVirtualDragging: () => true },
		});
		const host = active.container.querySelector('[data-testid="rdi"]') as HTMLElement;
		expect(host.getAttribute('data-has-fn')).toBe('true');
		const indicator = host.querySelector('[data-testid="indicator"]') as HTMLElement;
		expect(indicator.getAttribute('data-target-key')).toBe('b');
		active.unmount();

		// Without useDropIndicator in the hooks, no renderer is produced.
		const inert = mount(RenderDropIndicatorScenario, { hooks: {} });
		const inertHost = inert.container.querySelector('[data-testid="rdi"]') as HTMLElement;
		expect(inertHost.getAttribute('data-has-fn')).toBe('false');
		expect(inertHost.querySelector('[data-testid="indicator"]')).toBe(null);
		inert.unmount();
	});

	it('useDndPersistedKeys persists the focused key when no drag and drop is active', async () => {
		const r = mount(DndPersistedKeysScenario, { focusedKey: 'b' });
		const el = r.container.querySelector('[data-testid="persisted"]') as HTMLElement;
		expect(el.getAttribute('data-keys')).toBe('b');
		r.unmount();

		const none = mount(DndPersistedKeysScenario, { focusedKey: null });
		const el2 = none.container.querySelector('[data-testid="persisted"]') as HTMLElement;
		expect(el2.getAttribute('data-keys')).toBe('');
		none.unmount();
	});

	it('useDragAndDrop throws its not-ported message', () => {
		expect(() => useDragAndDrop({} as any)).toThrowError(
			'@octanejs/aria: useDragAndDrop is not ported yet (drag and drop arrives in a later phase)',
		);
	});
});

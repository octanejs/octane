import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { ListBoxHarness } from './_fixtures/selectable-collection.tsx';

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

// Behavioral coverage for the selection interaction hooks (useSelectableList →
// useSelectableCollection + useSelectableItem + useTypeSelect over a real
// ListCollection): roving focus, keyboard selection, extension, typeahead, and
// the single-tab-stop contract. Real focus is used throughout — jsdom's
// activeElement is the oracle for focus movement.

type Mounted = ReturnType<typeof mount>;

function listbox(r: Mounted): HTMLElement {
	return r.container.querySelector('[role="listbox"]') as HTMLElement;
}

function option(r: Mounted, key: string): HTMLElement {
	return r.container.querySelector(`[data-key="${key}"]`) as HTMLElement;
}

function focusedKey(r: Mounted): string {
	return r.container.querySelector('output')!.getAttribute('data-focused-key')!;
}

function selectedKeys(r: Mounted): string {
	return r.container.querySelector('output')!.getAttribute('data-selected')!;
}

function keydown(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function keyup(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
}

async function tabIn(r: Mounted): Promise<void> {
	await act(() => {
		listbox(r).focus();
	});
}

describe('@octanejs/aria — useSelectableCollection / useSelectableItem', () => {
	it('focusing the collection moves focus to the first item and roves tabIndex', async () => {
		const r = mount(ListBoxHarness, {});
		const ul = listbox(r);
		// Nothing focused yet: the collection itself is the tab stop.
		expect(ul.tabIndex).toBe(0);
		expect(focusedKey(r)).toBe('null');

		await tabIn(r);
		expect(focusedKey(r)).toBe('apple');
		expect(document.activeElement).toBe(option(r, 'apple'));
		// Roving tabindex: the focused item becomes the tab stop, the collection retires.
		expect(option(r, 'apple').tabIndex).toBe(0);
		expect(option(r, 'banana').tabIndex).toBe(-1);
		expect(ul.tabIndex).toBe(-1);
		r.unmount();
	});

	it('ArrowDown/ArrowUp move the focused key and real DOM focus', async () => {
		const r = mount(ListBoxHarness, {});
		await tabIn(r);

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(focusedKey(r)).toBe('banana');
		expect(document.activeElement).toBe(option(r, 'banana'));
		expect(option(r, 'banana').getAttribute('data-focused')).toBe('true');

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(focusedKey(r)).toBe('cactus');

		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		expect(focusedKey(r)).toBe('banana');
		expect(document.activeElement).toBe(option(r, 'banana'));
		r.unmount();
	});

	it('does not wrap at the ends by default; shouldFocusWrap wraps', async () => {
		const r = mount(ListBoxHarness, {});
		await tabIn(r);
		await act(() => keydown(document.activeElement!, 'End'));
		expect(focusedKey(r)).toBe('date');
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(focusedKey(r)).toBe('date');
		await act(() => keydown(document.activeElement!, 'Home'));
		expect(focusedKey(r)).toBe('apple');
		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		expect(focusedKey(r)).toBe('apple');
		r.unmount();

		const wrapped = mount(ListBoxHarness, { shouldFocusWrap: true });
		await tabIn(wrapped);
		await act(() => keydown(document.activeElement!, 'End'));
		expect(focusedKey(wrapped)).toBe('date');
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(focusedKey(wrapped)).toBe('apple');
		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		expect(focusedKey(wrapped)).toBe('date');
		wrapped.unmount();
	});

	it('Home and End jump to the first and last item', async () => {
		const r = mount(ListBoxHarness, {});
		await tabIn(r);
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(focusedKey(r)).toBe('banana');

		await act(() => keydown(document.activeElement!, 'End'));
		expect(focusedKey(r)).toBe('date');
		expect(document.activeElement).toBe(option(r, 'date'));

		await act(() => keydown(document.activeElement!, 'Home'));
		expect(focusedKey(r)).toBe('apple');
		expect(document.activeElement).toBe(option(r, 'apple'));
		r.unmount();
	});

	it('Space and Enter select the focused item (single selection replaces)', async () => {
		const r = mount(ListBoxHarness, {});
		await tabIn(r);

		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		expect(selectedKeys(r)).toBe('apple');
		expect(option(r, 'apple').getAttribute('aria-selected')).toBe('true');

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		await act(() => {
			keydown(document.activeElement!, 'Enter');
			keyup(document.activeElement!, 'Enter');
		});
		// Single mode: selecting banana replaces apple.
		expect(selectedKeys(r)).toBe('banana');
		expect(option(r, 'apple').getAttribute('aria-selected')).toBe('false');
		expect(option(r, 'banana').getAttribute('aria-selected')).toBe('true');
		r.unmount();
	});

	it('multiple mode: Space toggles items into the selection', async () => {
		const r = mount(ListBoxHarness, { selectionMode: 'multiple' });
		await tabIn(r);

		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		// Toggle behavior accumulates without modifier keys.
		expect(selectedKeys(r)).toBe('apple,cactus');

		// Toggling a selected item removes it.
		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		expect(selectedKeys(r)).toBe('apple');
		r.unmount();
	});

	it('multiple mode: Shift+Arrow extends the selection from the anchor', async () => {
		const r = mount(ListBoxHarness, { selectionMode: 'multiple' });
		await tabIn(r);
		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		expect(selectedKeys(r)).toBe('apple');

		await act(() => keydown(document.activeElement!, 'ArrowDown', { shiftKey: true }));
		expect(focusedKey(r)).toBe('banana');
		expect(selectedKeys(r)).toBe('apple,banana');

		await act(() => keydown(document.activeElement!, 'ArrowDown', { shiftKey: true }));
		expect(selectedKeys(r)).toBe('apple,banana,cactus');

		// Extending back toward the anchor shrinks the range.
		await act(() => keydown(document.activeElement!, 'ArrowUp', { shiftKey: true }));
		expect(selectedKeys(r)).toBe('apple,banana');
		r.unmount();
	});

	it('Escape clears the selection', async () => {
		const r = mount(ListBoxHarness, { selectionMode: 'multiple' });
		await tabIn(r);
		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		await act(() => keydown(document.activeElement!, 'ArrowDown', { shiftKey: true }));
		expect(selectedKeys(r)).toBe('apple,banana');

		await act(() => keydown(document.activeElement!, 'Escape'));
		expect(selectedKeys(r)).toBe('none');
		r.unmount();
	});

	it('typeahead focuses the item matching the accumulated search string', async () => {
		const r = mount(ListBoxHarness, {});
		await tabIn(r);
		expect(focusedKey(r)).toBe('apple');

		// 'c' matches Cactus first…
		await act(() => keydown(document.activeElement!, 'c'));
		expect(focusedKey(r)).toBe('cactus');
		expect(document.activeElement).toBe(option(r, 'cactus'));

		// …and the buffered 'ch' resolves to Cherry.
		await act(() => keydown(document.activeElement!, 'h'));
		expect(focusedKey(r)).toBe('cherry');
		expect(document.activeElement).toBe(option(r, 'cherry'));
		r.unmount();
	});

	it('Shift+Tab returns focus to the collection element (single tab stop)', async () => {
		const r = mount(ListBoxHarness, {});
		await tabIn(r);
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(document.activeElement).toBe(option(r, 'banana'));

		await act(() => keydown(document.activeElement!, 'Tab', { shiftKey: true }));
		// The collection marshals focus to itself so the browser's default Shift+Tab
		// continues backwards from the collection boundary.
		expect(document.activeElement).toBe(listbox(r));
		r.unmount();
	});

	it('Tab moves focus to the last tabbable element inside the collection', async () => {
		const r = mount(ListBoxHarness, { embedTabbableInLast: true });
		await tabIn(r);
		expect(document.activeElement).toBe(option(r, 'apple'));

		await act(() => keydown(document.activeElement!, 'Tab'));
		// Forward Tab jumps to the last tabbable descendant so the browser default
		// continues from the end of the collection.
		expect(document.activeElement).toBe(r.container.querySelector('[data-embedded]'));
		r.unmount();
	});

	it('disabled items are skipped by keyboard navigation and cannot be selected', async () => {
		const r = mount(ListBoxHarness, { disabledKeys: ['banana'] });
		await tabIn(r);
		expect(focusedKey(r)).toBe('apple');

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		// banana is disabled: focus skips straight to cactus.
		expect(focusedKey(r)).toBe('cactus');
		expect(option(r, 'banana').getAttribute('aria-disabled')).toBe('true');
		r.unmount();
	});
});

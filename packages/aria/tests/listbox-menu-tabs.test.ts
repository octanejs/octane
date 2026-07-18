import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ListBoxHarness,
	MenuHarness,
	MenuTriggerHarness,
	SectionedListBoxHarness,
	TabsHarness,
	FRUITS,
} from './_fixtures/listbox-menu-tabs.tsx';

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

// Behavioral coverage for the listbox, menu, and tabs hook families
// (useListBox/useOption/useListBoxSection over useListState, useMenu/useMenuItem/
// useMenuTrigger over useTreeState + useMenuTriggerState, and useTabList/useTab/
// useTabPanel over useTabListState). Real focus is used throughout — jsdom's
// activeElement is the oracle for focus movement.

type Mounted = ReturnType<typeof mount>;

function byKey(r: Mounted, key: string): HTMLElement {
	return r.container.querySelector(`[data-key="${key}"]`) as HTMLElement;
}

function output(r: Mounted): HTMLElement {
	return r.container.querySelector('output') as HTMLElement;
}

function keydown(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
}

function keyup(el: Element, key: string, init: KeyboardEventInit = {}): void {
	el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
}

describe('@octanejs/aria — useListBox / useOption', () => {
	it('wires listbox/option roles, label association, and per-item ids over a dynamic collection', async () => {
		const r = mount(ListBoxHarness, {});
		const ul = r.container.querySelector('[role="listbox"]') as HTMLElement;
		expect(ul).toBeTruthy();
		// The visual label (rendered as a span) labels the listbox element.
		const label = r.container.querySelector('span') as HTMLElement;
		expect(label.id).toBeTruthy();
		expect(ul.getAttribute('aria-labelledby')).toBe(label.id);
		expect(ul.getAttribute('aria-orientation')).toBe('vertical');

		// The dynamic collection (items + render function) renders one option per item.
		const options = r.container.querySelectorAll('[role="option"]');
		expect(options.length).toBe(3);
		// Option ids derive from the shared list id (getItemId contract).
		expect(byKey(r, 'apple').id).toBe(`${ul.id}-option-apple`);
		// Single selection mode: options expose aria-selected.
		expect(byKey(r, 'apple').getAttribute('aria-selected')).toBe('false');

		// Updating the items prop re-renders the collection.
		await act(() => {
			r.root.render(ListBoxHarness as any, {
				items: [...FRUITS, { id: 'date', name: 'Date' }],
			});
		});
		expect(r.container.querySelectorAll('[role="option"]').length).toBe(4);
		expect(byKey(r, 'date').textContent).toBe('Date');
		r.unmount();
	});

	it('arrow navigation moves focus and Space selects the focused option', async () => {
		const r = mount(ListBoxHarness, {});
		const ul = r.container.querySelector('[role="listbox"]') as HTMLElement;
		await act(() => ul.focus());
		expect(output(r).getAttribute('data-focused-key')).toBe('apple');
		expect(document.activeElement).toBe(byKey(r, 'apple'));

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(output(r).getAttribute('data-focused-key')).toBe('banana');
		expect(document.activeElement).toBe(byKey(r, 'banana'));

		await act(() => {
			keydown(document.activeElement!, ' ');
			keyup(document.activeElement!, ' ');
		});
		expect(output(r).getAttribute('data-selected')).toBe('banana');
		expect(byKey(r, 'banana').getAttribute('aria-selected')).toBe('true');
		expect(byKey(r, 'apple').getAttribute('aria-selected')).toBe('false');
		r.unmount();
	});

	it('sections render role=group labelled by their presentation heading', async () => {
		const r = mount(SectionedListBoxHarness, {});
		const groups = r.container.querySelectorAll('[role="group"]');
		expect(groups.length).toBe(2);

		const first = groups[0] as HTMLElement;
		const heading = first.parentElement!.querySelector('span') as HTMLElement;
		// The heading is presentational and only labels the nested group.
		expect(heading.getAttribute('role')).toBe('presentation');
		expect(heading.textContent).toBe('Fruits');
		expect(first.getAttribute('aria-labelledby')).toBe(heading.id);
		// The wrapper list item is presentational.
		expect(first.parentElement!.getAttribute('role')).toBe('presentation');
		// Options live inside the groups.
		expect(r.container.querySelectorAll('[role="option"]').length).toBe(4);

		// Keyboard navigation crosses the section boundary.
		const ul = r.container.querySelector('[role="listbox"]') as HTMLElement;
		await act(() => ul.focus());
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(document.activeElement).toBe(byKey(r, 'carrot'));
		r.unmount();
	});
});

describe('@octanejs/aria — useMenu / useMenuItem / useMenuTrigger', () => {
	it('wires menu and menuitem roles (menuitemradio under single selection)', async () => {
		const r = mount(MenuHarness, {});
		const menu = r.container.querySelector('[role="menu"]') as HTMLElement;
		expect(menu).toBeTruthy();
		expect(menu.getAttribute('aria-label')).toBe('Actions');
		expect(r.container.querySelectorAll('[role="menuitem"]').length).toBe(3);
		r.unmount();

		const single = mount(MenuHarness, { selectionMode: 'single' });
		const radios = single.container.querySelectorAll('[role="menuitemradio"]');
		expect(radios.length).toBe(3);
		expect(radios[0].getAttribute('aria-checked')).toBe('false');
		single.unmount();
	});

	it('arrow keys move focus through menu items and wrap by default', async () => {
		const r = mount(MenuHarness, {});
		const menu = r.container.querySelector('[role="menu"]') as HTMLElement;
		await act(() => menu.focus());
		expect(output(r).getAttribute('data-focused-key')).toBe('cut');
		expect(document.activeElement).toBe(byKey(r, 'cut'));

		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(output(r).getAttribute('data-focused-key')).toBe('copy');
		expect(document.activeElement).toBe(byKey(r, 'copy'));

		// Menus wrap keyboard navigation by default (shouldFocusWrap = true).
		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		await act(() => keydown(document.activeElement!, 'ArrowUp'));
		expect(output(r).getAttribute('data-focused-key')).toBe('paste');
		r.unmount();
	});

	it('Enter activates the focused item via onAction and closes the menu', async () => {
		const actions: Array<[any, any]> = [];
		const closes: string[] = [];
		const r = mount(MenuHarness, {
			onAction: (key: any, value: any) => actions.push([key, value]),
			onClose: () => closes.push('close'),
		});
		const menu = r.container.querySelector('[role="menu"]') as HTMLElement;
		await act(() => menu.focus());
		await act(() => keydown(document.activeElement!, 'ArrowDown'));
		expect(document.activeElement).toBe(byKey(r, 'copy'));

		await act(() => keydown(document.activeElement!, 'Enter'));
		expect(actions).toEqual([['copy', { id: 'copy', name: 'Copy' }]]);
		// selectionMode 'none': Enter activation closes the menu.
		expect(closes).toEqual(['close']);
		r.unmount();
	});

	it('ArrowDown on the trigger opens the menu with focusStrategy "first" and wires aria attributes', async () => {
		const r = mount(MenuTriggerHarness, {});
		const button = r.container.querySelector('button') as HTMLButtonElement;
		expect(button.getAttribute('aria-haspopup')).toBe('true');
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('aria-controls')).toBe(null);
		expect(output(r).getAttribute('data-open')).toBe('false');

		await act(() => {
			button.focus();
			keydown(button, 'ArrowDown');
		});

		// The trigger state opened with the 'first' focus strategy.
		expect(output(r).getAttribute('data-open')).toBe('true');
		expect(output(r).getAttribute('data-focus-strategy')).toBe('first');

		const menu = r.container.querySelector('[role="menu"]') as HTMLElement;
		expect(menu).toBeTruthy();
		// aria-expanded/aria-controls point at the now-open overlay.
		expect(button.getAttribute('aria-expanded')).toBe('true');
		expect(button.getAttribute('aria-controls')).toBe(menu.id);
		// The menu is labelled by its trigger.
		expect(menu.getAttribute('aria-labelledby')).toBe(button.id);
		// focusStrategy 'first' autofocuses the first menu item.
		expect(document.activeElement).toBe(byKey(r, 'cut'));
		r.unmount();
	});
});

describe('@octanejs/aria — useTabList / useTab / useTabPanel', () => {
	it('wires tablist/tab/tabpanel roles, roving tabIndex, and tab↔panel labelling', async () => {
		const r = mount(TabsHarness, {});
		// Default selection is established by useTabListState's mount effect.
		await act(() => {});
		const tablist = r.container.querySelector('[role="tablist"]') as HTMLElement;
		expect(tablist).toBeTruthy();
		expect(tablist.getAttribute('aria-orientation')).toBe('horizontal');
		expect(tablist.getAttribute('aria-label')).toBe('Tabs');
		// The tablist is not itself a tab stop (roving tabindex lives on the tabs).
		expect(tablist.getAttribute('tabindex')).toBe(null);

		const tabs = r.container.querySelectorAll('[role="tab"]');
		expect(tabs.length).toBe(3);
		// The first tab is selected by default and is the single tab stop.
		expect(byKey(r, 'one').getAttribute('aria-selected')).toBe('true');
		expect(byKey(r, 'two').getAttribute('aria-selected')).toBe('false');
		expect(byKey(r, 'one').tabIndex).toBe(0);
		expect(byKey(r, 'two').tabIndex).toBe(-1);

		const panel = r.container.querySelector('[role="tabpanel"]') as HTMLElement;
		expect(panel).toBeTruthy();
		// No tabbable children: the panel itself is focusable.
		expect(panel.tabIndex).toBe(0);
		// The selected tab advertises aria-controls derived from its OWN key; unselected
		// tabs do not claim the panel. NB: with default selection established by
		// useTabListState's mount effect (not synchronously), react-aria's useId locks the
		// panel's own id to the first render's value (`-tabpanel-null`), so panel.id does
		// NOT equal the selected tab's aria-controls in this raw-hook usage. This exactly
		// matches real react-aria — see the byte-identical differential in
		// tests/differential/parity-collections.test.ts.
		expect(byKey(r, 'one').getAttribute('aria-controls')).toMatch(/-tabpanel-one$/);
		expect(byKey(r, 'two').getAttribute('aria-controls')).toBe(null);
		// The panel is labelled by the currently selected tab.
		expect(panel.getAttribute('aria-labelledby')).toBe(byKey(r, 'one').id);
		r.unmount();
	});

	it('arrow keys move focus AND selection (automatic activation), wrapping at the ends', async () => {
		const r = mount(TabsHarness, {});
		await act(() => byKey(r, 'one').focus());

		await act(() => keydown(document.activeElement!, 'ArrowRight'));
		expect(output(r).getAttribute('data-selected-key')).toBe('two');
		expect(document.activeElement).toBe(byKey(r, 'two'));
		expect(byKey(r, 'two').getAttribute('aria-selected')).toBe('true');
		expect(byKey(r, 'one').getAttribute('aria-selected')).toBe('false');
		// Roving tabindex follows the selection.
		expect(byKey(r, 'two').tabIndex).toBe(0);
		expect(byKey(r, 'one').tabIndex).toBe(-1);
		// The panel relabels to the newly selected tab.
		const panel = r.container.querySelector('[role="tabpanel"]') as HTMLElement;
		expect(panel.getAttribute('aria-labelledby')).toBe(byKey(r, 'two').id);

		await act(() => keydown(document.activeElement!, 'ArrowLeft'));
		expect(output(r).getAttribute('data-selected-key')).toBe('one');

		// The tabs delegate wraps: ArrowLeft from the first tab reaches the last.
		await act(() => keydown(document.activeElement!, 'ArrowLeft'));
		expect(output(r).getAttribute('data-selected-key')).toBe('three');
		expect(document.activeElement).toBe(byKey(r, 'three'));
		r.unmount();
	});

	it('disabled tabs are skipped by keyboard navigation and marked aria-disabled', async () => {
		const r = mount(TabsHarness, { disabledKeys: ['two'] });
		expect(byKey(r, 'two').getAttribute('aria-disabled')).toBe('true');
		// Disabled tabs are removed from the tab order entirely.
		expect(byKey(r, 'two').getAttribute('tabindex')).toBe(null);

		await act(() => byKey(r, 'one').focus());
		await act(() => keydown(document.activeElement!, 'ArrowRight'));
		// 'two' is disabled: focus and selection skip straight to 'three'.
		expect(output(r).getAttribute('data-selected-key')).toBe('three');
		expect(document.activeElement).toBe(byKey(r, 'three'));
		r.unmount();
	});
});

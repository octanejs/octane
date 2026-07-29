import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { TYPEAHEAD_RESET_MS } from '@octanejs/base-ui/utils/constants';
import { Menu } from '@octanejs/base-ui/menu';
import {
	MenuInteractive,
	MenuItemsInteractive,
	MenuOpenWithSubmenuOpen,
	MenuSubmenuInteractive,
	MenuWithHandle,
} from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for Menu's open/close + focus flow. The differential rig proves the OPEN menu's
// DOM matches real Base UI byte-for-byte; what it cannot see is focus movement, keyboard-driven
// open, and the trigger↔popup wiring that only exists while a real trigger drives the store. Those
// are Phase 3f stage 1's whole point — `Menu.Root` is the first consumer of the Phase 3e
// `useListNavigation`/`useTypeahead` infrastructure, which landed with no tests of its own.
//
// SCOPE: item-level roving focus (arrow keys moving `data-highlighted` between items, typeahead
// matching a label) needs `Menu.Item`, which lands in stage 2. What stage 1 owns and this file
// covers is the layer below it: the trigger's list-navigation `trigger` bag opening the menu on an
// arrow key, the popup's list-navigation `floating` bag being published into the store, and the
// focus manager taking/returning focus.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

/**
 * Settle until `predicate` holds, or give up after `timeoutMs`.
 *
 * Focus assertions need this rather than a fixed number of `settle()` ticks: the focus manager
 * hands off through `enqueueFocus` (an animation frame), so on a loaded machine the focus can land
 * a few frames later than a four-iteration settle. That made the focus assertions here pass in a
 * `--project base-ui` run and fail inside a full `pnpm test`. Waiting for the condition keeps the
 * assertion exactly as strong while removing the timing dependence — the `expect` after the wait
 * still fails loudly if focus never arrives.
 */
async function settleUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate() && Date.now() < deadline) {
		await settle();
	}
}

function key(target: Element, k: string): void {
	flushSync(() => {
		target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/base-ui — Menu behavior', () => {
	it('the trigger opens the menu (Positioner → Popup mounts) and toggles it closed again', async () => {
		const m = mount(MenuInteractive);
		await settle();

		expect(m.container.querySelector('[role="menu"]')).toBe(null);

		m.click('.menu-trigger');
		await settle();

		const popup = m.container.querySelector('[role="menu"]');
		expect(popup).not.toBe(null);
		expect(popup!.classList.contains('menu-popup')).toBe(true);
		expect(popup!.closest('.menu-positioner')).not.toBe(null);

		// `useClick({ toggle: true })` — pressing the trigger again closes it.
		m.click('.menu-trigger');
		await settle();
		expect(m.container.querySelector('[role="menu"]')).toBe(null);

		m.unmount();
	});

	it('wires the trigger and popup together with the menu ARIA contract', async () => {
		const m = mount(MenuInteractive);
		await settle();

		const trigger = m.find('.menu-trigger');
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');

		m.click('.menu-trigger');
		await settle();

		const popup = m.find('.menu-popup');
		// `Menu.Root` merges `aria-expanded` into the ACTIVE trigger props once this trigger owns
		// the open popup.
		expect(m.find('.menu-trigger').getAttribute('aria-expanded')).toBe('true');
		// aria-controls ↔ popup id, and the popup labels itself with the trigger.
		expect(m.find('.menu-trigger').getAttribute('aria-controls')).toBe(popup.id);
		expect(popup.getAttribute('aria-labelledby')).toBe(m.find('.menu-trigger').id);
		// `data-rootownerid` is what `findRootOwnerId` walks up to, so a mouseup landing in another
		// popup of the same root can be told apart from one landing outside the menu tree.
		expect(popup.getAttribute('data-rootownerid')).toBeTruthy();
		// The trigger carries the pressable open-state attributes.
		expect(m.find('.menu-trigger').hasAttribute('data-popup-open')).toBe(true);

		m.unmount();
	});

	it('publishes the Phase 3e list-navigation props onto the popup', async () => {
		const m = mount(MenuInteractive);
		await settle();

		m.click('.menu-trigger');
		await settle();

		// `useListNavigation`'s `floating` bag reaches the popup through
		// `Menu.Root` → `usePopupInteractionProps` → the store's `popupProps`. The orientation
		// attribute is the observable proof that the hook is wired to this popup (the fixture's
		// Root uses the default `orientation="vertical"`).
		expect(m.find('.menu-popup').getAttribute('aria-orientation')).toBe('vertical');

		m.unmount();
	});

	it('opens on ArrowDown from the trigger (list-navigation trigger bag)', async () => {
		const m = mount(MenuInteractive);
		await settle();

		// A non-navigation key must not open it — otherwise this test would pass on any keydown.
		key(m.find('.menu-trigger'), 'a');
		await settle();
		expect(m.container.querySelector('[role="menu"]')).toBe(null);

		key(m.find('.menu-trigger'), 'ArrowDown');
		await settle();

		expect(m.container.querySelector('[role="menu"]')).not.toBe(null);

		m.unmount();
	});

	it('Escape dismisses the menu (useDismiss escape path)', async () => {
		const m = mount(MenuInteractive);
		await settle();

		m.click('.menu-trigger');
		await settle();
		expect(m.container.querySelector('[role="menu"]')).not.toBe(null);

		key(document, 'Escape');
		await settle();
		expect(m.container.querySelector('[role="menu"]')).toBe(null);

		m.unmount();
	});

	it('moves focus into the popup on open and back to the trigger on close', async () => {
		const m = mount(MenuInteractive);
		await settle();

		m.click('.menu-trigger');
		await settle();

		const popup = m.find('.menu-popup');
		// `Menu.Popup` runs the focus manager with `initialFocus` on for a non-submenu; with no
		// items yet the popup itself takes focus (it carries `tabindex="-1"`).
		await settleUntil(() => popup.contains(document.activeElement));
		expect(popup.contains(document.activeElement)).toBe(true);

		key(document, 'Escape');
		await settle();

		// `returnFocus` is on for a top-level dropdown, so focus lands back on the trigger.
		await settleUntil(() => document.activeElement === m.find('.menu-trigger'));
		expect(document.activeElement).toBe(m.find('.menu-trigger'));

		m.unmount();
	});

	// `MenuStore.setOpen` does NOT apply the open change itself — it emits `setOpen` on the floating
	// root context's event bus, and `Menu.Root` is the sole listener. That indirection is what lets a
	// holder of the store ALONE drive the Root: a `Menu.Trigger` rendered outside `Menu.Root`, or
	// `handle.open()` / `handle.close()` called from anywhere.
	//
	// It also means the store's `floatingRootContext` must be the SAME object `Menu.Root` built with
	// `useSyncedFloatingRootContext` — Menu (unlike Dialog/Popover, which construct one in the store
	// constructor via `usePopupStore`) installs it from Root through `usePopupInteractionProps`'s
	// synced state, exactly as upstream `MenuRoot.tsx` does. If it were left as the empty placeholder
	// from `createInitialPopupStoreState`, every assertion below would fail: the emit would reach a
	// bus with no listener and nothing would open.
	describe('detached triggers and the imperative handle', () => {
		it('opens and closes through the handle, and through a trigger rendered outside Menu.Root', async () => {
			const handle = Menu.createHandle();
			const m = mount(MenuWithHandle, { handle });
			await settle();

			expect(handle.isOpen).toBe(false);
			expect(m.container.querySelector('[role="menu"]')).toBe(null);

			// The trigger is a sibling of `Menu.Root`, associated only by the shared handle.
			m.click('.menu-trigger');
			await settle();
			expect(handle.isOpen).toBe(true);
			expect(m.container.querySelector('[role="menu"]')).not.toBe(null);

			handle.close();
			await settle();
			expect(handle.isOpen).toBe(false);
			expect(m.container.querySelector('[role="menu"]')).toBe(null);

			// ...and imperatively, naming the registered trigger id.
			handle.open('detached-menu-trigger');
			await settle();
			expect(handle.isOpen).toBe(true);
			const popup = m.find('.menu-popup');
			// The popup labels itself with the trigger that opened it, so the handle really did
			// associate the two rather than just flipping a boolean.
			expect(popup.getAttribute('aria-labelledby')).toBe('detached-menu-trigger');

			handle.close();
			await settle();
			expect(m.container.querySelector('[role="menu"]')).toBe(null);

			m.unmount();
		});

		it('throws when the handle names a trigger that is not registered', async () => {
			const handle = Menu.createHandle();
			const m = mount(MenuWithHandle, { handle });
			await settle();

			expect(() => handle.open('no-such-trigger')).toThrow(/No trigger found with id/);

			m.unmount();
		});
	});

	// Phase 3f STAGE 2. `Menu.Item` and friends register with the positioner's `CompositeList`, which
	// is what finally gives Phase 3e's `useListNavigation` and `useTypeahead` something to drive.
	// None of this is visible in a mount-time innerHTML snapshot, so it lives here rather than in the
	// differential rig.
	describe('items: roving focus, typeahead and activation', () => {
		function highlightedLabel(m: { container: HTMLElement }): string | null {
			const el = m.container.querySelector('[data-highlighted]');
			return el ? el.textContent : null;
		}

		async function openWithItems() {
			const m = mount(MenuItemsInteractive);
			await settle();
			m.click('.menu-trigger');
			await settle();
			return m;
		}

		it('arrow keys rove data-highlighted between items, skipping the roving-focus tabindex', async () => {
			const m = await openWithItems();

			const popup = m.find('.menu-popup');
			// `useListNavigation` highlights the first item as the menu opens.
			expect(highlightedLabel(m)).toBe('Apple');

			key(popup, 'ArrowDown');
			await settle();
			expect(highlightedLabel(m)).toBe('Banana');

			key(popup, 'ArrowDown');
			await settle();
			expect(highlightedLabel(m)).toBe('Cherry');

			key(popup, 'ArrowUp');
			await settle();
			expect(highlightedLabel(m)).toBe('Banana');

			// Exactly one item is highlighted at a time, and it is the one holding the roving
			// tabindex=0 (`open && highlighted ? 0 : -1` in useMenuItemCommonProps).
			expect(m.findAll('[data-highlighted]').length).toBe(1);
			expect(m.find('[data-highlighted]').getAttribute('tabindex')).toBe('0');
			expect(
				m.findAll('.menu-item').filter((el) => el.getAttribute('tabindex') === '0').length,
			).toBe(1);

			m.unmount();
		});

		it('End/Home jump to the last and first items', async () => {
			const m = await openWithItems();
			const popup = m.find('.menu-popup');

			key(popup, 'End');
			await settle();
			expect(highlightedLabel(m)).toBe('Fig');

			key(popup, 'Home');
			await settle();
			expect(highlightedLabel(m)).toBe('Apple');

			m.unmount();
		});

		it('typeahead highlights the item whose label matches the typed character', async () => {
			const m = await openWithItems();
			const popup = m.find('.menu-popup');
			expect(highlightedLabel(m)).toBe('Apple');

			// `useTypeahead` matches against the labels `useCompositeListItem` collected from each
			// item's text content.
			key(popup, 'c');
			await settle();
			expect(highlightedLabel(m)).toBe('Cherry');

			// The buffer ACCUMULATES rather than matching each keystroke independently: 'b' then a
			// quick 'a' searches for "ba", so it stays on Banana. A non-accumulating implementation
			// would jump to Apple on the 'a'.
			await new Promise((res) => setTimeout(res, TYPEAHEAD_RESET_MS + 100));
			key(popup, 'b');
			await settle();
			expect(highlightedLabel(m)).toBe('Banana');

			key(popup, 'a');
			await settle();
			expect(highlightedLabel(m)).toBe('Banana');

			// ...and it resets after `TYPEAHEAD_RESET_MS`, so a fresh 'a' starts a new search.
			await new Promise((res) => setTimeout(res, TYPEAHEAD_RESET_MS + 100));
			key(popup, 'a');
			await settle();
			expect(highlightedLabel(m)).toBe('Apple');

			m.unmount();
		});

		it('clicking a plain item closes the menu (closeOnClick defaults to true)', async () => {
			const m = await openWithItems();
			expect(m.container.querySelector('[role="menu"]')).not.toBe(null);

			m.click('.menu-item');
			await settle();

			expect(m.container.querySelector('[role="menu"]')).toBe(null);

			m.unmount();
		});

		it('a checkbox item toggles its checked state and keeps the menu open', async () => {
			const m = await openWithItems();

			const item = m.find('.menu-check');
			expect(item.getAttribute('role')).toBe('menuitemcheckbox');
			expect(item.getAttribute('aria-checked')).toBe('false');
			// `itemMapping` renders the checked state as a present/absent attribute PAIR.
			expect(item.hasAttribute('data-unchecked')).toBe(true);
			expect(item.hasAttribute('data-checked')).toBe(false);
			// The indicator is transition-mounted, so it is absent while unchecked.
			expect(m.container.querySelector('.menu-check-ind')).toBe(null);

			m.click('.menu-check');
			await settle();

			const checked = m.find('.menu-check');
			expect(checked.getAttribute('aria-checked')).toBe('true');
			expect(checked.hasAttribute('data-checked')).toBe(true);
			expect(checked.hasAttribute('data-unchecked')).toBe(false);
			expect(m.container.querySelector('.menu-check-ind')).not.toBe(null);
			// `closeOnClick` defaults to false for checkbox items.
			expect(m.container.querySelector('[role="menu"]')).not.toBe(null);

			// Unchecking drops the indicator on the SAME commit — Base UI's menu indicators gate on
			// `checked` rather than the transition `mounted` flag, so there is no exit transition.
			// See the UPSTREAM QUIRK note in `src/menu.ts`; the differential toggle step proves the
			// real `@base-ui/react` does the same.
			m.click('.menu-check');
			await settle();
			expect(m.find('.menu-check').getAttribute('aria-checked')).toBe('false');
			expect(m.container.querySelector('.menu-check-ind')).toBe(null);

			m.unmount();
		});

		it('a radio item selects within its group and keeps the menu open', async () => {
			const m = await openWithItems();

			const radios = m.findAll('.menu-radio');
			expect(radios.map((el) => el.getAttribute('aria-checked'))).toEqual(['true', 'false']);
			expect(radios[0].getAttribute('role')).toBe('menuitemradio');

			radios[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			await settle();

			const after = m.findAll('.menu-radio');
			expect(after.map((el) => el.getAttribute('aria-checked'))).toEqual(['false', 'true']);
			expect(after[1].hasAttribute('data-checked')).toBe(true);
			expect(after[0].hasAttribute('data-unchecked')).toBe(true);
			expect(m.container.querySelector('[role="menu"]')).not.toBe(null);

			m.unmount();
		});
	});

	// Phase 3f STAGE 3. A `SubmenuTrigger` is simultaneously an ITEM of the parent menu and the
	// TRIGGER of its own, and opening a submenu is what finally runs the sibling-close, parent-close
	// and item-hover relays `Menu.Positioner` has carried inertly since stage 1.
	describe('submenus', () => {
		it('opens a submenu from its trigger and closes it with Escape, leaving the parent open', async () => {
			const m = mount(MenuSubmenuInteractive);
			await settle();

			m.click('.menu-trigger');
			await settle();
			expect(m.container.querySelector('.menu-popup')).not.toBe(null);
			expect(m.container.querySelector('.submenu-popup')).toBe(null);

			// `openOnHover={false}` on this fixture's trigger, so a press opens it.
			m.click('.menu-subtrigger');
			await settle();
			expect(m.container.querySelector('.submenu-popup')).not.toBe(null);

			// Escape from INSIDE the tree closes only the CHILD: `closeParentOnEsc` defaults to
			// false, which is what the `bubbles: { escapeKey: ... }` option on the submenu's
			// useDismiss controls. (Dispatching on `document` instead would close both, since that
			// target is outside BOTH floating elements and each dismisses independently — the
			// single-level tests above can use `document` precisely because there is only one menu.)
			key(m.find('.submenu-popup'), 'Escape');
			await settle();
			expect(m.container.querySelector('.submenu-popup')).toBe(null);
			expect(m.container.querySelector('.menu-popup')).not.toBe(null);

			m.unmount();
		});

		it('marks the trigger expanded and wires it to the submenu popup', async () => {
			const m = mount(MenuSubmenuInteractive);
			await settle();
			m.click('.menu-trigger');
			await settle();

			const closed = m.find('.menu-subtrigger');
			expect(closed.getAttribute('role')).toBe('menuitem');
			expect(closed.getAttribute('aria-haspopup')).toBe('menu');
			expect(closed.getAttribute('aria-expanded')).toBe('false');

			m.click('.menu-subtrigger');
			await settle();

			const open = m.find('.menu-subtrigger');
			expect(open.getAttribute('aria-expanded')).toBe('true');
			expect(open.hasAttribute('data-popup-open')).toBe(true);
			// The trigger owns its own id (it is also a parent item), and the submenu popup labels
			// itself with it — this is what the `delete rootTriggerProps.id` line protects.
			expect(open.getAttribute('aria-controls')).toBe(m.find('.submenu-popup').id);
			expect(m.find('.submenu-popup').getAttribute('aria-labelledby')).toBe(open.id);

			m.unmount();
		});

		it('highlights the submenu trigger while its submenu is open', async () => {
			// The differential rig cannot see this: the trigger is the only tabbable child of the
			// parent popup while open, so the parent's focus manager focuses it and its `onFocus`
			// sets the PARENT store's `activeIndex`. With both runtimes sharing one
			// `document.activeElement`, only one can win. Mounted alone, octane matches React.
			const m = mount(MenuOpenWithSubmenuOpen);
			await settle();

			const sub = m.find('.menu-subtrigger');
			await settleUntil(() => sub.hasAttribute('data-highlighted'));
			expect(sub.hasAttribute('data-highlighted')).toBe(true);
			expect(sub.getAttribute('tabindex')).toBe('0');
			expect(document.activeElement).toBe(sub);
			// Exactly one item is highlighted across the whole parent menu.
			expect(m.findAll('[data-highlighted]').length).toBe(1);

			m.unmount();
		});

		it('nests the submenu: inline-end placement, data-nested, and a shared root owner id', async () => {
			const m = mount(MenuOpenWithSubmenuOpen);
			await settle();

			const submenuPopup = m.find('.submenu-popup');
			// `parent.type === 'menu'` flips the positioner defaults and marks the popup nested.
			expect(submenuPopup.getAttribute('data-side')).toBe('inline-end');
			expect(submenuPopup.getAttribute('data-align')).toBe('start');
			expect(submenuPopup.hasAttribute('data-nested')).toBe(true);
			expect(m.find('.menu-popup').hasAttribute('data-nested')).toBe(false);
			// `rootId` propagates from the parent store, so `findRootOwnerId` treats both popups as
			// belonging to the same menu tree.
			expect(submenuPopup.getAttribute('data-rootownerid')).toBe(
				m.find('.menu-popup').getAttribute('data-rootownerid'),
			);

			m.unmount();
		});
	});
});

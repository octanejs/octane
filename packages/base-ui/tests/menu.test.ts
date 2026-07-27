import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { Menu } from '@octanejs/base-ui/menu';
import { MenuInteractive, MenuWithHandle } from './_fixtures/base-ui-diff.tsrx';

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
		expect(popup.contains(document.activeElement)).toBe(true);

		key(document, 'Escape');
		await settle();

		// `returnFocus` is on for a top-level dropdown, so focus lands back on the trigger.
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
});

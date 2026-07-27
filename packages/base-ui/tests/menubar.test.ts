import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { MenubarInteractive } from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for Menubar — Phase 3f stage 4. The differential rig proves the rendered DOM
// matches Base UI; what it cannot see is the cross-menu coordination a menubar exists for: opening
// one menu closing its sibling, and the bar tracking whether any of its menus is open.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

describe('@octanejs/base-ui — Menubar behavior', () => {
	it('renders its triggers as composite menuitems with a single roving tabstop', async () => {
		const m = mount(MenubarInteractive);
		await settle();

		const bar = m.find('[role="menubar"]');
		expect(bar.getAttribute('aria-orientation')).toBe('horizontal');

		const triggers = m.findAll('.menubar-file, .menubar-edit');
		expect(triggers.length).toBe(2);
		// The `menubar` arm of Menu's parent union renders each trigger as a CompositeItem.
		expect(triggers.map((t) => t.getAttribute('role'))).toEqual(['menuitem', 'menuitem']);
		// Composite roving focus: exactly one trigger is in the tab order.
		expect(triggers.filter((t) => t.getAttribute('tabindex') === '0').length).toBe(1);

		m.unmount();
	});

	it('opens a menu from its trigger and marks the bar as having a submenu open', async () => {
		const m = mount(MenubarInteractive);
		await settle();

		expect(m.find('[role="menubar"]').hasAttribute('data-has-submenu-open')).toBe(false);
		expect(m.container.querySelector('.file-popup')).toBe(null);

		m.click('.menubar-file');
		await settle();

		expect(m.container.querySelector('.file-popup')).not.toBe(null);
		// `MenubarContent` listens on the shared FloatingTree for `menuopenchange` and lifts the
		// state onto the bar — this is what drives sibling open-on-hover.
		expect(m.find('[role="menubar"]').hasAttribute('data-has-submenu-open')).toBe(true);

		m.unmount();
	});

	it("pressing the open menu's own trigger closes it again", async () => {
		const m = mount(MenubarInteractive);
		await settle();

		m.click('.menubar-file');
		await settle();
		expect(m.container.querySelector('.file-popup')).not.toBe(null);

		// Once a menubar trigger owns the open menu its click event switches from `mousedown` to
		// `click` so the press toggles rather than reopening (`useMixedToggleClickHandler`).
		m.click('.menubar-file');
		await settle();
		expect(m.container.querySelector('.file-popup')).toBe(null);

		m.unmount();
	});

	// NOT covered: switching menus by moving the pointer across the bar. Once one menu is open the
	// sibling triggers become hover-driven (`openOnHover` follows the bar's `hasSubmenuOpen`), and
	// that path runs through `safePolygon` + rest timers, which need real pointer geometry — jsdom
	// reports zero-size rects. Same limitation as submenu open-on-hover in stage 3. A synthetic
	// press on a sibling is not a substitute: probed, it dismisses the open menu without opening
	// the sibling, which is the outside-press path rather than the handover being tested.

	it('clears the bar state once the open menu closes', async () => {
		const m = mount(MenubarInteractive);
		await settle();

		m.click('.menubar-file');
		await settle();
		expect(m.find('[role="menubar"]').hasAttribute('data-has-submenu-open')).toBe(true);

		flushSync(() => {
			m.find('.file-popup').dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		await settle();

		expect(m.container.querySelector('.file-popup')).toBe(null);
		expect(m.find('[role="menubar"]').hasAttribute('data-has-submenu-open')).toBe(false);

		m.unmount();
	});
});

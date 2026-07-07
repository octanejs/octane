import { describe, it, expect } from 'vitest';
import { mount } from '../../octane/tests/_helpers';
import { flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { PopoverInteractive } from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for Popover's open/close flow — the anchored positioner mounts the popup, focus
// management + dismiss aren't visible in innerHTML, so they can't be differential-tested. Exercises
// the trigger (useClick) → open → the full Positioner/Popup mount, and both close paths (the Close
// button + Escape via useDismiss), through the exit transition that unmounts the popup.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

describe('@octanejs/base-ui — Popover behavior', () => {
	it('trigger opens the popover (Positioner → Popup mounts); the Close button dismisses it', async () => {
		const m = mount(PopoverInteractive);
		await settle();

		// Closed: the popup is unmounted.
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		// Open via the trigger (useClick → store.setOpen(true)).
		m.click('.pop-trigger');
		await settle();
		const popup = m.container.querySelector('[role="dialog"]');
		expect(popup).not.toBe(null);
		expect(popup!.classList.contains('pop-popup')).toBe(true);
		// The popup sits inside the anchored positioner.
		expect(popup!.closest('.pop-positioner')).not.toBe(null);

		// Close via the Close button (store.setOpen(false) → exit transition → unmount).
		m.click('.pop-close');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		m.unmount();
	});

	it('Escape dismisses the popover (useDismiss escape path)', async () => {
		const m = mount(PopoverInteractive);
		await settle();

		m.click('.pop-trigger');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).not.toBe(null);

		flushSync(() => {
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		m.unmount();
	});
});

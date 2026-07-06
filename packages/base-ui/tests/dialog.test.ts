import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { DialogInteractive } from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for Dialog's open/close flow — focus trapping + dismiss aren't visible in
// innerHTML, so they can't be differential-tested. Exercises the trigger (useClick) → open → mount,
// and both close paths (the Close button + Escape via useDismiss), through the transition that
// unmounts the popup.
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

describe('@octanejs/base-ui — Dialog behavior', () => {
	it('trigger opens the dialog; the Close button dismisses it', async () => {
		const m = mount(DialogInteractive);
		await settle();

		// Closed: the popup is unmounted.
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		// Open via the trigger (useClick → store.setOpen(true)).
		m.click('.dlg-trigger');
		await settle();
		const popup = m.container.querySelector('[role="dialog"]');
		expect(popup).not.toBe(null);
		expect(popup!.classList.contains('dlg-popup')).toBe(true);

		// Close via the Close button (store.setOpen(false) → exit transition → unmount).
		m.click('.dlg-close');
		await settle();
		expect(m.container.querySelector('[role="dialog"]')).toBe(null);

		m.unmount();
	});

	it('Escape dismisses the dialog (useDismiss escape path)', async () => {
		const m = mount(DialogInteractive);
		await settle();

		m.click('.dlg-trigger');
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

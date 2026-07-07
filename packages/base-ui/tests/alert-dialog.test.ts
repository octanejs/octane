import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { AlertDialogInteractive } from './_fixtures/base-ui-diff.tsrx';

// Behavior tests for AlertDialog's open/close flow. AlertDialog forces modal + disables
// outside-press dismissal, but Escape + the Close button still dismiss. The popup carries
// role="alertdialog". Not differential-testable (focus/dismiss aren't visible in innerHTML).
async function settle(): Promise<void> {
	for (let i = 0; i < 4; i += 1) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 0));
	}
}

describe('@octanejs/base-ui — AlertDialog behavior', () => {
	it('trigger opens the alert dialog (role=alertdialog); the Close button dismisses it', async () => {
		const m = mount(AlertDialogInteractive);
		await settle();

		expect(m.container.querySelector('[role="alertdialog"]')).toBe(null);

		m.click('.ad-trigger');
		await settle();
		const popup = m.container.querySelector('[role="alertdialog"]');
		expect(popup).not.toBe(null);
		expect(popup!.classList.contains('ad-popup')).toBe(true);

		m.click('.ad-close');
		await settle();
		expect(m.container.querySelector('[role="alertdialog"]')).toBe(null);

		m.unmount();
	});

	it('Escape dismisses the alert dialog (useDismiss escape path stays enabled)', async () => {
		const m = mount(AlertDialogInteractive);
		await settle();

		m.click('.ad-trigger');
		await settle();
		expect(m.container.querySelector('[role="alertdialog"]')).not.toBe(null);

		flushSync(() => {
			document.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect(m.container.querySelector('[role="alertdialog"]')).toBe(null);

		m.unmount();
	});
});

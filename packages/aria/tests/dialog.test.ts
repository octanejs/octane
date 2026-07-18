import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { DialogHarness } from './_fixtures/dialog.tsx';

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the Phase-3 dialog hook (aria/useDialog). Asserts the ARIA wiring a
// consumer observes — the role, the title↔aria-labelledby link, tabIndex=-1 — and the mount
// autofocus (useDialog focuses the dialog container via focusSafely on mount).
describe('@octanejs/aria — useDialog', () => {
	it('wires role="dialog", tabIndex=-1, and aria-labelledby ↔ the title id', async () => {
		const r = mount(DialogHarness, {});
		const dialog = r.find('[data-testid="dialog"]') as HTMLElement;
		const title = r.find('[data-testid="title"]') as HTMLElement;

		expect(dialog.getAttribute('role')).toBe('dialog');
		expect(dialog.getAttribute('tabindex')).toBe('-1');

		const titleId = title.getAttribute('id');
		expect(titleId).toBeTruthy();
		expect(dialog.getAttribute('aria-labelledby')).toBe(titleId);

		r.unmount();
	});

	it('uses role="alertdialog" when requested', async () => {
		const r = mount(DialogHarness, { role: 'alertdialog' });
		const dialog = r.find('[data-testid="dialog"]') as HTMLElement;
		expect(dialog.getAttribute('role')).toBe('alertdialog');
		r.unmount();
	});

	it('prefers an explicit aria-label over the generated title id', async () => {
		const r = mount(DialogHarness, { 'aria-label': 'My dialog' });
		const dialog = r.find('[data-testid="dialog"]') as HTMLElement;
		// With aria-label present, useSlotId's title id is suppressed and not linked.
		expect(dialog.getAttribute('aria-label')).toBe('My dialog');
		expect(dialog.getAttribute('aria-labelledby')).toBeNull();
		r.unmount();
	});

	it('honors an explicit aria-labelledby prop over the generated title id', async () => {
		const r = mount(DialogHarness, { 'aria-labelledby': 'external-heading' });
		const dialog = r.find('[data-testid="dialog"]') as HTMLElement;
		expect(dialog.getAttribute('aria-labelledby')).toBe('external-heading');
		r.unmount();
	});

	it('focuses the dialog container on mount', async () => {
		const r = mount(DialogHarness, {});
		const dialog = r.find('[data-testid="dialog"]') as HTMLElement;

		// useDialog autofocuses the container (tabIndex=-1) via focusSafely once the mount
		// effect runs. Flush effects so the focus lands.
		await act(() => {});

		expect(dialog.contains(document.activeElement)).toBe(true);
		expect(document.activeElement).toBe(dialog);

		r.unmount();
	});
});

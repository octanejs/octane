import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { DialogApp } from './_fixtures/dialog.tsx';

// The full modal Dialog chain: Portal → Presence → Overlay (scroll lock + dismissable
// surface) → Content (FocusScope trap + DismissableLayer + hideOthers) → Title /
// Description / Close. Portal'd parts land in document.body, so queries go through
// `document` — and each test unmounts + settles so body-level state (guards, locks,
// listeners) is restored for the next.

// Drain passive effects + let macrotask-deferred setup (document listeners, layer-stack
// re-render, FocusScope's unmount setTimeout) run, a few rounds.
async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

describe('@octanejs/radix — Dialog (modal)', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed: trigger ARIA; no portal content', async () => {
		const r = mount(DialogApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-controls')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content"]')).toBe(null);
		expect($('[data-testid="overlay"]')).toBe(null);
		r.unmount();
	});

	it('open: portals overlay+content to body, wires ARIA, traps focus, locks body', async () => {
		const r = mount(DialogApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();

		const trigger = $('[data-testid="trigger"]')!;
		const content = $('[data-testid="content"]')!;
		const overlay = $('[data-testid="overlay"]')!;

		// Portal'd OUT of the app container, into body.
		expect(r.container.contains(content)).toBe(false);
		expect(document.body.contains(content)).toBe(true);
		expect(document.body.contains(overlay)).toBe(true);

		// ARIA wiring.
		expect(content.getAttribute('role')).toBe('dialog');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(content.getAttribute('id')).toBe(trigger.getAttribute('aria-controls'));
		expect(content.getAttribute('aria-labelledby')).toBe(
			$('[data-testid="title"]')!.getAttribute('id'),
		);
		expect(content.getAttribute('aria-describedby')).toBe(
			$('[data-testid="desc"]')!.getAttribute('id'),
		);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(overlay.getAttribute('data-state')).toBe('open');

		// Focus moved into the dialog (first tabbable).
		expect(content.contains(document.activeElement)).toBe(true);

		// Modal side effects: body scroll locked + outside pointer events disabled +
		// focus guards installed + the app subtree aria-hidden'd.
		expect(document.body.style.overflow).toBe('hidden');
		expect(document.body.style.pointerEvents).toBe('none');
		expect(document.querySelectorAll('[data-radix-focus-guard]').length).toBe(2);
		expect(r.container.getAttribute('aria-hidden')).toBe('true');
		expect(r.container.getAttribute('data-aria-hidden')).toBe('true');

		r.unmount();
	});

	it('Close button closes; state + body restored; trigger refocused', async () => {
		const r = mount(DialogApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		// The Close button is portal'd to document.body — outside the container-scoped
		// click helper — so click it directly.
		flushSync(() => ($('[data-testid="close"]') as HTMLElement).click());
		await settle();

		expect($('[data-testid="content"]')).toBe(null);
		expect($('[data-testid="overlay"]')).toBe(null);
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(document.body.style.overflow).toBe('');
		expect(document.body.style.pointerEvents).toBe('');
		expect(r.container.getAttribute('aria-hidden')).toBe(null);
		// onCloseAutoFocus returns focus to the trigger.
		expect(document.activeElement).toBe(trigger);
		r.unmount();
	});

	it('Escape closes', async () => {
		const r = mount(DialogApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		flushSync(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('pointer-down outside (the overlay) closes via the deferred click pairing', async () => {
		const r = mount(DialogApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();
		const overlay = $('[data-testid="overlay"]')!;

		// A left-button pointerdown on the overlay defers dismissal until the paired
		// click lands on a dismissable surface (the overlay itself).
		flushSync(() => {
			overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
		});
		flushSync(() => {
			overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
		});
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('focus is trapped: focusing outside yanks focus back into the content', async () => {
		const r = mount(DialogApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();
		const content = $('[data-testid="content"]')!;
		expect(content.contains(document.activeElement)).toBe(true);

		// Try to focus the outside button — the trap refocuses the last focused element.
		const outside = $('[data-testid="outside"]')! as HTMLElement;
		outside.focus();
		await settle();
		expect(content.contains(document.activeElement)).toBe(true);
		r.unmount();
	});
});

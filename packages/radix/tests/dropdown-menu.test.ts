import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { DropdownMenuApp, DropdownMenuWithSubApp } from './_fixtures/dropdown-menu.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

// Open via the trigger's pointerdown handler (left button).
function pressTrigger(): void {
	const trigger = $('[data-testid="trigger"]')!;
	flushSync(() => {
		trigger.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
		);
	});
}

// Menu items select on click (the pointerup path dispatches a click).
function clickItem(sel: string): void {
	const item = $(sel)!;
	flushSync(() => {
		item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/radix — DropdownMenu (Menu chain)', () => {
	afterEach(async () => {
		await settle();
	});

	it('opens on trigger pointer-down with role=menu content + items and a11y wiring', async () => {
		const r = mount(DropdownMenuApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content"]')).toBe(null);

		pressTrigger();
		await settle();

		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('menu');
		expect(content.getAttribute('aria-labelledby')).toBe(trigger.id);
		expect(content.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		// Popper-positioned in a portal.
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		// Items carry menu roles; the disabled one is marked.
		expect($('[data-testid="item-copy"]')!.getAttribute('role')).toBe('menuitem');
		expect($('[data-testid="item-delete"]')!.getAttribute('aria-disabled')).toBe('true');
		expect($('[data-testid="item-check"]')!.getAttribute('role')).toBe('menuitemcheckbox');
		expect($('[data-testid="radio-vanilla"]')!.getAttribute('role')).toBe('menuitemradio');
		// Radio state: vanilla selected (indicator present), chocolate not.
		expect($('[data-testid="radio-vanilla"]')!.getAttribute('aria-checked')).toBe('true');
		expect($('[data-testid="vanilla-indicator"]')).not.toBe(null);
		expect($('[data-testid="chocolate-indicator"]')).toBe(null);
		r.unmount();
	});

	it('item select fires onSelect and closes; disabled item does neither', async () => {
		const r = mount(DropdownMenuApp);
		await settle();
		pressTrigger();
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		clickItem('[data-testid="item-copy"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('copy');
		expect($('[data-testid="content"]')).toBe(null); // selection closes the menu

		pressTrigger();
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);
		clickItem('[data-testid="item-delete"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('copy'); // unchanged
		expect($('[data-testid="content"]')).not.toBe(null); // still open
		r.unmount();
	});

	it('checkbox and radio items update state through onSelect', async () => {
		const r = mount(DropdownMenuApp);
		await settle();
		pressTrigger();
		await settle();

		clickItem('[data-testid="item-check"]');
		await settle();
		expect($('[data-testid="checked"]')!.textContent).toBe('true');

		pressTrigger();
		await settle();
		// Checkbox now checked → indicator rendered, data-state=checked.
		expect($('[data-testid="check-indicator"]')).not.toBe(null);
		expect($('[data-testid="item-check"]')!.getAttribute('data-state')).toBe('checked');

		clickItem('[data-testid="radio-chocolate"]');
		await settle();
		expect($('[data-testid="flavor"]')!.textContent).toBe('chocolate');
		r.unmount();
	});

	it('Escape closes and returns focus to the trigger', async () => {
		const r = mount(DropdownMenuApp);
		await settle();
		pressTrigger();
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		flushSync(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		expect(document.activeElement).toBe($('[data-testid="trigger"]'));
		r.unmount();
	});

	it('ArrowDown on the trigger opens with keyboard entry focus; typeahead cycles matches', async () => {
		const r = mount(DropdownMenuApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		flushSync(() => {
			trigger.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		// Keyboard open → entry focus lands on the first item.
		expect(document.activeElement).toBe($('[data-testid="item-copy"]'));

		// Typeahead: already on "Copy", so "c" cycles to the NEXT match ("Chocolate")
		// after its deferred focus.
		flushSync(() => {
			content.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'c', bubbles: true, cancelable: true }),
			);
		});
		await new Promise((res) => setTimeout(res, 10));
		await settle();
		expect(document.activeElement).toBe($('[data-testid="radio-chocolate"]'));
		r.unmount();
	});

	it('submenu opens on ArrowRight from its trigger and closes on ArrowLeft', async () => {
		const r = mount(DropdownMenuWithSubApp);
		await settle();
		pressTrigger();
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);
		expect($('[data-testid="sub-content"]')).toBe(null);
		const subTrigger = $('[data-testid="sub-trigger"]')!;
		expect(subTrigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(subTrigger.getAttribute('data-state')).toBe('closed');

		// ArrowRight on the sub trigger opens the submenu (ltr).
		flushSync(() => {
			subTrigger.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		const subContent = $('[data-testid="sub-content"]')!;
		expect(subContent).not.toBe(null);
		expect(subContent.getAttribute('role')).toBe('menu');
		expect(subContent.getAttribute('aria-labelledby')).toBe(subTrigger.id);
		expect(subTrigger.getAttribute('data-state')).toBe('open');

		// ArrowLeft inside the submenu closes it (and refocuses the sub trigger).
		flushSync(() => {
			$('[data-testid="item-email"]')!.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect($('[data-testid="sub-content"]')).toBe(null);
		expect($('[data-testid="content"]')).not.toBe(null); // parent stays open
		expect(document.activeElement).toBe(subTrigger);

		// Selecting an item in a reopened submenu closes the WHOLE menu tree.
		flushSync(() => {
			subTrigger.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		clickItem('[data-testid="item-sms"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('sms');
		expect($('[data-testid="sub-content"]')).toBe(null);
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});
});

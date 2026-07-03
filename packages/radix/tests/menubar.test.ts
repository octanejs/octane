import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { MenubarApp } from './_fixtures/menubar.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

// Menubar content is portal'd to document.body, so queries are document-wide here
// (same as dropdown-menu.test.ts).
const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

// Triggers open on pointerdown (left button, no ctrl).
function pressTrigger(sel: string): void {
	const trigger = $(sel)!;
	flushSync(() => {
		trigger.dispatchEvent(
			new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
		);
	});
}

function keydown(sel: string, key: string): void {
	const el = $(sel)!;
	flushSync(() => {
		el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	});
}

describe('@octanejs/radix — Menubar', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders role=menubar with role=menuitem triggers and closed a11y wiring', async () => {
		const r = mount(MenubarApp);
		await settle();
		const menubar = $('[data-testid="menubar"]')!;
		expect(menubar.getAttribute('role')).toBe('menubar');
		// Horizontal roving focus group across the triggers.
		expect(menubar.getAttribute('data-orientation')).toBe('horizontal');

		const fileTrigger = $('[data-testid="trigger-file"]')!;
		expect(fileTrigger.tagName).toBe('BUTTON');
		expect(fileTrigger.getAttribute('role')).toBe('menuitem');
		expect(fileTrigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(fileTrigger.getAttribute('aria-expanded')).toBe('false');
		// Per menubar.test.tsx: no aria-controls reference while closed.
		expect(fileTrigger.hasAttribute('aria-controls')).toBe(false);
		expect(fileTrigger.getAttribute('data-state')).toBe('closed');

		// Disabled trigger is marked.
		const viewTrigger = $('[data-testid="trigger-view"]')!;
		expect(viewTrigger.getAttribute('data-disabled')).toBe('');
		expect((viewTrigger as HTMLButtonElement).disabled).toBe(true);

		// No content mounted while closed.
		expect($('[data-testid="content-file"]')).toBe(null);
		expect($('[data-testid="content-edit"]')).toBe(null);
		r.unmount();
	});

	it('opens on trigger pointer-down with aria-controls wiring; item select closes', async () => {
		const r = mount(MenubarApp);
		await settle();
		pressTrigger('[data-testid="trigger-file"]');
		await settle();

		const trigger = $('[data-testid="trigger-file"]')!;
		const content = $('[data-testid="content-file"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('menu');
		expect(content.getAttribute('aria-labelledby')).toBe(trigger.id);
		expect(content.hasAttribute('data-radix-menubar-content')).toBe(true);
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('aria-controls')).toBe(content.id);
		expect(document.getElementById(content.id)).toBe(content);

		// Selecting an item fires onSelect and closes the menubar menu.
		flushSync(() => {
			$('[data-testid="item-new"]')!.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('new');
		expect($('[data-testid="content-file"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('pointerenter on another trigger switches menus while one is open', async () => {
		const r = mount(MenubarApp);
		await settle();
		const editTrigger = $('[data-testid="trigger-edit"]')!;

		// While closed, pointerenter does nothing.
		flushSync(() => {
			editTrigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
		});
		await settle();
		expect($('[data-testid="content-edit"]')).toBe(null);

		pressTrigger('[data-testid="trigger-file"]');
		await settle();
		expect($('[data-testid="content-file"]')).not.toBe(null);

		flushSync(() => {
			editTrigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
		});
		await settle();
		expect($('[data-testid="content-file"]')).toBe(null);
		expect($('[data-testid="content-edit"]')).not.toBe(null);
		expect(editTrigger.getAttribute('data-state')).toBe('open');
		// The trigger is focused in the handler, then the mounting content takes focus
		// (Menu's FocusScope mount auto-focus focuses the content area; same as React).
		expect(document.activeElement).toBe($('[data-testid="content-edit"]'));
		r.unmount();
	});

	it('ArrowRight/ArrowLeft inside an open menu move to the next/previous menu (looping, skipping disabled)', async () => {
		const r = mount(MenubarApp);
		await settle();
		pressTrigger('[data-testid="trigger-file"]');
		await settle();
		expect($('[data-testid="content-file"]')).not.toBe(null);

		// ArrowRight from within the file menu opens the edit menu.
		keydown('[data-testid="item-new"]', 'ArrowRight');
		await settle();
		expect($('[data-testid="content-file"]')).toBe(null);
		expect($('[data-testid="content-edit"]')).not.toBe(null);

		// ArrowRight again loops past the DISABLED view trigger back to file.
		keydown('[data-testid="item-undo"]', 'ArrowRight');
		await settle();
		expect($('[data-testid="content-edit"]')).toBe(null);
		expect($('[data-testid="content-view"]')).toBe(null);
		expect($('[data-testid="content-file"]')).not.toBe(null);

		// ArrowLeft moves back to the previous (edit) menu.
		keydown('[data-testid="item-new"]', 'ArrowLeft');
		await settle();
		expect($('[data-testid="content-file"]')).toBe(null);
		expect($('[data-testid="content-edit"]')).not.toBe(null);
		r.unmount();
	});

	it('Enter toggles the menu from the trigger, with keyboard entry focus on the first item', async () => {
		const r = mount(MenubarApp);
		await settle();
		keydown('[data-testid="trigger-file"]', 'Enter');
		await settle();
		const content = $('[data-testid="content-file"]')!;
		expect(content).not.toBe(null);
		// Keyboard open → entry focus lands on the first item.
		expect(document.activeElement).toBe($('[data-testid="item-new"]'));

		// Enter on the trigger again toggles it closed and focus returns to the trigger.
		keydown('[data-testid="trigger-file"]', 'Enter');
		await settle();
		expect($('[data-testid="content-file"]')).toBe(null);
		expect(document.activeElement).toBe($('[data-testid="trigger-file"]'));
		r.unmount();
	});

	it('Escape closes the open menu and returns focus to its trigger', async () => {
		const r = mount(MenubarApp);
		await settle();
		pressTrigger('[data-testid="trigger-edit"]');
		await settle();
		expect($('[data-testid="content-edit"]')).not.toBe(null);

		flushSync(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect($('[data-testid="content-edit"]')).toBe(null);
		expect($('[data-testid="trigger-edit"]')!.getAttribute('data-state')).toBe('closed');
		expect(document.activeElement).toBe($('[data-testid="trigger-edit"]'));
		r.unmount();
	});
});

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from '../../octane/src/index.js';
import { flushEffects, mount } from '../../octane/tests/_helpers';
import { navigationMenuTriggerStyle } from '../src/ui/navigation-menu.tsrx';
import {
	ContextMenuFixture,
	DropdownMenuFixture,
	DropdownMenuSubFixture,
	MenubarFixture,
	NavigationMenuFixture,
	NavigationMenuInlineFixture,
} from './_fixtures/menus-app.tsrx';

// Menu content portals to document.body, so queries are document-wide (the
// radix suite's pattern).
const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

// Menu triggers open on pointerdown (left button).
function press(sel: string): void {
	const el = $(sel)!;
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
	});
}

// Menu items select on click.
function click(sel: string): void {
	const el = $(sel)!;
	flushSync(() => {
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	});
}

function keydown(sel: string, key: string): void {
	const el = $(sel)!;
	flushSync(() => {
		el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	});
}

function escape(): void {
	flushSync(() => {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
}

describe('@octanejs/shadcn — DropdownMenu', () => {
	afterEach(async () => {
		await settle();
	});

	it('opens on trigger press with the content/item/label/separator/shortcut contract', async () => {
		const r = mount(DropdownMenuFixture);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('dropdown-menu-trigger');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content"]')).toBe(null);

		press('[data-testid="trigger"]');
		await settle();

		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('menu');
		expect(content.getAttribute('data-slot')).toBe('dropdown-menu-content');
		expect(content.className).toContain('z-50');
		expect(content.className).toContain('z-50');
		expect(content.className).toContain('extra-content');
		// Portal'd out of the app container into the popper wrapper on body.
		expect(r.container.contains(content)).toBe(false);
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);

		const label = $('[data-testid="label"]')!;
		expect(label.getAttribute('data-slot')).toBe('dropdown-menu-label');
		expect(label.getAttribute('data-inset')).toBe('true');
		expect(label.className).toContain('text-muted-foreground');

		expect($('[data-testid="group"]')!.getAttribute('data-slot')).toBe('dropdown-menu-group');

		const copy = $('[data-testid="item-copy"]')!;
		expect(copy.getAttribute('role')).toBe('menuitem');
		expect(copy.getAttribute('data-slot')).toBe('dropdown-menu-item');
		expect(copy.getAttribute('data-variant')).toBe('default');
		expect(copy.className).toContain('rounded-md');
		const shortcut = $('[data-testid="shortcut"]')!;
		expect(copy.contains(shortcut)).toBe(true);
		expect(shortcut.getAttribute('data-slot')).toBe('dropdown-menu-shortcut');
		expect(shortcut.className).toContain('text-xs');

		const del = $('[data-testid="item-delete"]')!;
		expect(del.getAttribute('data-variant')).toBe('destructive');
		expect(del.getAttribute('aria-disabled')).toBe('true');

		const separator = $('[data-testid="separator"]')!;
		expect(separator.getAttribute('data-slot')).toBe('dropdown-menu-separator');
		expect(separator.className).toContain('bg-border');
		r.unmount();
	});

	it('checkbox and radio items carry roles, indicators, and update through selection', async () => {
		const r = mount(DropdownMenuFixture);
		await settle();
		press('[data-testid="trigger"]');
		await settle();

		const check = $('[data-testid="item-check"]')!;
		expect(check.getAttribute('role')).toBe('menuitemcheckbox');
		expect(check.getAttribute('data-slot')).toBe('dropdown-menu-checkbox-item');
		expect(check.getAttribute('aria-checked')).toBe('false');
		expect(check.textContent).toContain('Notifications');
		// The indicator wrapper span always renders; the check icon only when checked.
		const checkIndicator = check.querySelector(
			'[data-slot="dropdown-menu-checkbox-item-indicator"]',
		)!;
		expect(checkIndicator).not.toBe(null);
		expect(checkIndicator.className).toContain('pointer-events-none');
		expect(checkIndicator.querySelector('svg')).toBe(null);

		expect($('[data-testid="radio-group"]')!.getAttribute('data-slot')).toBe(
			'dropdown-menu-radio-group',
		);
		const vanilla = $('[data-testid="radio-vanilla"]')!;
		expect(vanilla.getAttribute('role')).toBe('menuitemradio');
		expect(vanilla.getAttribute('data-slot')).toBe('dropdown-menu-radio-item');
		expect(vanilla.getAttribute('aria-checked')).toBe('true');
		// Selected radio renders the check icon inside its indicator span.
		expect(vanilla.querySelector('[data-slot="dropdown-menu-radio-item-indicator"] svg')).not.toBe(
			null,
		);
		const chocolate = $('[data-testid="radio-chocolate"]')!;
		expect(chocolate.getAttribute('aria-checked')).toBe('false');
		expect(chocolate.querySelector('svg')).toBe(null);

		// Toggling the checkbox routes through onCheckedChange and closes the menu.
		click('[data-testid="item-check"]');
		await settle();
		expect($('[data-testid="checked"]')!.textContent).toBe('true');
		expect($('[data-testid="content"]')).toBe(null);

		press('[data-testid="trigger"]');
		await settle();
		const reopened = $('[data-testid="item-check"]')!;
		expect(reopened.getAttribute('data-state')).toBe('checked');
		expect(
			reopened.querySelector('[data-slot="dropdown-menu-checkbox-item-indicator"] svg'),
		).not.toBe(null);

		click('[data-testid="radio-chocolate"]');
		await settle();
		expect($('[data-testid="flavor"]')!.textContent).toBe('chocolate');
		r.unmount();
	});

	it('item select fires onSelect and closes; disabled item does neither; Escape closes', async () => {
		const r = mount(DropdownMenuFixture);
		await settle();
		press('[data-testid="trigger"]');
		await settle();

		click('[data-testid="item-copy"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('copy');
		expect($('[data-testid="content"]')).toBe(null);

		press('[data-testid="trigger"]');
		await settle();
		click('[data-testid="item-delete"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('copy');
		expect($('[data-testid="content"]')).not.toBe(null);

		escape();
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		expect(document.activeElement).toBe($('[data-testid="trigger"]'));
		r.unmount();
	});

	it('submenu: sub-trigger chevron contract, ArrowRight opens, selection closes the tree', async () => {
		const r = mount(DropdownMenuSubFixture);
		await settle();
		press('[data-testid="trigger"]');
		await settle();

		const subTrigger = $('[data-testid="sub-trigger"]')!;
		expect(subTrigger.getAttribute('data-slot')).toBe('dropdown-menu-sub-trigger');
		expect(subTrigger.getAttribute('data-inset')).toBe('true');
		expect(subTrigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(subTrigger.className).toContain('flex');
		// Trailing chevron icon appended after the consumer children.
		const chevron = subTrigger.querySelector('svg')!;
		expect(chevron).not.toBe(null);
		expect(chevron.getAttribute('class')).toContain('cn-rtl-flip');
		expect(chevron.getAttribute('class')).toContain('ml-auto');
		expect(subTrigger.textContent).toContain('Share');
		expect($('[data-testid="sub-content"]')).toBe(null);

		keydown('[data-testid="sub-trigger"]', 'ArrowRight');
		await settle();
		const subContent = $('[data-testid="sub-content"]')!;
		expect(subContent).not.toBe(null);
		expect(subContent.getAttribute('role')).toBe('menu');
		expect(subContent.getAttribute('data-slot')).toBe('dropdown-menu-sub-content');
		expect(subContent.className).toContain('rounded-lg');

		click('[data-testid="item-email"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('email');
		expect($('[data-testid="sub-content"]')).toBe(null);
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — ContextMenu', () => {
	afterEach(async () => {
		await settle();
	});

	function openContextMenu(): MouseEvent {
		let event!: MouseEvent;
		flushSync(() => {
			event = new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: 120,
				clientY: 80,
			});
			$('[data-testid="trigger"]')!.dispatchEvent(event);
		});
		return event;
	}

	it('opens on contextmenu with the trigger/content/item contract; item select closes', async () => {
		const r = mount(ContextMenuFixture);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-slot')).toBe('context-menu-trigger');
		expect(trigger.className).toContain('select-none');
		expect(trigger.className).toContain('select-none');
		expect($('[data-testid="content"]')).toBe(null);

		const event = openContextMenu();
		await settle();
		expect(event.defaultPrevented).toBe(true); // native menu suppressed

		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('menu');
		expect(content.getAttribute('data-slot')).toBe('context-menu-content');
		expect(content.className).toContain('z-50');
		expect(content.className).toContain('z-50');
		expect(r.container.contains(content)).toBe(false);

		const label = $('[data-testid="label"]')!;
		expect(label.getAttribute('data-slot')).toBe('context-menu-label');
		expect(label.getAttribute('data-inset')).toBe('true');
		expect($('[data-testid="group"]')!.getAttribute('data-slot')).toBe('context-menu-group');

		const reload = $('[data-testid="item-reload"]')!;
		expect(reload.getAttribute('role')).toBe('menuitem');
		expect(reload.getAttribute('data-slot')).toBe('context-menu-item');
		expect(reload.getAttribute('data-variant')).toBe('default');
		expect(reload.className).toContain('rounded-md');
		const shortcut = $('[data-testid="shortcut"]')!;
		expect(shortcut.getAttribute('data-slot')).toBe('context-menu-shortcut');
		expect(shortcut.className).toContain('text-xs');
		expect($('[data-testid="separator"]')!.getAttribute('data-slot')).toBe(
			'context-menu-separator',
		);

		click('[data-testid="item-reload"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('reload');
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('checkbox/radio/sub-trigger parts carry the shadcn contract; Escape dismisses', async () => {
		const r = mount(ContextMenuFixture);
		await settle();
		openContextMenu();
		await settle();

		const check = $('[data-testid="item-check"]')!;
		expect(check.getAttribute('role')).toBe('menuitemcheckbox');
		expect(check.getAttribute('data-slot')).toBe('context-menu-checkbox-item');
		expect(check.getAttribute('aria-checked')).toBe('true');
		// Initially checked: the indicator span renders the check icon.
		const indicator = check.querySelector('span.pointer-events-none')!;
		expect(indicator).not.toBe(null);
		expect(indicator.querySelector('svg')).not.toBe(null);

		const pedro = $('[data-testid="radio-pedro"]')!;
		expect(pedro.getAttribute('role')).toBe('menuitemradio');
		expect(pedro.getAttribute('data-slot')).toBe('context-menu-radio-item');
		expect(pedro.getAttribute('aria-checked')).toBe('true');
		expect(pedro.querySelector('span.pointer-events-none svg')).not.toBe(null);

		const subTrigger = $('[data-testid="sub-trigger"]')!;
		expect(subTrigger.getAttribute('data-slot')).toBe('context-menu-sub-trigger');
		expect(subTrigger.className).toContain('flex');
		const chevron = subTrigger.querySelector('svg')!;
		expect(chevron.getAttribute('class')).toContain('cn-rtl-flip');

		keydown('[data-testid="sub-trigger"]', 'ArrowRight');
		await settle();
		const subContent = $('[data-testid="sub-content"]')!;
		expect(subContent).not.toBe(null);
		expect(subContent.getAttribute('data-slot')).toBe('context-menu-sub-content');
		expect(subContent.className).toContain('rounded-lg');

		// Unchecking routes through onCheckedChange.
		click('[data-testid="item-check"]');
		await settle();
		expect($('[data-testid="checked"]')!.textContent).toBe('false');

		openContextMenu();
		await settle();
		expect($('[data-testid="item-check"]')!.getAttribute('aria-checked')).toBe('false');
		escape();
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/shadcn — Menubar', () => {
	afterEach(async () => {
		await settle();
	});

	it('renders role=menubar with menuitem triggers; opens on press with the content contract', async () => {
		const r = mount(MenubarFixture);
		await settle();
		const menubar = $('[data-testid="menubar"]')!;
		expect(menubar.getAttribute('role')).toBe('menubar');
		expect(menubar.getAttribute('data-slot')).toBe('menubar');
		expect(menubar.className).toContain('rounded-lg');
		expect(menubar.className).toContain('extra-bar');

		const fileTrigger = $('[data-testid="trigger-file"]')!;
		expect(fileTrigger.getAttribute('role')).toBe('menuitem');
		expect(fileTrigger.getAttribute('data-slot')).toBe('menubar-trigger');
		expect(fileTrigger.className).toContain('rounded-sm');
		expect(fileTrigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content-file"]')).toBe(null);

		press('[data-testid="trigger-file"]');
		await settle();
		const content = $('[data-testid="content-file"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('menu');
		expect(content.getAttribute('data-slot')).toBe('menubar-content');
		expect(content.className).toContain('z-50');
		expect(content.getAttribute('aria-labelledby')).toBe(fileTrigger.id);
		expect(r.container.contains(content)).toBe(false); // portal'd to body

		const item = $('[data-testid="item-new"]')!;
		expect(item.getAttribute('data-slot')).toBe('menubar-item');
		expect(item.getAttribute('data-variant')).toBe('default');
		expect(item.className).toContain('rounded-md');
		const shortcut = $('[data-testid="shortcut"]')!;
		expect(shortcut.getAttribute('data-slot')).toBe('menubar-shortcut');
		expect(shortcut.className).toContain('text-xs');
		expect(shortcut.className).toContain('ml-auto');
		const separator = $('[data-testid="separator"]')!;
		expect(separator.getAttribute('data-slot')).toBe('menubar-separator');
		expect(separator.className).toContain('bg-border');

		const subTrigger = $('[data-testid="sub-trigger"]')!;
		expect(subTrigger.getAttribute('data-slot')).toBe('menubar-sub-trigger');
		expect(subTrigger.className).toContain('flex');
		const chevron = subTrigger.querySelector('svg')!;
		expect(chevron.getAttribute('class')).toContain('cn-rtl-flip');
		expect(chevron.getAttribute('class')).toContain('size-4');

		// Selecting an item fires onSelect and closes the menu.
		click('[data-testid="item-new"]');
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('new');
		expect($('[data-testid="content-file"]')).toBe(null);
		expect(fileTrigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('submenu opens from its trigger; pointerenter switches menus; checkbox/radio contract', async () => {
		const r = mount(MenubarFixture);
		await settle();
		press('[data-testid="trigger-file"]');
		await settle();
		expect($('[data-testid="content-file"]')).not.toBe(null);

		keydown('[data-testid="sub-trigger"]', 'ArrowRight');
		await settle();
		const subContent = $('[data-testid="sub-content"]')!;
		expect(subContent).not.toBe(null);
		expect(subContent.getAttribute('data-slot')).toBe('menubar-sub-content');
		expect(subContent.className).toContain('rounded-lg');

		// Hovering another top-level trigger switches the open menu.
		flushSync(() => {
			$('[data-testid="trigger-view"]')!.dispatchEvent(
				new PointerEvent('pointerenter', { bubbles: false }),
			);
		});
		await settle();
		expect($('[data-testid="content-file"]')).toBe(null);
		const viewContent = $('[data-testid="content-view"]')!;
		expect(viewContent).not.toBe(null);

		const label = $('[data-testid="label"]')!;
		expect(label.getAttribute('data-slot')).toBe('menubar-label');
		expect(label.getAttribute('data-inset')).toBe('true');

		const wrap = $('[data-testid="item-wrap"]')!;
		expect(wrap.getAttribute('role')).toBe('menuitemcheckbox');
		expect(wrap.getAttribute('data-slot')).toBe('menubar-checkbox-item');
		expect(wrap.getAttribute('aria-checked')).toBe('false');
		const wrapIndicator = wrap.querySelector('span.pointer-events-none')!;
		expect(wrapIndicator).not.toBe(null);
		expect(wrapIndicator.querySelector('svg')).toBe(null);

		const radio = $('[data-testid="radio-benoit"]')!;
		expect(radio.getAttribute('role')).toBe('menuitemradio');
		expect(radio.getAttribute('data-slot')).toBe('menubar-radio-item');
		expect(radio.getAttribute('aria-checked')).toBe('true');
		expect(radio.querySelector('span.pointer-events-none svg')).not.toBe(null);

		click('[data-testid="item-wrap"]');
		await settle();
		expect($('[data-testid="word-wrap"]')!.textContent).toBe('true');
		r.unmount();
	});
});

describe('@octanejs/shadcn — NavigationMenu', () => {
	afterEach(async () => {
		await settle();
	});

	it('exports navigationMenuTriggerStyle (the upstream cva)', () => {
		expect(navigationMenuTriggerStyle()).toContain('inline-flex');
		expect(navigationMenuTriggerStyle()).toContain('w-max');
	});

	it('renders nav/list/item/trigger with the shadcn contract and the trigger chevron', async () => {
		const r = mount(NavigationMenuFixture);
		const q = (sel: string): HTMLElement | null => r.container.querySelector(sel);
		await settle();

		const root = q('[data-testid="root"]')!;
		expect(root.tagName).toBe('NAV');
		expect(root.getAttribute('data-slot')).toBe('navigation-menu');
		expect(root.getAttribute('data-viewport')).toBe('true');
		expect(root.className).toContain('group/navigation-menu');
		expect(root.getAttribute('aria-label')).toBe('Main');

		const list = q('[data-testid="list"]')!;
		expect(list.tagName).toBe('UL');
		expect(list.getAttribute('data-slot')).toBe('navigation-menu-list');
		expect(list.className).toContain('list-none');

		const item = q('[data-testid="item-one"]')!;
		expect(item.getAttribute('data-slot')).toBe('navigation-menu-item');
		expect(item.className).toContain('relative');

		const trigger = q('[data-testid="trigger-one"]')!;
		expect(trigger.tagName).toBe('BUTTON');
		expect(trigger.getAttribute('data-slot')).toBe('navigation-menu-trigger');
		expect(trigger.className).toContain('h-9');
		expect(trigger.className).toContain('group');
		expect(trigger.getAttribute('data-state')).toBe('closed');
		const chevron = trigger.querySelector('svg')!;
		expect(chevron).not.toBe(null);
		expect(chevron.getAttribute('class')).toContain('transition');
		expect(chevron.getAttribute('aria-hidden')).toBe('true');

		// The viewport wrapper renders inside the root; the viewport itself is
		// Presence-gated while closed.
		expect(root.querySelector('div.absolute.top-full')).not.toBe(null);
		expect(q('[data-slot="navigation-menu-viewport"]')).toBe(null);
		expect(q('[data-testid="content-one"]')).toBe(null);
		r.unmount();
	});

	it('click opens content into the viewport; link select records and dismisses', async () => {
		const r = mount(NavigationMenuFixture);
		const q = (sel: string): HTMLElement | null => r.container.querySelector(sel);
		await settle();

		flushSync(() => {
			q('[data-testid="trigger-one"]')!.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true }),
			);
		});
		await settle();

		const trigger = q('[data-testid="trigger-one"]')!;
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');

		const content = q('[data-testid="content-one"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('data-slot')).toBe('navigation-menu-content');
		expect(content.className).toContain('top-0');

		const viewport = q('[data-slot="navigation-menu-viewport"]')!;
		expect(viewport).not.toBe(null);
		expect(viewport.className).toContain('rounded-lg');
		expect(viewport.contains(content)).toBe(true);

		const link = q('[data-testid="link-one"]')!;
		expect(link.tagName).toBe('A');
		expect(link.getAttribute('data-slot')).toBe('navigation-menu-link');
		expect(link.className).toContain('rounded-lg');

		// Indicator: Presence-mounts while open, portal'd into the indicator track,
		// with the upstream arrow div.
		const indicator = q('[data-testid="indicator"]')!;
		expect(indicator).not.toBe(null);
		expect(indicator.getAttribute('data-slot')).toBe('navigation-menu-indicator');
		expect(indicator.className).toContain('flex');
		expect(indicator.querySelector('div.rotate-45')).not.toBe(null);

		flushSync(() => {
			link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		});
		await settle();
		expect(q('[data-testid="selected"]')!.textContent).toBe('one');
		expect(q('[data-testid="content-one"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('viewport={false} renders no viewport and shows content in place', async () => {
		const r = mount(NavigationMenuInlineFixture);
		const q = (sel: string): HTMLElement | null => r.container.querySelector(sel);
		await settle();

		const root = q('[data-testid="root"]')!;
		expect(root.getAttribute('data-viewport')).toBe('false');
		expect(root.querySelector('div.absolute.top-full')).toBe(null);

		flushSync(() => {
			q('[data-testid="trigger-one"]')!.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true }),
			);
		});
		await settle();
		const content = q('[data-testid="content-one"]')!;
		expect(content).not.toBe(null);
		expect(q('[data-slot="navigation-menu-viewport"]')).toBe(null);
		expect(root.contains(content)).toBe(true);
		r.unmount();
	});
});

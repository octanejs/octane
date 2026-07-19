import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	BasicMenuHarness,
	DynamicMenuHarness,
	EmptyMenuHarness,
	SectionMenuHarness,
	SelectionMenuHarness,
	SubmenuHarness,
} from './_fixtures/rac-menu.tsx';

// @octanejs/aria Phase 5 — RAC Menu components (MenuTrigger / Menu / MenuItem /
// MenuSection / SubmenuTrigger) over the Phase-4 collection engine and overlay
// composition, driven through octane's NATIVE delegated events. The open Popover
// portals to document.body, so open-state assertions query the document rather
// than the mount container. Structural collection updates land one microtask
// after commit (the Document's MutationObserver) — flush with `await act(() => {})`
// before asserting. Positioning math is inert in jsdom (zero rects), so these
// assert roles, ARIA wiring, data attributes, focus, and open/close transitions.

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// jsdom lacks Element#getAnimations; the enter/exit animation hooks treat an empty
// animation list as "no animation" and complete immediately.
beforeAll(() => {
	(Element.prototype as any).getAnimations = () => [];
});
afterAll(() => {
	delete (Element.prototype as any).getAnimations;
});

// Strict per-test unmounts: a leaked open overlay (and its ariaHideOutside
// observers) cascades failures into later tests, so every mount goes through
// this tracker and is torn down even when an assertion fails mid-test.
const mounted: Array<{ unmount: () => void }> = [];
function mountTracked(Component: any, props: any): ReturnType<typeof mount> {
	const r = mount(Component, props);
	const unmount = r.unmount.bind(r);
	let done = false;
	r.unmount = () => {
		if (!done) {
			done = true;
			unmount();
		}
	};
	mounted.push(r);
	return r;
}
afterEach(() => {
	while (mounted.length) {
		mounted.pop()!.unmount();
	}
});

function pointerEvent(type: string, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, {
		bubbles: true,
		cancelable: true,
		button: 0,
		pointerId: 1,
		pointerType: 'mouse',
		detail: 1,
		...init,
	});
}

async function press(el: Element): Promise<void> {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	});
}

async function keydown(el: Element, key: string, init: KeyboardEventInit = {}): Promise<void> {
	await act(() => {
		el.dispatchEvent(
			new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
		);
	});
	await act(() => {
		el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true, ...init }));
	});
}

function q(selector: string): HTMLElement | null {
	return document.querySelector(selector) as HTMLElement | null;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function openMenu(): Promise<HTMLElement> {
	await press(q('[data-testid="trigger"]')!);
	await act(() => {});
	const menu = q('[role="menu"]')!;
	expect(menu).toBeTruthy();
	return menu;
}

describe('@octanejs/aria/components — MenuTrigger + Menu + MenuItem', () => {
	it('opens on trigger press with ARIA wiring, portals to document.body, and autofocuses the menu', async () => {
		const openChanges: boolean[] = [];
		const r = mountTracked(BasicMenuHarness, { onOpenChange: (o: boolean) => openChanges.push(o) });
		await act(() => {});

		const trigger = q('[data-testid="trigger"]')!;
		// useOverlayTrigger emits aria-haspopup="true" for the menu type.
		expect(trigger.getAttribute('aria-haspopup')).toBe('true');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(q('[role="menu"]')).toBeNull();

		const menu = await openMenu();
		expect(openChanges).toEqual([true]);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('aria-controls')).toBe(menu.id);

		// The popover renders through a portal on document.body, outside the mount tree.
		expect(r.container.contains(menu)).toBe(false);
		expect(document.body.contains(menu)).toBe(true);
		expect(menu.className).toBe('react-aria-Menu');
		expect(menu.getAttribute('aria-labelledby')).toBe(trigger.id);

		const items = [...menu.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
		expect(items.map((i) => i.textContent!.trim())).toEqual(['Open', 'Rename', 'Delete']);
		expect(items.every((i) => i.className === 'react-aria-MenuItem')).toBe(true);
		expect(menu.querySelector('[role="separator"]')).toBeTruthy();

		// Opening with the mouse autofocuses the menu itself (no focused item yet).
		await nextFrame();
		expect(document.activeElement).toBe(menu);
		r.unmount();
	});

	it('moves focus between items with ArrowDown/ArrowUp', async () => {
		const r = mountTracked(BasicMenuHarness, {});
		await act(() => {});
		const menu = await openMenu();
		await nextFrame();

		await keydown(document.activeElement!, 'ArrowDown');
		expect(document.activeElement).toBe(q('[data-testid="item-open"]'));
		expect(q('[data-testid="item-open"]')!.getAttribute('data-focused')).toBe('true');

		await keydown(document.activeElement!, 'ArrowDown');
		expect(document.activeElement).toBe(q('[data-testid="item-rename"]'));

		await keydown(document.activeElement!, 'ArrowUp');
		expect(document.activeElement).toBe(q('[data-testid="item-open"]'));
		expect(menu.contains(document.activeElement!)).toBe(true);
		r.unmount();
	});

	it('fires onAction on item press, closes the menu, and restores focus to the trigger', async () => {
		const onAction = vi.fn();
		const r = mountTracked(BasicMenuHarness, { onAction });
		await act(() => {});
		const trigger = q('[data-testid="trigger"]')!;
		await openMenu();

		await press(q('[data-testid="item-rename"]')!);
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(onAction.mock.calls[0][0]).toBe('rename');
		expect(q('[role="menu"]')).toBeNull();

		// Focus restore runs a RAF after the overlay focus scope unmounts, plus one
		// more frame for focusSafely's deferral.
		await nextFrame();
		await nextFrame();
		expect(document.activeElement).toBe(trigger);
		r.unmount();
	});

	it('closes on Escape and restores focus to the trigger', async () => {
		const r = mountTracked(BasicMenuHarness, {});
		await act(() => {});
		const trigger = q('[data-testid="trigger"]')!;
		await openMenu();
		await nextFrame();

		await act(() => {
			document.activeElement!.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
			);
		});
		expect(q('[role="menu"]')).toBeNull();

		await nextFrame();
		await nextFrame();
		expect(document.activeElement).toBe(trigger);
		r.unmount();
	});
});

describe('@octanejs/aria/components — Menu selection', () => {
	it('selectionMode="single" renders menuitemradio with aria-checked/data-selected and closes on select', async () => {
		const onSelectionChange = vi.fn();
		const r = mountTracked(SelectionMenuHarness, { selectionMode: 'single', onSelectionChange });
		await act(() => {});
		const menu = await openMenu();

		const radios = [...menu.querySelectorAll('[role="menuitemradio"]')] as HTMLElement[];
		expect(radios).toHaveLength(3);
		expect(menu.querySelector('[role="menuitem"]')).toBeNull();

		const left = q('[data-testid="item-left"]')!;
		expect(left.getAttribute('aria-checked')).toBe('true');
		expect(left.getAttribute('data-selected')).toBe('true');
		expect(left.getAttribute('data-selection-mode')).toBe('single');
		expect(q('[data-testid="item-center"]')!.getAttribute('aria-checked')).toBe('false');

		await press(q('[data-testid="item-center"]')!);
		expect(onSelectionChange).toHaveBeenCalledTimes(1);
		expect([...onSelectionChange.mock.calls[0][0]]).toEqual(['center']);
		// Single selection closes the menu on select (mouse).
		expect(q('[role="menu"]')).toBeNull();
		r.unmount();
	});

	it('selectionMode="multiple" renders menuitemcheckbox, toggles without closing', async () => {
		const r = mountTracked(SelectionMenuHarness, { selectionMode: 'multiple' });
		await act(() => {});
		const menu = await openMenu();

		const boxes = [...menu.querySelectorAll('[role="menuitemcheckbox"]')] as HTMLElement[];
		expect(boxes).toHaveLength(3);
		expect(q('[data-testid="item-left"]')!.getAttribute('aria-checked')).toBe('true');

		await press(q('[data-testid="item-center"]')!);
		expect(q('[role="menu"]')).toBeTruthy();
		expect(q('[data-testid="item-center"]')!.getAttribute('aria-checked')).toBe('true');
		expect(q('[data-testid="item-center"]')!.getAttribute('data-selected')).toBe('true');
		expect(q('[data-testid="item-left"]')!.getAttribute('aria-checked')).toBe('true');

		await press(q('[data-testid="item-center"]')!);
		expect(q('[role="menu"]')).toBeTruthy();
		expect(q('[data-testid="item-center"]')!.getAttribute('aria-checked')).toBe('false');
		expect(q('[data-testid="item-center"]')!.hasAttribute('data-selected')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria/components — MenuSection', () => {
	it('renders sections as role=group labeled by their Header or aria-label, with text/keyboard slots', async () => {
		const r = mountTracked(SectionMenuHarness, {});
		await act(() => {});
		const menu = await openMenu();

		const groups = [...menu.querySelectorAll('[role="group"]')] as HTMLElement[];
		expect(groups).toHaveLength(2);
		expect(groups[0].className).toBe('react-aria-MenuSection');

		const header = q('[data-testid="styles-header"]')!;
		expect(header.textContent).toBe('Styles');
		expect(groups[0].getAttribute('aria-labelledby')).toBe(header.id);
		expect(groups[1].getAttribute('aria-label')).toBe('Clipboard');

		// Items render inside their section groups.
		expect(groups[0].querySelectorAll('[role="menuitem"]')).toHaveLength(2);
		expect(groups[1].querySelectorAll('[role="menuitem"]')).toHaveLength(2);

		// Text slot label + Keyboard shortcut wire aria-labelledby/aria-describedby.
		const bold = q('[data-testid="item-bold"]')!;
		const label = bold.querySelector('[slot="label"]')!;
		expect(label.textContent).toBe('Bold');
		expect(bold.getAttribute('aria-labelledby')).toBe(label.id);
		const kbd = bold.querySelector('kbd')!;
		expect(kbd.textContent).toBe('Meta+B');
		expect(bold.getAttribute('aria-describedby')).toContain(kbd.id);
		r.unmount();
	});
});

describe('@octanejs/aria/components — dynamic items and empty state', () => {
	it('renders dynamic items from the render function and reflects item updates', async () => {
		const onAction = vi.fn();
		const r = mountTracked(DynamicMenuHarness, { onAction });
		await act(() => {});

		// Mutate the items while the menu is closed, then open: the collection
		// rebuilds from the new data.
		await act(() => {
			(r.container.querySelector('[data-action="add"]') as HTMLElement).click();
		});
		const menu = await openMenu();
		const items = [...menu.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
		expect(items.map((i) => i.textContent)).toEqual(['Cut', 'Copy', 'Paste']);

		await press(items[2]);
		// Menu onAction receives the key and, for dynamic collections, the item value.
		expect(onAction).toHaveBeenCalledWith('paste', { id: 'paste', name: 'Paste' });
		r.unmount();
	});

	it('shows renderEmptyState content with data-empty when there are no items', async () => {
		const r = mountTracked(EmptyMenuHarness, {});
		await act(() => {});
		const menu = await openMenu();

		expect(menu.getAttribute('data-empty')).toBe('true');
		expect(menu.querySelector('[data-testid="empty"]')!.textContent).toBe('No actions');
		r.unmount();
	});
});

describe('@octanejs/aria/components — SubmenuTrigger', () => {
	it('opens the submenu from the trigger item with ArrowRight and closes it with ArrowLeft', async () => {
		const onAction = vi.fn();
		const r = mountTracked(SubmenuHarness, { onAction });
		await act(() => {});
		await openMenu();
		await nextFrame();

		// The submenu trigger item advertises its popup and starts collapsed.
		const share = q('[data-testid="item-share"]')!;
		expect(share.getAttribute('aria-haspopup')).toBe('menu');
		expect(share.getAttribute('aria-expanded')).toBe('false');
		expect(share.getAttribute('data-has-submenu')).toBe('true');
		expect(q('[data-testid="submenu"]')).toBeNull();

		// ArrowDown twice focuses the submenu trigger item; ArrowRight opens it.
		await keydown(document.activeElement!, 'ArrowDown');
		await keydown(document.activeElement!, 'ArrowDown');
		expect(document.activeElement).toBe(share);

		await keydown(share, 'ArrowRight');
		await act(() => {});
		const submenu = q('[data-testid="submenu"]')!;
		expect(submenu).toBeTruthy();
		expect(share.getAttribute('aria-expanded')).toBe('true');
		expect(share.getAttribute('data-open')).toBe('true');
		const submenuItems = [...submenu.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
		expect(submenuItems.map((i) => i.textContent!.trim())).toEqual(['Email', 'SMS']);

		// The submenu autofocuses its first item; the root menu stays open behind it.
		await nextFrame();
		expect(document.activeElement).toBe(q('[data-testid="item-email"]'));
		expect(q('[data-testid="menu"]')).toBeTruthy();

		// ArrowLeft closes the submenu and returns focus to the trigger item.
		await keydown(document.activeElement!, 'ArrowLeft');
		expect(q('[data-testid="submenu"]')).toBeNull();
		expect(share.getAttribute('aria-expanded')).toBe('false');
		await nextFrame();
		expect(document.activeElement).toBe(share);
		r.unmount();
	});

	it('fires onAction from a submenu item and closes the whole menu tree', async () => {
		const onAction = vi.fn();
		const r = mountTracked(SubmenuHarness, { onAction });
		await act(() => {});
		await openMenu();
		await nextFrame();

		await keydown(document.activeElement!, 'ArrowDown');
		await keydown(document.activeElement!, 'ArrowDown');
		await keydown(document.activeElement!, 'ArrowRight');
		await act(() => {});
		await nextFrame();

		await press(q('[data-testid="item-email"]')!);
		expect(onAction.mock.calls[0][0]).toBe('email');
		expect(q('[data-testid="submenu"]')).toBeNull();
		expect(q('[data-testid="menu"]')).toBeNull();
		r.unmount();
	});
});

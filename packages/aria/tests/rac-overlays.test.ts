import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ModalDialogScenario,
	PopoverScenario,
	TooltipScenario,
} from './_fixtures/rac-overlays.tsx';

// @octanejs/aria Phase 4 — RAC overlay components (DialogTrigger / Dialog / Modal /
// Popover / Tooltip / TooltipTrigger), driven through octane's NATIVE delegated
// events. Modal/Popover/Tooltip portal into document.body, so assertions query the
// document rather than the mount container. Positioning math is inert in jsdom
// (zero rects), so these assert roles, ARIA wiring, data attributes, and
// open/close transitions — not placement pixels.

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

async function press(el: HTMLElement): Promise<void> {
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerdown', { clientX: 5, clientY: 5 }));
	});
	await act(() => {
		el.dispatchEvent(pointerEvent('pointerup', { clientX: 5, clientY: 5 }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	});
}

// useInteractOutside registers pointerdown+click (capture) when PointerEvent exists.
function fireOutsideInteraction(el: Element): void {
	el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function q(selector: string): HTMLElement | null {
	return document.querySelector(selector) as HTMLElement | null;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

describe('@octanejs/aria/components — DialogTrigger + Modal + Dialog', () => {
	it('opens a labeled, focused modal dialog in a document.body portal and closes via the slot="close" button', async () => {
		const r = mount(ModalDialogScenario, {});
		const trigger = q('[data-testid="trigger"]')!;
		expect(q('[data-testid="dialog"]')).toBeNull();

		// Focus the trigger first (as a real interaction would) so focus restoration
		// on close has a previously-focused element to return to.
		await act(() => {
			trigger.focus();
		});
		await press(trigger);

		const dialog = q('[data-testid="dialog"]')!;
		expect(dialog).toBeTruthy();
		// The modal renders through a portal on document.body, outside the mount tree.
		expect(r.container.contains(dialog)).toBe(false);
		expect(document.body.contains(dialog)).toBe(true);
		expect(dialog.getAttribute('role')).toBe('dialog');
		expect(dialog.className).toBe('react-aria-Dialog');
		expect(q('[data-testid="modal"]')!.className).toBe('react-aria-Modal');

		// The dialog is labeled by its title slot heading (level 2), not the trigger fallback.
		const heading = dialog.querySelector('h2')!;
		expect(heading.textContent).toBe('Account settings');
		expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);

		// useDialog autofocus: focus lands on the dialog itself (no child was focused).
		expect(document.activeElement).toBe(dialog);

		// Content outside the modal is hidden from assistive technology while open
		// (ariaHideOutside marks the topmost ancestor outside the modal).
		expect(q('[data-testid="outside"]')!.closest('[aria-hidden="true"]')).toBeTruthy();

		// The slot="close" button is wired to state.close through ButtonContext.
		await press(q('[data-testid="close"]')!);
		expect(q('[data-testid="dialog"]')).toBeNull();
		expect(q('[data-testid="outside"]')!.closest('[aria-hidden="true"]')).toBeNull();

		// Focus is restored to the trigger by the overlay focus scope (the restore
		// runs in a RAF after the scope's unmount cleanup, plus one more frame for
		// focusSafely's deferral).
		await nextFrame();
		await nextFrame();
		expect(document.activeElement).toBe(trigger);
		r.unmount();
	});

	it('closes on Escape, and isKeyboardDismissDisabled blocks it', async () => {
		const r = mount(ModalDialogScenario, {});
		await press(q('[data-testid="trigger"]')!);
		const dialog = q('[data-testid="dialog"]')!;
		await act(() => {
			dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(q('[data-testid="dialog"]')).toBeNull();
		r.unmount();

		const r2 = mount(ModalDialogScenario, { isKeyboardDismissDisabled: true });
		await press(q('[data-testid="trigger"]')!);
		const dialog2 = q('[data-testid="dialog"]')!;
		await act(() => {
			dialog2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(q('[data-testid="dialog"]')).toBeTruthy();
		r2.unmount();
		// Unmounting the trigger tree tears the open portal down with it.
		expect(q('[data-testid="dialog"]')).toBeNull();
	});

	it('respects isDismissable for interactions outside the modal content', async () => {
		// Not dismissable (the default): pressing the underlay keeps the dialog open.
		const r = mount(ModalDialogScenario, {});
		await press(q('[data-testid="trigger"]')!);
		const underlay = q('.react-aria-ModalOverlay')!;
		expect(underlay).toBeTruthy();
		await act(() => {
			fireOutsideInteraction(underlay);
		});
		expect(q('[data-testid="dialog"]')).toBeTruthy();
		r.unmount();

		// Dismissable: the same interaction closes the dialog.
		const r2 = mount(ModalDialogScenario, { isDismissable: true });
		await press(q('[data-testid="trigger"]')!);
		await act(() => {
			fireOutsideInteraction(q('.react-aria-ModalOverlay')!);
		});
		expect(q('[data-testid="dialog"]')).toBeNull();
		r2.unmount();
	});
});

describe('@octanejs/aria/components — DialogTrigger + Popover', () => {
	it('wires the trigger, opens a positioned popover with data-placement, and shares placement with OverlayArrow', async () => {
		const r = mount(PopoverScenario);
		const trigger = q('[data-testid="popover-trigger"]')!;
		// Dialog-type triggers intentionally get no aria-haspopup (react-aria only
		// emits it for menu/listbox); the expanded/controls pair carries the wiring.
		expect(trigger.getAttribute('aria-haspopup')).toBeNull();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(q('[data-testid="popover"]')).toBeNull();

		await press(trigger);

		const popover = q('[data-testid="popover"]')!;
		expect(popover).toBeTruthy();
		expect(r.container.contains(popover)).toBe(false);
		expect(document.body.contains(popover)).toBe(true);
		expect(popover.className).toBe('react-aria-Popover');
		expect(popover.getAttribute('data-trigger')).toBe('DialogTrigger');
		// jsdom rects are zero, so the resolved placement is the default primary axis.
		expect(popover.getAttribute('data-placement')).toBe('bottom');

		const dialog = q('[data-testid="popover-dialog"]')!;
		expect(dialog.getAttribute('role')).toBe('dialog');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('aria-controls')).toBe(dialog.id);

		// OverlayArrow inherits the popover placement through context.
		const arrow = q('[data-testid="arrow"]')!;
		expect(popover.contains(arrow)).toBe(true);
		expect(arrow.getAttribute('data-placement')).toBe('bottom');
		expect(arrow.className).toBe('react-aria-OverlayArrow');

		// A modal popover renders an underlay and hides itself on Escape.
		expect(q('[data-testid="underlay"]')).toBeTruthy();
		await act(() => {
			dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(q('[data-testid="popover"]')).toBeNull();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-controls')).toBeNull();
		r.unmount();
	});
});

// The tooltip warmup timer lives in module-global state, so the fake-timer warmup
// test runs first in this file (before any focus-opening test warms it up).
describe('@octanejs/aria/components — TooltipTrigger + Tooltip (hover warmup)', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('opens after the warmup delay on hover and closes after unhover', async () => {
		vi.useFakeTimers();
		const r = mount(TooltipScenario, { delay: 200, closeDelay: 100 });
		const trigger = q('[data-testid="tip-trigger"]')!;

		// Hover only counts under pointer modality (upstream's obscured-trigger guard).
		await act(() => {
			document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			trigger.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		expect(q('[data-testid="tooltip"]')).toBeNull();

		await act(() => {
			vi.advanceTimersByTime(200);
		});
		const tooltip = q('[data-testid="tooltip"]')!;
		expect(tooltip).toBeTruthy();
		expect(tooltip.getAttribute('role')).toBe('tooltip');
		expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);

		await act(() => {
			trigger.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		});
		await act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(q('[data-testid="tooltip"]')).toBeNull();
		expect(trigger.getAttribute('aria-describedby')).toBeNull();

		// Drain the residual global cooldown timer so the warmed-up flag resets cleanly.
		await act(() => {
			vi.runOnlyPendingTimers();
		});
		r.unmount();
	});
});

describe('@octanejs/aria/components — TooltipTrigger + Tooltip (focus)', () => {
	it('opens immediately on keyboard focus, describes the trigger, and closes on blur', async () => {
		const r = mount(TooltipScenario, {});
		const trigger = q('[data-testid="tip-trigger"]')!;
		expect(q('[data-testid="tooltip"]')).toBeNull();

		await act(() => {
			// Tab establishes keyboard modality, making the focus visible → opens with no delay.
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
			trigger.focus();
		});

		const tooltip = q('[data-testid="tooltip"]')!;
		expect(tooltip).toBeTruthy();
		// The tooltip portals to document.body (OverlayContainer), outside the mount tree.
		expect(r.container.contains(tooltip)).toBe(false);
		expect(document.body.contains(tooltip)).toBe(true);
		expect(tooltip.getAttribute('role')).toBe('tooltip');
		expect(tooltip.className).toBe('react-aria-Tooltip');
		expect(tooltip.textContent).toBe('Saves your work');
		expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
		// Default placement resolves to the primary axis ('top') even with jsdom's zero rects.
		expect(tooltip.getAttribute('data-placement')).toBe('top');

		await act(() => {
			trigger.blur();
		});
		expect(q('[data-testid="tooltip"]')).toBeNull();
		expect(trigger.getAttribute('aria-describedby')).toBeNull();
		r.unmount();
	});

	it('closes on Escape while the trigger stays focused', async () => {
		const r = mount(TooltipScenario, {});
		const trigger = q('[data-testid="tip-trigger"]')!;

		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
			trigger.focus();
		});
		expect(q('[data-testid="tooltip"]')).toBeTruthy();

		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(q('[data-testid="tooltip"]')).toBeNull();
		r.unmount();
	});
});

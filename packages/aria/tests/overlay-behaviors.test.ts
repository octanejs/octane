import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	ModalOverlayHarness,
	PopoverHarness,
	OverlayContainerHarness,
	UseModalHarness,
} from './_fixtures/overlay-behaviors.tsx';

// jsdom lacks CSS.escape (used by the selection delegates' data-key selectors).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the Phase-3b overlay behavior hooks (useModalOverlay, usePopover,
// useModal/OverlayContainer). These assert durable, jsdom-observable contracts: dismiss wiring,
// the ariaHideOutside aria-hidden mutation + restore (including the isNonModal branch that does
// NOT hide outside content), the OverlayContainer portal, and the modal-count aria-hidden
// bookkeeping. Pixel positioning is inert in jsdom and is not asserted.

function fireOutsideInteraction(el: Element): void {
	// useInteractOutside registers pointerdown+click (capture) when PointerEvent exists,
	// otherwise a mousedown+mouseup test fallback. Drive whichever branch is live.
	if (typeof PointerEvent !== 'undefined') {
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	} else {
		el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
		el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
	}
}

describe('@octanejs/aria — useModalOverlay', () => {
	it('hides content outside the open modal and restores it on unmount', async () => {
		const r = mount(ModalOverlayHarness, { isOpen: true, onClose: () => {} });
		await act(() => {});
		const outside = r.container.querySelector('[data-testid="outside"]') as HTMLElement;
		const modal = r.container.querySelector('[data-testid="modal"]') as HTMLElement;
		// ariaHideOutside marks siblings outside the modal, but never the modal itself.
		expect(outside.getAttribute('aria-hidden')).toBe('true');
		expect(modal.getAttribute('aria-hidden')).toBe(null);
		r.unmount();
		await act(() => {});
		expect(outside.getAttribute('aria-hidden')).toBe(null);
	});

	it('calls onClose when Escape is pressed on the modal', async () => {
		let closed = 0;
		const r = mount(ModalOverlayHarness, { isOpen: true, onClose: () => closed++ });
		await act(() => {});
		const modal = r.container.querySelector('[data-testid="modal"]') as HTMLElement;
		await act(() => {
			modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toBe(1);
		r.unmount();
	});

	it('calls onClose when the underlay outside the modal is pressed', async () => {
		let closed = 0;
		const r = mount(ModalOverlayHarness, { isOpen: true, onClose: () => closed++ });
		await act(() => {});
		const underlay = r.container.querySelector('[data-testid="underlay"]') as HTMLElement;
		await act(() => {
			fireOutsideInteraction(underlay);
		});
		expect(closed).toBe(1);
		r.unmount();
	});
});

describe('@octanejs/aria — usePopover', () => {
	it('returns popover, arrow, and underlay prop bags plus a placement slot', async () => {
		let aria: any;
		const r = mount(PopoverHarness, {
			isOpen: true,
			onClose: () => {},
			capture: (a: any) => {
				aria = a;
			},
		});
		await act(() => {});
		expect(typeof aria.popoverProps).toBe('object');
		expect(typeof aria.arrowProps).toBe('object');
		expect(typeof aria.underlayProps).toBe('object');
		expect('placement' in aria).toBe(true);
		r.unmount();
	});

	it('hides outside content for a modal popover and dismisses on Escape', async () => {
		let closed = 0;
		const r = mount(PopoverHarness, { isOpen: true, onClose: () => closed++ });
		await act(() => {});
		const outside = r.container.querySelector('[data-testid="outside"]') as HTMLElement;
		const popover = r.container.querySelector('[data-testid="popover"]') as HTMLElement;
		expect(outside.getAttribute('aria-hidden')).toBe('true');
		await act(() => {
			popover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toBe(1);
		r.unmount();
	});

	it('does NOT hide outside content for a non-modal popover', async () => {
		const r = mount(PopoverHarness, { isOpen: true, onClose: () => {}, isNonModal: true });
		await act(() => {});
		const outside = r.container.querySelector('[data-testid="outside"]') as HTMLElement;
		expect(outside.getAttribute('aria-hidden')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/aria — OverlayContainer', () => {
	it('portals its children into the provided container inside an overlay-container root', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const r = mount(OverlayContainerHarness, { container });
		await act(() => {});
		const root = container.querySelector('[data-overlay-container]');
		expect(root).toBeTruthy();
		expect(root!.querySelector('[data-testid="overlay-child"]')).toBeTruthy();
		r.unmount();
		container.remove();
	});
});

describe('@octanejs/aria — useModal', () => {
	it('toggles aria-hidden on the outer provider as the nested modal activates and deactivates', async () => {
		const r = mount(UseModalHarness);
		await act(() => {});
		const app = r.container.querySelector('[data-overlay-container]') as HTMLElement;
		const toggle = r.container.querySelector('[data-testid="toggle"]') as HTMLButtonElement;
		// Modal starts disabled: no count registered, provider subtree visible to assistive tech.
		expect(app.getAttribute('aria-hidden')).toBe(null);

		await act(() => toggle.click());
		// Enabling the modal increments the parent provider's modal count → aria-hidden.
		expect(app.getAttribute('aria-hidden')).toBe('true');
		const modalContent = r.container.querySelector('[data-testid="modal-content"]') as HTMLElement;
		expect(modalContent.getAttribute('data-ismodal')).toBe('true');

		await act(() => toggle.click());
		// Disabling the modal decrements the count back to zero → restored.
		expect(app.getAttribute('aria-hidden')).toBe(null);
		r.unmount();
	});
});

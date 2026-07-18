import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	OverlayDismissHarness,
	PreventScrollHarness,
	OverlayPortalHarness,
	DismissButtonHarness,
} from './_fixtures/overlays-foundation.tsx';
import { ariaHideOutside } from '../src/overlays/ariaHideOutside';

// jsdom lacks CSS.escape (used by the selection delegates' data-key selectors).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the Phase-3a overlay foundation. These exercise the durable,
// jsdom-observable contracts: the dismiss wiring of useOverlay, usePreventScroll's
// document scroll-lock lifecycle, ariaHideOutside's aria-hidden mutation + restore, the
// Overlay portal, and the DismissButton markup. Pixel positioning (useOverlayPosition)
// depends on real layout rects jsdom cannot provide, so it is not asserted here.

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

describe('@octanejs/aria — useOverlay', () => {
	it('calls onClose when Escape is pressed on the overlay', async () => {
		let closed = 0;
		const r = mount(OverlayDismissHarness, { onClose: () => closed++ });
		await act(() => {});
		const overlay = r.container.querySelector('[data-testid="overlay"]') as HTMLElement;
		await act(() => {
			overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(closed).toBe(1);
		r.unmount();
	});

	it('calls onClose when a dismissable overlay is interacted with outside it', async () => {
		let closed = 0;
		const r = mount(OverlayDismissHarness, { onClose: () => closed++ });
		await act(() => {});
		const outside = r.container.querySelector('[data-testid="outside"]') as HTMLElement;
		await act(() => {
			fireOutsideInteraction(outside);
		});
		expect(closed).toBe(1);
		r.unmount();
	});
});

describe('@octanejs/aria — usePreventScroll', () => {
	it('locks document scrolling while mounted and restores it on unmount', async () => {
		const html = document.documentElement;
		const before = html.style.overflow;
		const r = mount(PreventScrollHarness, { isDisabled: false });
		await act(() => {});
		expect(html.style.overflow).toBe('hidden');
		r.unmount();
		await act(() => {});
		expect(html.style.overflow).toBe(before);
	});

	it('does nothing when disabled', async () => {
		const html = document.documentElement;
		const before = html.style.overflow;
		const r = mount(PreventScrollHarness, { isDisabled: true });
		await act(() => {});
		expect(html.style.overflow).toBe(before);
		r.unmount();
	});
});

describe('@octanejs/aria — ariaHideOutside', () => {
	it('hides sibling elements outside the targets and restores on cleanup', () => {
		const outside = document.createElement('div');
		outside.setAttribute('data-testid', 'aho-outside');
		const target = document.createElement('div');
		target.setAttribute('data-testid', 'aho-target');
		document.body.append(outside, target);

		const revert = ariaHideOutside([target]);
		expect(outside.getAttribute('aria-hidden')).toBe('true');
		// The target itself stays visible to assistive tech.
		expect(target.getAttribute('aria-hidden')).toBe(null);

		revert();
		expect(outside.getAttribute('aria-hidden')).toBe(null);

		outside.remove();
		target.remove();
	});
});

describe('@octanejs/aria — Overlay', () => {
	it('renders its children into the provided portal container', async () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const r = mount(OverlayPortalHarness, { container });
		await act(() => {});
		expect(container.querySelector('[data-testid="portaled"]')).toBeTruthy();
		r.unmount();
		container.remove();
	});
});

describe('@octanejs/aria — DismissButton', () => {
	it('renders a labelled, non-tabbable button that calls onDismiss on click', async () => {
		let dismissed = 0;
		const r = mount(DismissButtonHarness, { onDismiss: () => dismissed++ });
		await act(() => {});
		const button = r.container.querySelector('button') as HTMLButtonElement;
		expect(button).toBeTruthy();
		// Localized default label from the ported overlays intl dictionary.
		expect(button.getAttribute('aria-label')).toBe('Dismiss');
		expect(button.tabIndex).toBe(-1);
		await act(() => button.click());
		expect(dismissed).toBe(1);
		r.unmount();
	});
});

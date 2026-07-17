import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	AutoFocusScope,
	ContainScope,
	FocusRingButton,
	FocusRingProbe,
	ManagedScope,
	RestoreScope,
	TabbableChildProbe,
	WalkerScope,
} from './_fixtures/focus-scope.tsx';

// @octanejs/aria — the focus area (FocusScope containment/restore/autoFocus,
// useFocusManager, the focusable tree walker, useFocusRing, useHasTabbableChild)
// driving REAL focus movement in a single live tree.

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function pressTab(el: Element, shiftKey = false) {
	el.dispatchEvent(
		new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }),
	);
}

function pressArrow(el: Element, key: 'ArrowRight' | 'ArrowLeft') {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('@octanejs/aria — FocusScope contain', () => {
	it('moves focus on Tab and wraps from last to first (and Shift+Tab back)', async () => {
		const r = mount(ContainScope);
		await act(() => {});
		const c1 = r.find('#c1') as HTMLElement;
		const c2 = r.find('#c2') as HTMLInputElement;
		const c3 = r.find('#c3') as HTMLElement;

		await act(() => {
			c1.focus();
		});
		expect(document.activeElement).toBe(c1);

		// jsdom does not move focus on Tab natively — FocusScope's own document
		// keydown handler performs the move.
		await act(() => {
			pressTab(c1);
		});
		expect(document.activeElement).toBe(c2);

		await act(() => {
			pressTab(c2);
		});
		expect(document.activeElement).toBe(c3);

		// Tab from the last tabbable wraps to the first.
		await act(() => {
			pressTab(c3);
		});
		expect(document.activeElement).toBe(c1);

		// Shift+Tab from the first tabbable wraps to the last.
		await act(() => {
			pressTab(c1, true);
		});
		expect(document.activeElement).toBe(c3);
		r.unmount();
	});

	it('pulls focus back into the scope when an outside element steals focus', async () => {
		const r = mount(ContainScope);
		await act(() => {});
		const c2 = r.find('#c2') as HTMLInputElement;
		const outside = r.find('#outside') as HTMLElement;

		await act(() => {
			c2.focus();
		});
		await act(() => {
			outside.focus();
		});
		// The containment focusin handler restores synchronously; the focusout RAF
		// double-checks — settle both.
		await nextFrame();
		expect(document.activeElement).toBe(c2);
		r.unmount();
	});
});

describe('@octanejs/aria — FocusScope restoreFocus + autoFocus', () => {
	it('autoFocus focuses the first focusable on mount; restoreFocus returns focus on unmount', async () => {
		const r = mount(RestoreScope);
		const trigger = r.find('#trigger') as HTMLElement;

		await act(() => {
			trigger.focus();
		});
		r.click('#trigger'); // open the scope
		await act(() => {}); // autoFocus runs from a passive effect
		// jsdom's click() has detail=0, which the modality tracker reads as 'virtual',
		// so focusSafely defers the focus move by a frame (runAfterTransition).
		await nextFrame();
		expect(document.activeElement).toBe(r.find('#dialog-btn'));

		r.click('#trigger'); // close the scope
		await act(() => {});
		await nextFrame(); // restore runs in a RAF after the unmount cleanup...
		await nextFrame(); // ...and focusSafely defers one more frame under 'virtual'
		expect(document.activeElement).toBe(trigger);
		r.unmount();
	});

	it('autoFocus skips non-focusable content and lands on the first focusable element', async () => {
		const r = mount(AutoFocusScope);
		await act(() => {});
		// Settle a frame: under 'virtual' interaction modality (a prior click's
		// detail=0 leaves it set globally), focusSafely defers the move by a frame.
		await nextFrame();
		expect(document.activeElement).toBe(r.find('#af-btn'));
		r.unmount();
	});
});

describe('@octanejs/aria — useFocusManager', () => {
	it('focusNext/focusPrevious move focus within the scope and wrap at the edges', async () => {
		const r = mount(ManagedScope);
		await act(() => {});
		const m1 = r.find('#m1') as HTMLElement;
		const m2 = r.find('#m2') as HTMLElement;
		const m3 = r.find('#m3') as HTMLElement;

		await act(() => {
			m1.focus();
		});
		await act(() => {
			pressArrow(m1, 'ArrowRight');
		});
		expect(document.activeElement).toBe(m2);

		await act(() => {
			pressArrow(m2, 'ArrowRight');
		});
		expect(document.activeElement).toBe(m3);

		// Wrap forward from the last element.
		await act(() => {
			pressArrow(m3, 'ArrowRight');
		});
		expect(document.activeElement).toBe(m1);

		// Wrap backward from the first element.
		await act(() => {
			pressArrow(m1, 'ArrowLeft');
		});
		expect(document.activeElement).toBe(m3);
		r.unmount();
	});
});

describe('@octanejs/aria — focusable tree walker', () => {
	it('skips disabled, hidden, display:none, tabIndex=-1, and hidden inputs when tabbing', async () => {
		const r = mount(WalkerScope);
		await act(() => {});
		const w1 = r.find('#w1') as HTMLElement;
		const w2 = r.find('#w2') as HTMLElement;

		await act(() => {
			w1.focus();
		});
		// All five traps between w1 and w2 are skipped.
		await act(() => {
			pressTab(w1);
		});
		expect(document.activeElement).toBe(w2);

		// Wrapping also skips them.
		await act(() => {
			pressTab(w2);
		});
		expect(document.activeElement).toBe(w1);

		await act(() => {
			pressTab(w1, true);
		});
		expect(document.activeElement).toBe(w2);
		r.unmount();
	});
});

describe('@octanejs/aria — useFocusRing', () => {
	it('shows the ring for keyboard-modality focus, not for pointer-modality focus', async () => {
		const r = mount(FocusRingProbe);
		// The modality subscription registers from a passive effect.
		await act(() => {});
		const btn = r.find('#ring-btn') as HTMLElement;

		// Keyboard modality → focus ring visible.
		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		});
		await act(() => {
			btn.focus();
		});
		expect(btn.getAttribute('data-focused')).toBe('true');
		expect(btn.getAttribute('data-focus-visible')).toBe('true');

		// Pointer interaction while focused hides the ring but keeps focus.
		await act(() => {
			document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		});
		expect(btn.getAttribute('data-focused')).toBe('true');
		expect(btn.getAttribute('data-focus-visible')).toBe('false');

		await act(() => {
			btn.blur();
		});
		expect(btn.getAttribute('data-focused')).toBe('false');
		expect(btn.getAttribute('data-focus-visible')).toBe('false');

		// Pointer modality → focusing shows no ring.
		await act(() => {
			btn.focus();
		});
		expect(btn.getAttribute('data-focused')).toBe('true');
		expect(btn.getAttribute('data-focus-visible')).toBe('false');
		r.unmount();
	});

	it('FocusRing applies focusClass while focused and focusRingClass only for keyboard focus', async () => {
		const r = mount(FocusRingButton);
		await act(() => {});
		const btn = r.find('#fr-btn') as HTMLElement;

		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		});
		await act(() => {
			btn.focus();
		});
		expect(btn.classList.contains('is-focused')).toBe(true);
		expect(btn.classList.contains('focus-ring')).toBe(true);

		await act(() => {
			btn.blur();
		});
		expect(btn.classList.contains('is-focused')).toBe(false);
		expect(btn.classList.contains('focus-ring')).toBe(false);

		await act(() => {
			document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		});
		await act(() => {
			btn.focus();
		});
		expect(btn.classList.contains('is-focused')).toBe(true);
		expect(btn.classList.contains('focus-ring')).toBe(false);
		r.unmount();
	});
});

describe('@octanejs/aria — useHasTabbableChild', () => {
	it('reports true/false as the observed children change', async () => {
		const r = mount(TabbableChildProbe, { mode: 'button' });
		await act(() => {});
		const has = () => r.find('[data-testid="htc"]').getAttribute('data-has');
		expect(has()).toBe('true');

		r.update(TabbableChildProbe, { mode: 'disabled' });
		await act(() => {});
		expect(has()).toBe('false');

		r.update(TabbableChildProbe, { mode: 'negative' });
		await act(() => {});
		expect(has()).toBe('false');

		r.update(TabbableChildProbe, { mode: 'none' });
		await act(() => {});
		expect(has()).toBe('false');

		r.update(TabbableChildProbe, { mode: 'button' });
		await act(() => {});
		expect(has()).toBe('true');

		// The isDisabled option forces false even with a tabbable child.
		r.update(TabbableChildProbe, { mode: 'button', isDisabled: true });
		await act(() => {});
		expect(has()).toBe('false');
		r.unmount();
	});
});

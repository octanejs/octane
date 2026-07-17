import { describe, it, expect } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import {
	FocusProbe,
	FocusWithinProbe,
	FocusVisibleProbe,
	FocusableSpan,
	HoverProbe,
	KeyboardProbe,
} from './_fixtures/focus-interactions.tsx';

// @octanejs/aria — focus/keyboard/hover interactions (useFocus / useFocusWithin /
// useKeyboard / useHover / useFocusVisible / Focusable) on octane's native
// delegated events.

describe('@octanejs/aria — useFocus', () => {
	it('fires onFocus/onBlur with the focused element and reports onFocusChange', async () => {
		const r = mount(FocusProbe);
		const btn = r.find('#focus-target') as HTMLElement;

		await act(() => {
			btn.focus();
		});
		expect(btn.getAttribute('data-last')).toBe('focus:focus-target');
		expect(btn.getAttribute('data-focused')).toBe('true');

		await act(() => {
			btn.blur();
		});
		expect(btn.getAttribute('data-last')).toBe('blur:focus-target');
		expect(btn.getAttribute('data-focused')).toBe('false');
		r.unmount();
	});
});

describe('@octanejs/aria — useFocusWithin', () => {
	it('sets focus-within when a descendant focuses and clears it when focus leaves', async () => {
		const r = mount(FocusWithinProbe);
		const within = r.find('[data-testid="within"]');
		const input = r.find('#inner-input') as HTMLInputElement;
		const outside = r.find('#outside-btn') as HTMLElement;

		await act(() => {
			input.focus();
		});
		expect(within.getAttribute('data-within')).toBe('true');

		await act(() => {
			outside.focus();
		});
		expect(within.getAttribute('data-within')).toBe('false');
		r.unmount();
	});
});

describe('@octanejs/aria — useKeyboard', () => {
	it('delivers the wrapped event and stops propagation by default', async () => {
		const r = mount(KeyboardProbe, {});
		const btn = r.find('#kb-btn') as HTMLElement;

		await act(() => {
			btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		});
		// The handler saw the wrapped surface (continuePropagation) on the child's own target.
		expect(btn.getAttribute('data-info')).toBe('a:wrapped:self');
		// stopPropagation-by-default: the parent's plain onKeyDown must NOT fire.
		expect(r.find('[data-testid="kb-parent"]').getAttribute('data-parent')).toBe('0');
		r.unmount();
	});

	it('continuePropagation() lets the event reach ancestor handlers', async () => {
		const r = mount(KeyboardProbe, { continuePropagation: true });
		const btn = r.find('#kb-btn') as HTMLElement;

		await act(() => {
			btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
		});
		expect(btn.getAttribute('data-info')).toBe('b:wrapped:self');
		expect(r.find('[data-testid="kb-parent"]').getAttribute('data-parent')).toBe('1');
		r.unmount();
	});
});

describe('@octanejs/aria — useHover', () => {
	it('pointer enter/leave toggles isHovered and reports hoverstart/hoverend', async () => {
		const r = mount(HoverProbe);
		const target = r.find('#hover-target') as HTMLElement;

		// octane delegates enter/leave capture-phase, target-only — dispatch the real
		// non-bubbling events on the target itself.
		await act(() => {
			target.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		expect(target.getAttribute('data-hovered')).toBe('true');
		expect(target.getAttribute('data-change')).toBe('true');
		expect(target.getAttribute('data-last')).toBe('start:mouse');

		await act(() => {
			target.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		});
		expect(target.getAttribute('data-hovered')).toBe('false');
		expect(target.getAttribute('data-change')).toBe('false');
		expect(target.getAttribute('data-last')).toBe('end:mouse');
		r.unmount();
	});
});

describe('@octanejs/aria — useFocusVisible', () => {
	it('keyboard interaction shows the focus ring; pointer interaction hides it', async () => {
		const r = mount(FocusVisibleProbe);
		// The modality subscription registers from a passive effect.
		await act(() => {});
		const fv = () => r.find('[data-testid="fv"]').getAttribute('data-focus-visible');

		// Keyboard (Tab) → focus visible.
		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		});
		expect(fv()).toBe('true');

		// Pointer → focus not visible.
		await act(() => {
			document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		});
		expect(fv()).toBe('false');

		// Keyboard again → visible again.
		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
		});
		expect(fv()).toBe('true');
		r.unmount();
	});
});

describe('@octanejs/aria — Focusable', () => {
	it('merges focusableProps (tabIndex + focus handlers) onto its element child', async () => {
		const r = mount(FocusableSpan);
		const span = r.find('#focusable-span') as HTMLElement;
		expect(span.getAttribute('tabindex')).toBe('0');

		await act(() => {
			span.focus();
		});
		expect(span.getAttribute('data-focused')).toBe('true');
		r.unmount();
	});
});

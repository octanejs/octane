import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, mount } from '../../octane/tests/_helpers';
import { TooltipHarness } from './_fixtures/tooltip.tsx';

// jsdom lacks CSS.escape (pulled in transitively by the interaction utilities).
if (typeof (globalThis as any).CSS === 'undefined') {
	(globalThis as any).CSS = {
		escape(value: string): string {
			return String(value).replace(/[^-\w]/g, (c) => '\\' + c);
		},
	};
}

// Behavioral coverage for the Phase-3 tooltip hook family: useTooltipTriggerState (stately),
// useTooltipTrigger + useTooltip (aria). These assert the ARIA wiring a consumer observes and
// the hover/focus/blur/Escape open-close transitions the state machine drives.

// The warmup/cooldown timers live in module-global state, so run the warmup test first (with a
// clean, un-warmed global) before any focus test warms it up.
describe('@octanejs/aria — useTooltipTrigger hover warmup', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('opens after the warmup delay on hover, and closes after the cooldown on unhover', async () => {
		vi.useFakeTimers();
		const r = mount(TooltipHarness, { delay: 200, closeDelay: 100 });
		const trigger = r.find('[data-testid="trigger"]') as HTMLElement;

		// Hover start schedules the warmup timer; the tooltip is not open yet. The trigger only
		// treats hover as real when the interaction modality is pointer (matching upstream's
		// obscured-trigger guard), so establish pointer modality first.
		await act(() => {
			document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			trigger.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
		});
		expect(r.container.querySelector('[data-testid="tooltip"]')).toBeNull();

		// After the warmup delay elapses the tooltip opens.
		await act(() => {
			vi.advanceTimersByTime(200);
		});
		const tooltip = r.container.querySelector('[data-testid="tooltip"]') as HTMLElement;
		expect(tooltip).toBeTruthy();
		expect(tooltip.getAttribute('role')).toBe('tooltip');
		// aria-describedby on the trigger points at the tooltip's id.
		expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.getAttribute('id'));

		// Unhover starts the cooldown timer; after it elapses the tooltip closes.
		await act(() => {
			trigger.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
		});
		await act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(r.container.querySelector('[data-testid="tooltip"]')).toBeNull();
		expect(trigger.getAttribute('aria-describedby')).toBeNull();

		// Drain any residual global cooldown timer so the warmed-up flag resets cleanly.
		await act(() => {
			vi.runOnlyPendingTimers();
		});
		r.unmount();
	});
});

describe('@octanejs/aria — useTooltipTrigger focus + Escape', () => {
	function setKeyboardModality() {
		// Focus-visible modality gates focus-triggered opening; Tab establishes keyboard modality.
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
	}

	it('opens immediately on visible focus and wires role/aria-describedby, closing on blur', async () => {
		const r = mount(TooltipHarness, {});
		const trigger = r.find('[data-testid="trigger"]') as HTMLElement;

		expect(r.container.querySelector('[data-testid="tooltip"]')).toBeNull();
		expect(trigger.getAttribute('aria-describedby')).toBeNull();

		await act(() => {
			setKeyboardModality();
			trigger.focus();
		});

		const tooltip = r.container.querySelector('[data-testid="tooltip"]') as HTMLElement;
		expect(tooltip).toBeTruthy();
		expect(tooltip.getAttribute('role')).toBe('tooltip');
		const id = tooltip.getAttribute('id');
		expect(id).toBeTruthy();
		expect(trigger.getAttribute('aria-describedby')).toBe(id);

		// Blur closes the tooltip immediately.
		await act(() => {
			trigger.blur();
		});
		expect(r.container.querySelector('[data-testid="tooltip"]')).toBeNull();
		expect(trigger.getAttribute('aria-describedby')).toBeNull();
		r.unmount();
	});

	it('closes on Escape via the document key listener while open', async () => {
		const r = mount(TooltipHarness, {});
		const trigger = r.find('[data-testid="trigger"]') as HTMLElement;

		await act(() => {
			setKeyboardModality();
			trigger.focus();
		});
		expect(r.container.querySelector('[data-testid="tooltip"]')).toBeTruthy();

		await act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		expect(r.container.querySelector('[data-testid="tooltip"]')).toBeNull();
		r.unmount();
	});
});

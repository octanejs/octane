import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { TooltipApp } from './_fixtures/tooltip.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

describe('@octanejs/radix — Tooltip (Popper chain)', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed at mount; focus opens instantly with positioned content + a11y copy', async () => {
		const r = mount(TooltipApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content"]')).toBe(null);

		// Focus opens instantly (no delay).
		flushSync(() => trigger.focus());
		await settle();

		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('instant-open');
		expect(trigger.getAttribute('aria-describedby')).toBeTruthy();
		// Portal'd into body, inside the popper positioning wrapper.
		expect(document.body.contains(content)).toBe(true);
		const wrapper = content.closest('[data-radix-popper-content-wrapper]')!;
		expect(wrapper).not.toBe(null);
		expect(content.getAttribute('data-side')).toBe('top'); // tooltip default side
		// The VisuallyHidden a11y copy carries role=tooltip + the describedby id.
		const vh = document.getElementById(trigger.getAttribute('aria-describedby')!)!;
		expect(vh).not.toBe(null);
		expect(vh.getAttribute('role')).toBe('tooltip');
		expect(vh.textContent).toContain('Tip text');
		// The arrow inside the hidden copy is suppressed; the visible one renders.
		expect(document.querySelectorAll('[data-testid="arrow"]').length).toBe(1);
		r.unmount();
	});

	it('pointer-move opens after the delay; blur closes', async () => {
		const r = mount(TooltipApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;

		flushSync(() => {
			trigger.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
		});
		await settle();
		// Not yet — the 100ms delay hasn't elapsed.
		expect($('[data-testid="content"]')).toBe(null);
		await new Promise((res) => setTimeout(res, 120));
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('delayed-open');

		// Blur closes.
		flushSync(() => trigger.focus());
		flushSync(() => trigger.blur());
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('Escape closes via the dismissable layer', async () => {
		const r = mount(TooltipApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		flushSync(() => trigger.focus());
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		flushSync(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});
});

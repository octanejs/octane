import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { HoverCardApp } from './_fixtures/hovercard.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

describe('@octanejs/radix — HoverCard', () => {
	afterEach(async () => {
		await settle();
	});

	it('pointer-enter opens after openDelay; pointer-leave closes after closeDelay', async () => {
		const r = mount(HoverCardApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content"]')).toBe(null);

		flushSync(() => {
			trigger.dispatchEvent(
				new PointerEvent('pointerenter', { bubbles: false, pointerType: 'mouse' }),
			);
		});
		await settle();
		// Not yet — the 100ms open delay hasn't elapsed.
		expect($('[data-testid="content"]')).toBe(null);
		await new Promise((res) => setTimeout(res, 120));
		await settle();
		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(content.getAttribute('data-state')).toBe('open');
		// Positioned by popper, portal'd into body.
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		// Tabbables inside the card are removed from the tab order.
		expect($('[data-testid="link"]')!.getAttribute('tabindex')).toBe('-1');

		flushSync(() => {
			trigger.dispatchEvent(
				new PointerEvent('pointerleave', { bubbles: false, pointerType: 'mouse' }),
			);
		});
		await new Promise((res) => setTimeout(res, 80));
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('touch pointer-enter does NOT open; focus opens after delay', async () => {
		const r = mount(HoverCardApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;

		flushSync(() => {
			trigger.dispatchEvent(
				new PointerEvent('pointerenter', { bubbles: false, pointerType: 'touch' }),
			);
		});
		await new Promise((res) => setTimeout(res, 120));
		await settle();
		expect($('[data-testid="content"]')).toBe(null);

		// Focus opens (after the same openDelay — HoverCard has no instant-open).
		flushSync(() => trigger.focus());
		await new Promise((res) => setTimeout(res, 120));
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);
		r.unmount();
	});

	it('Escape dismisses immediately via the dismissable layer', async () => {
		const r = mount(HoverCardApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		flushSync(() => trigger.focus());
		await new Promise((res) => setTimeout(res, 120));
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

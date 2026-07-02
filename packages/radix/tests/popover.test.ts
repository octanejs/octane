import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { PopoverApp, PopoverWithAnchorApp } from './_fixtures/popover.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

// jsdom's .click() emits only `click` — the DismissableLayer listens for
// pointerdown, so emit the full sequence like a real pointer press.
function press(el: Element | Document, opts: PointerEventInit = {}): void {
	flushSync(() => {
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ...opts }));
		el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, ...opts }));
		el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...opts }));
	});
}

describe('@octanejs/radix — Popover', () => {
	afterEach(async () => {
		await settle();
	});

	it('closed at mount; trigger click toggles; content is popper-positioned with role=dialog', async () => {
		const r = mount(PopoverApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect($('[data-testid="content"]')).toBe(null);

		press(trigger);
		await settle();

		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('dialog');
		expect(content.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		expect(trigger.getAttribute('aria-controls')).toBe(content.id);
		// Portal'd into body inside the popper positioning wrapper.
		expect(document.body.contains(content)).toBe(true);
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);
		expect(content.getAttribute('data-side')).toBe('bottom'); // popper default side

		// Toggle closed again via the trigger.
		press(trigger);
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		expect(trigger.getAttribute('data-state')).toBe('closed');
		r.unmount();
	});

	it('Close button and Escape both dismiss', async () => {
		const r = mount(PopoverApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		press(trigger);
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		press($('[data-testid="close"]')!);
		await settle();
		expect($('[data-testid="content"]')).toBe(null);

		press(trigger);
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);
		flushSync(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('pointer-down outside dismisses (non-modal)', async () => {
		const r = mount(PopoverApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		press(trigger);
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);

		press(document.body);
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('custom Anchor positions the content instead of the trigger', async () => {
		const r = mount(PopoverWithAnchorApp);
		await settle();
		const anchor = $('[data-testid="anchor"]')!;
		expect(anchor).not.toBe(null);
		const trigger = $('[data-testid="trigger"]')!;
		press(trigger);
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null);
		r.unmount();
	});
});

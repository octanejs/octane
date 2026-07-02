import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { ContextMenuApp } from './_fixtures/context-menu.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

describe('@octanejs/radix — ContextMenu', () => {
	afterEach(async () => {
		await settle();
	});

	it('opens on contextmenu (native event prevented) anchored to the pointer; item selects', async () => {
		const r = mount(ContextMenuApp);
		await settle();
		const trigger = $('[data-testid="trigger"]')!;
		expect(trigger.getAttribute('data-state')).toBe('closed');
		expect($('[data-testid="content"]')).toBe(null);

		let event!: MouseEvent;
		flushSync(() => {
			event = new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: 120,
				clientY: 80,
			});
			trigger.dispatchEvent(event);
		});
		await settle();

		expect(event.defaultPrevented).toBe(true); // native menu suppressed
		const content = $('[data-testid="content"]')!;
		expect(content).not.toBe(null);
		expect(content.getAttribute('role')).toBe('menu');
		expect(trigger.getAttribute('data-state')).toBe('open');
		expect(content.closest('[data-radix-popper-content-wrapper]')).not.toBe(null);

		flushSync(() => {
			$('[data-testid="item-reload"]')!.dispatchEvent(
				new MouseEvent('click', { bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect($('[data-testid="last"]')!.textContent).toBe('reload');
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});

	it('Escape dismisses', async () => {
		const r = mount(ContextMenuApp);
		await settle();
		flushSync(() => {
			$('[data-testid="trigger"]')!.dispatchEvent(
				new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
			);
		});
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

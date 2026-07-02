import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushEffects } from '../../octane/tests/_helpers';
import { flushSync } from '../../octane/src/index.js';
import { AlertApp, TabsKeyboard } from './_fixtures/alert-tabs.tsx';

async function settle(): Promise<void> {
	for (let i = 0; i < 3; i++) {
		flushEffects();
		flushSync(() => {});
		await new Promise((res) => setTimeout(res, 5));
	}
}

const $ = (sel: string): HTMLElement | null => document.querySelector(sel);

describe('@octanejs/radix — AlertDialog', () => {
	afterEach(async () => {
		await settle();
	});

	it('opens with role=alertdialog and the CANCEL button autofocused', async () => {
		const r = mount(AlertApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();

		const content = $('[data-testid="content"]')!;
		expect(content.getAttribute('role')).toBe('alertdialog');
		expect(content.getAttribute('data-state')).toBe('open');
		// The safe action gets initial focus (not the first tabbable).
		expect(document.activeElement).toBe($('[data-testid="cancel"]'));
		r.unmount();
	});

	it('outside pointer-down does NOT dismiss (unlike Dialog)', async () => {
		const r = mount(AlertApp);
		await settle();
		r.click('[data-testid="trigger"]');
		await settle();
		const overlay = $('[data-testid="overlay"]')!;

		flushSync(() => {
			overlay.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
		});
		flushSync(() => {
			overlay.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
		});
		await settle();
		expect($('[data-testid="content"]')).not.toBe(null); // still open
		r.unmount();
	});

	it('Action and Cancel both close; Escape closes', async () => {
		const r = mount(AlertApp);
		await settle();

		// Cancel closes.
		r.click('[data-testid="trigger"]');
		await settle();
		flushSync(() => ($('[data-testid="cancel"]') as HTMLElement).click());
		await settle();
		expect($('[data-testid="content"]')).toBe(null);

		// Action closes.
		r.click('[data-testid="trigger"]');
		await settle();
		flushSync(() => ($('[data-testid="action"]') as HTMLElement).click());
		await settle();
		expect($('[data-testid="content"]')).toBe(null);

		// Escape closes.
		r.click('[data-testid="trigger"]');
		await settle();
		flushSync(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect($('[data-testid="content"]')).toBe(null);
		r.unmount();
	});
});

describe('@octanejs/radix — Tabs roving focus + keyboard', () => {
	afterEach(async () => {
		await settle();
	});

	it('roving tabindex: all triggers start -1 (the group is the entry); focusing an item makes it the single tab stop', async () => {
		const r = mount(TabsKeyboard);
		await settle();
		// Radix mounts with NO current tab stop (verified byte-identical vs real Radix in
		// the differential suite) — the group div itself carries tabindex=0 as the entry.
		expect(r.find('[data-testid="list"]').getAttribute('tabindex')).toBe('0');
		expect(r.find('[data-testid="t1"]').getAttribute('tabindex')).toBe('-1');
		expect(r.find('[data-testid="t2"]').getAttribute('tabindex')).toBe('-1');

		// Focusing an item makes it the roving stop.
		flushSync(() => (r.find('[data-testid="t1"]') as HTMLElement).focus());
		await settle();
		expect(r.find('[data-testid="t1"]').getAttribute('tabindex')).toBe('0');
		expect(r.find('[data-testid="t2"]').getAttribute('tabindex')).toBe('-1');
		r.unmount();
	});

	it('ArrowRight moves focus to the next trigger and auto-activates it', async () => {
		const r = mount(TabsKeyboard);
		await settle();
		const t1 = r.find('[data-testid="t1"]') as HTMLElement;
		flushSync(() => t1.focus());
		await settle();

		flushSync(() => {
			t1.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
			);
		});
		// RovingFocusGroup defers the focus move to a setTimeout.
		await settle();

		const t2 = r.find('[data-testid="t2"]') as HTMLElement;
		expect(document.activeElement).toBe(t2);
		// Automatic activation: focusing selects.
		expect(t2.getAttribute('aria-selected')).toBe('true');
		expect(t2.getAttribute('data-state')).toBe('active');
		expect(r.find('[data-testid="t1"]').getAttribute('aria-selected')).toBe('false');
		// Panels follow.
		expect(r.find('[data-testid="c2"]').hasAttribute('hidden')).toBe(false);
		expect(r.find('[data-testid="c1"]').hasAttribute('hidden')).toBe(true);
		r.unmount();
	});

	it('End jumps to the last trigger; Home returns to the first', async () => {
		const r = mount(TabsKeyboard);
		await settle();
		const t1 = r.find('[data-testid="t1"]') as HTMLElement;
		flushSync(() => t1.focus());
		await settle();

		flushSync(() => {
			t1.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		const t3 = r.find('[data-testid="t3"]') as HTMLElement;
		expect(document.activeElement).toBe(t3);
		expect(t3.getAttribute('aria-selected')).toBe('true');

		flushSync(() => {
			t3.dispatchEvent(
				new KeyboardEvent('keydown', { key: 'Home', bubbles: true, cancelable: true }),
			);
		});
		await settle();
		expect(document.activeElement).toBe(r.find('[data-testid="t1"]'));
		r.unmount();
	});
});

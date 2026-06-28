import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../../octane/tests/_helpers';
import { Tooltip, TwoTooltips } from './_fixtures/tooltip.tsx';
import { Popover } from './_fixtures/popover.tsx';
import { Menu } from './_fixtures/menu.tsx';

describe('@octanejs/floating-ui — useFloating positioning', () => {
	it('wires refs, positions the floating element, and flips isPositioned', async () => {
		const r = mount(Tooltip);
		const floating = r.container.querySelector('.floating') as HTMLElement;
		expect(floating).not.toBe(null);
		// Strategy reflected synchronously in floatingStyles.
		expect(floating.style.position).toBe('absolute');

		// computePosition resolves async (promise → flushSync(setData)); give it ticks.
		for (let i = 0; i < 5; i++) {
			await new Promise((res) => setTimeout(res, 0));
		}

		expect(floating.getAttribute('data-positioned')).toBe('1');
		expect(floating.style.transform).toMatch(/translate\(/);
		r.unmount();
	});

	it('keeps two useFloating calls in one component independent (slot isolation)', () => {
		const r = mount(TwoTooltips);
		expect(r.container.querySelector('.float-a')!.getAttribute('data-pos')).toBe('top');
		expect(r.container.querySelector('.float-b')!.getAttribute('data-pos')).toBe('right');
		r.unmount();
	});

	it('composes useRole + useInteractions on a popover (ARIA + merged onClick)', () => {
		const r = mount(Popover);
		const trigger = r.container.querySelector('.trigger') as HTMLElement;
		// useRole reference props (role: menu, closed).
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
		expect(r.container.querySelector('.menu')).toBe(null);

		// The merged onClick (from getReferenceProps) opens it.
		r.click('.trigger');
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const menu = r.container.querySelector('.menu') as HTMLElement;
		expect(menu).not.toBe(null);
		expect(menu.getAttribute('role')).toBe('menu');
		// aria-controls wires reference → floating by id.
		expect(trigger.getAttribute('aria-controls')).toBe(menu.getAttribute('id'));
		r.unmount();
	});

	it('opens via useClick and closes via useDismiss (escape)', async () => {
		const r = mount(Menu);
		expect(r.container.querySelector('.menu')).toBe(null);

		// useClick toggles open on the reference's merged onClick.
		r.click('.trigger');
		expect(r.container.querySelector('.menu')).not.toBe(null);

		// useDismiss registers a document keydown listener while open.
		await nextPaint();
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await nextPaint();
		expect(r.container.querySelector('.menu')).toBe(null);
		r.unmount();
	});
});

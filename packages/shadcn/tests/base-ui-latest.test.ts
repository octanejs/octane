import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'octane';
import { mount } from '../../octane/tests/_helpers';
import {
	SelectExample,
	NavigationExample,
	ScrollExample,
} from './_fixtures/shadcn-diff/base-ui-latest.tsrx';

let unmount: (() => void) | undefined;
afterEach(() => {
	unmount?.();
	unmount = undefined;
});

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
}

describe('@octanejs/shadcn — Base UI 1.8 wrappers', () => {
	it('Select forwards controlled values, submits the selected value, and restores trigger focus', async () => {
		const app = mount(SelectExample);
		unmount = app.unmount;
		await settle();
		const trigger = app.container.querySelector<HTMLButtonElement>('#fruit-trigger')!;
		expect(trigger.textContent).toContain('Apple');
		expect(trigger.getAttribute('data-size')).toBe('sm');
		await act(async () => {
			trigger.click();
		});
		await settle();
		const popup = document.querySelector<HTMLElement>('[data-slot="select-content"]')!;
		// The default menu color is resolved by the CLI; these hooks have no rules in the shipped theme.
		expect(popup.className).not.toMatch(/\bcn-menu-(?:target|translucent)\b/);
		const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((element) =>
			element.textContent?.includes('Pear'),
		)!;
		expect(option).toBeDefined();
		await act(async () => {
			option.click();
		});
		await settle();
		expect(app.container.querySelector('#selected-fruit')?.textContent).toBe('pear');
		expect(trigger.textContent).toContain('Pear');
		expect(new FormData(app.container.querySelector('form')!).get('fruit')).toBe('pear');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(document.activeElement).toBe(trigger);
	});

	it('NavigationMenu exposes links, opens its content, and closes with Escape', async () => {
		const app = mount(NavigationExample);
		unmount = app.unmount;
		await settle();
		const trigger = app.container.querySelector<HTMLButtonElement>('#docs-trigger')!;
		expect(app.container.querySelector('#home-link')?.getAttribute('href')).toBe('#home');
		await act(async () => {
			trigger.click();
		});
		await settle();
		const link = document.querySelector<HTMLAnchorElement>(
			'[data-slot="navigation-menu-content"] a',
		)!;
		expect(link?.textContent).toBe('Guide');
		expect(link.getAttribute('href')).toBe('#guide');
		await act(async () => {
			link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		});
		await settle();
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
	});

	it('ScrollArea forwards content and composes a horizontal scrollbar inside its viewport', async () => {
		const app = mount(ScrollExample);
		unmount = app.unmount;
		await settle();
		const viewport = app.container.querySelector('[data-slot="scroll-area-viewport"]')!;
		expect(viewport.textContent).toContain('Scrollable content');
		expect(app.container.querySelector('#scroll-example')?.className).toContain('h-24');
		const bar = app.container.querySelector(
			'[data-slot="scroll-area-scrollbar"][data-orientation="horizontal"]',
		)!;
		expect(bar).not.toBeNull();
		expect(bar.querySelector('[data-slot="scroll-area-thumb"]')).not.toBeNull();
	});
});

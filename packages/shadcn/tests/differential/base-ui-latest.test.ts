// References: shadcn-ui/ui@7c9eaba1c0a6404c990c144a654792e3313c650d,
// apps/v4/registry/bases/base/ui/{select,navigation-menu,scroll-area}.tsx.
// React uses the pinned Base UI 1.8 primitives and the same Nova style transform.
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { act as reactAct } from 'react';
import { act as octaneAct } from 'octane';
import {
	mountDifferential,
	normaliseHtml,
	preloadDifferentialFixture,
	type DiffMount,
} from '../../../octane/tests/differential/_rig';

const fixture = resolve(__dirname, '../_fixtures/shadcn-diff/base-ui-latest.tsrx');
const cache = resolve(__dirname, '.react-cache/base-ui');
await preloadDifferentialFixture(fixture, cache);

function controlledElement(mount: DiffMount, triggerId: string): HTMLElement {
	const id = mount.find(triggerId).getAttribute('aria-controls');
	expect(id).toBeTruthy();
	const element = document.getElementById(id!);
	expect(element).not.toBeNull();
	return element!;
}

function popupPositioner(mount: DiffMount, triggerId: string, popupSelector: string): HTMLElement {
	const controlled = controlledElement(mount, triggerId);
	const popup = controlled.closest<HTMLElement>(popupSelector);
	expect(popup).not.toBeNull();
	const positioner = popup!.parentElement!;
	expect(positioner.closest('[data-base-ui-portal]')?.parentElement).toBe(document.body);
	expect(mount.container.contains(positioner)).toBe(false);
	return positioner;
}

function comparePortalPositioners(
	octane: DiffMount,
	react: DiffMount,
	triggerId: string,
	popupSelector: string,
): void {
	const octanePositioner = popupPositioner(octane, triggerId, popupSelector);
	const reactPositioner = popupPositioner(react, triggerId, popupSelector);
	expect(octanePositioner).not.toBe(reactPositioner);
	const snapshot = (source: HTMLElement) => {
		const positioner = source.cloneNode(true) as HTMLElement;
		// The second trigger click moves focus from the first runtime's popup.
		// Its focus guards and roving option tabindex can therefore differ.
		for (const element of positioner.querySelectorAll(
			'[data-base-ui-focus-guard], [role="option"]',
		)) {
			element.removeAttribute('tabindex');
			element.removeAttribute('data-tabindex');
		}
		for (const element of positioner.querySelectorAll(
			'[data-starting-style], [data-ending-style]',
		)) {
			element.removeAttribute('data-starting-style');
			element.removeAttribute('data-ending-style');
		}
		return normaliseHtml(positioner.outerHTML);
	};
	expect(snapshot(octanePositioner)).toBe(snapshot(reactPositioner));
}

function selectOption(mount: DiffMount, text: string): HTMLElement {
	const list = controlledElement(mount, '#fruit-trigger');
	const option = [...list.querySelectorAll<HTMLElement>('[role="option"]')].find(
		(element) => element.textContent === text,
	);
	expect(option).toBeDefined();
	return option!;
}

describe('differential: shadcn 4.21 Base UI wrappers', () => {
	// @parity-case differential:shadcn-base-select
	it('Select compares portaled group, options, scroll buttons and selection', async () => {
		const pair = await mountDifferential(fixture, 'SelectExample', undefined, cache);
		try {
			await pair.step('selected Apple', () => {});
			await pair.step('controlled selection changes to Pear', async (octane, react) => {
				await octane.click('#choose-pear');
				await react.click('#choose-pear');
			});
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#selected-fruit').textContent).toBe('pear');
				expect(mount.find('#fruit-trigger').textContent).toContain('Pear');
			}
			await pair.step('open popup', async (octane, react) => {
				await octane.click('#fruit-trigger');
				await react.click('#fruit-trigger');
			});
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#fruit-trigger').getAttribute('aria-expanded')).toBe('true');
				const list = controlledElement(mount, '#fruit-trigger');
				expect(list.getAttribute('role')).toBe('listbox');
				expect(list.querySelector('[data-slot="select-label"]')?.textContent).toBe('Fruit');
				expect(selectOption(mount, 'Apple').getAttribute('aria-selected')).toBe('false');
				expect(selectOption(mount, 'Pear').getAttribute('aria-selected')).toBe('true');
			}
			comparePortalPositioners(
				pair.octane,
				pair.react,
				'#fruit-trigger',
				'[data-slot="select-content"]',
			);
			await pair.step('scrolling exposes both scroll buttons', async (octane, react) => {
				const scroll = (mount: DiffMount) => {
					const list = controlledElement(mount, '#fruit-trigger');
					Object.defineProperties(list, {
						scrollHeight: { configurable: true, value: 200 },
						clientHeight: { configurable: true, value: 40 },
					});
					list.scrollTop = 30;
					list.dispatchEvent(new Event('scroll', { bubbles: true }));
				};
				await octaneAct(async () => scroll(octane));
				await reactAct(async () => scroll(react));
			});
			for (const mount of [pair.octane, pair.react]) {
				const positioner = popupPositioner(mount, '#fruit-trigger', '[data-slot="select-content"]');
				expect(positioner.querySelector('[data-slot="select-scroll-up-button"]')).not.toBeNull();
				expect(positioner.querySelector('[data-slot="select-scroll-down-button"]')).not.toBeNull();
			}
			comparePortalPositioners(
				pair.octane,
				pair.react,
				'#fruit-trigger',
				'[data-slot="select-content"]',
			);
			await pair.step('select Apple in the popup', async (octane, react) => {
				await octaneAct(async () => selectOption(octane, 'Apple').click());
				await reactAct(async () => selectOption(react, 'Apple').click());
			});
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#selected-fruit').textContent).toBe('apple');
				expect(mount.find('#fruit-trigger').textContent).toContain('Apple');
				expect(mount.find('#fruit-trigger').getAttribute('aria-expanded')).toBe('false');
			}
		} finally {
			pair.unmount();
		}
	});

	// @parity-case differential:shadcn-base-navigation-menu
	it('NavigationMenu compares portaled content, links and Escape close', async () => {
		const pair = await mountDifferential(fixture, 'NavigationExample', undefined, cache);
		try {
			await pair.step('navigation mount', () => {});
			await pair.step('open menu', async (octane, react) => {
				await octane.click('#docs-trigger');
				await react.click('#docs-trigger');
			});
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#docs-trigger').getAttribute('aria-expanded')).toBe('true');
				const popup = controlledElement(mount, '#docs-trigger');
				expect(popup.tagName).toBe('NAV');
				expect(popup.querySelector('[data-slot="navigation-menu-content"] a')?.textContent).toBe(
					'Guide',
				);
			}
			comparePortalPositioners(pair.octane, pair.react, '#docs-trigger', 'nav');
			for (const mount of [pair.octane, pair.react]) {
				expect(mount.find('#home-link').getAttribute('href')).toBe('#home');
			}
			await pair.step('Escape closes menu', async (octane, react) => {
				const escape = (mount: DiffMount) => {
					const link = controlledElement(mount, '#docs-trigger').querySelector('a')!;
					link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				};
				await octaneAct(async () => escape(octane));
				await reactAct(async () => escape(react));
			});
			for (const mount of [pair.octane, pair.react])
				expect(mount.find('#docs-trigger').getAttribute('aria-expanded')).toBe('false');
		} finally {
			pair.unmount();
		}
	});

	// @parity-case differential:shadcn-base-scroll-area
	it('ScrollArea preserves viewport content and horizontal scrollbar markup', async () => {
		const pair = await mountDifferential(fixture, 'ScrollExample', undefined, cache);
		try {
			await pair.step('scroll area mount', () => {});
			for (const mount of [pair.octane, pair.react])
				expect(mount.container.textContent).toContain('Scrollable content');
		} finally {
			pair.unmount();
		}
	});
});

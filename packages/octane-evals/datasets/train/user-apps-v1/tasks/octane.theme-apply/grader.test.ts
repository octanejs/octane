import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import {
	App,
	palette,
	spacing,
	theme,
} from '@octane-eval-submission/octane.theme-apply/src/App.tsrx';

afterEach(cleanup);

function injectedSheets(): HTMLStyleElement[] {
	return Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-octane]'));
}

function sheetCss(hash: string): string {
	return (
		injectedSheets().find((sheet) => sheet.getAttribute('data-octane') === hash)?.textContent ?? ''
	);
}

function themeChain(): string[] {
	return String(theme.$class).split(' ');
}

function scopeClasses(element: Element): string[] {
	const hashes = injectedSheets().map((sheet) => sheet.getAttribute('data-octane')!);
	return Array.from(element.classList).filter((name) => hashes.includes(name));
}

describe('octane.theme-apply', () => {
	it('composes palette and spacing into the exported theme', () => {
		expect(String(palette.$class).split(' ')).toHaveLength(1);
		expect(String(spacing.$class).split(' ')).toHaveLength(1);
		expect(palette.$class).not.toBe(spacing.$class);

		const chain = themeChain();
		expect(chain).toHaveLength(3);
		expect(chain.slice(0, 2)).toEqual([palette.$class, spacing.$class]);
		const own = chain[2];
		expect(own).not.toBe(palette.$class);
		expect(own).not.toBe(spacing.$class);

		expect(injectedSheets().map((sheet) => sheet.getAttribute('data-octane'))).toEqual(chain);
		expect(sheetCss(palette.$class)).toContain(`.card.${palette.$class}`);
		expect(sheetCss(palette.$class)).toContain('color');
		expect(sheetCss(spacing.$class)).toContain(`.card.${spacing.$class}`);
		expect(sheetCss(spacing.$class)).toContain('padding');
		expect(sheetCss(own)).toContain(`.card.${own}`);
		expect(sheetCss(own)).toContain('border');
		expect(sheetCss(own)).toContain(`.badge.${own}`);
	});

	it('applies the theme chain to every card and the badge', () => {
		const chain = themeChain();
		const view = render(App);
		const main = view.container.querySelector('#app')!;
		const first = main.querySelector('#first')!;
		const second = main.querySelector('#second')!;
		const badge = main.querySelector('#badge')!;

		expect(first.tagName).toBe('ARTICLE');
		expect(first.textContent).toBe('First card');
		expect(first.classList.contains('card')).toBe(true);
		expect(scopeClasses(first)).toEqual(chain);

		expect(second.tagName).toBe('ARTICLE');
		expect(second.textContent).toBe('Second card');
		expect(second.classList.contains('card')).toBe(true);
		expect(scopeClasses(second)).toEqual(chain);

		expect(badge.classList.contains('badge')).toBe(true);
		expect(scopeClasses(badge)).toEqual(chain);
		expect(injectedSheets()).toHaveLength(3);
	});
});

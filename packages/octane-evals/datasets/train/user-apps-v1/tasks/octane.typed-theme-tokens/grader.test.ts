import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@octanejs/testing-library';
import { App, tokens } from '@octane-eval-submission/octane.typed-theme-tokens/src/App.tsrx';

afterEach(cleanup);

function injectedSheets(): HTMLStyleElement[] {
	return Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-octane]'));
}

function sheetCss(hash: string): string {
	return (
		injectedSheets().find((sheet) => sheet.getAttribute('data-octane') === hash)?.textContent ?? ''
	);
}

function scopeClasses(element: Element): string[] {
	const hashes = injectedSheets().map((sheet) => sheet.getAttribute('data-octane')!);
	return Array.from(element.classList).filter((name) => hashes.includes(name));
}

describe('octane.typed-theme-tokens', () => {
	it('returns var(--name, fallback) references for every declared leaf', () => {
		expect(tokens.colors.surface).toBe('var(--colors-surface, #ffffff)');
		expect(tokens.colors.ink).toBe('var(--colors-ink, #1b1b23)');
		expect(tokens.colors.accent).toBe('var(--colors-accent, #4353ff)');
		expect(tokens.space.cardPad).toBe('var(--space-cardPad, 1.25rem)');
	});

	it('exposes the bare custom-property names and the declared values', () => {
		expect(tokens.vars.colors.surface).toBe('--colors-surface');
		expect(tokens.vars.colors.ink).toBe('--colors-ink');
		expect(tokens.vars.colors.accent).toBe('--colors-accent');
		expect(tokens.vars.space.cardPad).toBe('--space-cardPad');
		expect(tokens.raw).toEqual({
			colors: { surface: '#ffffff', ink: '#1b1b23', accent: '#4353ff' },
			space: { cardPad: '1.25rem' },
		});
	});

	it('emits the base sheet and the dark variant sheet', () => {
		expect(typeof tokens.css).toBe('string');
		expect(tokens.css).toContain(':root {');
		expect(tokens.css).toContain('--colors-surface: #ffffff;');
		expect(tokens.css).toContain('--colors-ink: #1b1b23;');
		expect(tokens.css).toContain('--colors-accent: #4353ff;');
		expect(tokens.css).toContain('--space-cardPad: 1.25rem;');
		expect(tokens.css).toContain('.theme-dark {');
		expect(tokens.css).toContain('--colors-surface: #16161e;');
		expect(tokens.css).toContain('--colors-ink: #f2f2f7;');
	});

	it('ships the token sheet through a plain <style> element inside the app', () => {
		const view = render(App);
		const main = view.container.querySelector('#app')!;
		expect(main.tagName).toBe('MAIN');
		const styleElement = main.querySelector('style');
		expect(styleElement, 'expected a <style> element rendering tokens.css').not.toBeNull();
		expect(styleElement!.hasAttribute('data-octane')).toBe(false);
		expect(styleElement!.textContent).toBe(tokens.css);
	});

	it('styles the card through the emitted custom properties, not literals', () => {
		const view = render(App);
		const card = view.container.querySelector('#app .card')!;
		expect(card.tagName).toBe('ARTICLE');
		const [hash] = scopeClasses(card);
		expect(hash, 'expected the card to carry a scope hash class').toBeDefined();

		const css = sheetCss(hash);
		expect(css).toMatch(/\.card\.[^\s{]+\s*\{[^}]*background:\s*var\(--colors-surface/);
		expect(css).toMatch(/\.card\.[^\s{]+\s*\{[^}]*color:\s*var\(--colors-ink/);
		expect(css).toMatch(/\.card\.[^\s{]+\s*\{[^}]*padding:\s*var\(--space-cardPad/);
		expect(css).toMatch(/\.card-title\.[^\s{]+\s*\{[^}]*color:\s*var\(--colors-ink/);
	});

	it('reads the accent token through the link style prop', () => {
		const view = render(App);
		const cta = view.container.querySelector<HTMLAnchorElement>('#app .card-cta')!;
		expect(cta.getAttribute('href')).toBe('#upgrade');
		expect(cta.getAttribute('style') ?? '').toContain('var(--colors-accent');
	});
});

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@octanejs/testing-library';
import { App } from '@octane-eval-submission/tsrx.nested-scope-styles/src/App.tsrx';

afterEach(cleanup);

function injectedSheets(): HTMLStyleElement[] {
	return Array.from(document.head.querySelectorAll<HTMLStyleElement>('style[data-octane]'));
}

function scopeHashes(): string[] {
	return injectedSheets().map((sheet) => sheet.getAttribute('data-octane')!);
}

function scopeClasses(element: Element, hashes: string[]): string[] {
	return Array.from(element.classList).filter((name) => hashes.includes(name));
}

describe('tsrx.nested-scope-styles', () => {
	it('injects one sheet per scope in lexical order before anything renders', () => {
		const sheets = injectedSheets();
		expect(sheets).toHaveLength(3);
		const [panel, summary, details] = scopeHashes();
		expect(new Set([panel, summary, details]).size).toBe(3);

		const css = sheets.map((sheet) => sheet.textContent ?? '');
		expect(css[0]).toContain(`.panel.${panel}`);
		expect(css[0]).toContain(`.title.${panel}`);
		expect(css[0]).not.toContain('.summary');
		expect(css[0]).not.toContain('.details');
		expect(css[1]).toContain(`.summary.${summary}`);
		expect(css[1]).not.toContain('.panel');
		expect(css[1]).not.toContain('.details');
		expect(css[2]).toContain(`.details.${details}`);
		expect(css[2]).not.toContain('.panel');
		expect(css[2]).not.toContain('.summary');
	});

	it('stamps every element with the classes of its enclosing scopes', () => {
		const hashes = scopeHashes();
		const [panel, summary, details] = hashes;
		const view = render(App);
		const section = view.container.querySelector('#panel')!;
		const title = view.container.querySelector('#title')!;
		const summaryText = view.container.querySelector('#summary')!;
		const toggle = view.container.querySelector<HTMLButtonElement>('#toggle')!;

		expect(section.classList.contains('panel')).toBe(true);
		expect(scopeClasses(section, hashes)).toEqual([panel]);
		expect(title.classList.contains('title')).toBe(true);
		expect(scopeClasses(title, hashes)).toEqual([panel]);
		expect(summaryText.classList.contains('summary')).toBe(true);
		expect(summaryText.classList.contains('title')).toBe(true);
		expect(scopeClasses(summaryText, hashes)).toEqual([panel, summary]);
		expect(view.container.querySelector('#details')).toBeNull();

		fireEvent.click(toggle);
		const detailsText = view.container.querySelector('#details')!;
		expect(detailsText.classList.contains('details')).toBe(true);
		expect(scopeClasses(detailsText, hashes)).toEqual([panel, details]);
		expect(scopeHashes()).toEqual(hashes);

		fireEvent.click(toggle);
		expect(view.container.querySelector('#details')).toBeNull();
		expect(scopeClasses(summaryText, hashes)).toEqual([panel, summary]);
	});
});

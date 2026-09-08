import { describe, expect, it } from 'vitest';
import { mount } from '../_helpers';
import { theme } from '../_fixtures/style-order-theme.tsrx';
import { Applier, SecondApplier } from '../_fixtures/style-order-applier.tsrx';

// RFC tsrx-org/RFCs#1, plan S3.1 — client injection order. Every style scope
// compiles to one module-level `injectStyle(hash, css)`; a theme is the theme
// module's own injection, so an importer's scopes land after it by ESM
// evaluation order, and the runtime dedupes by id so sharing a theme never
// duplicates its `<style data-octane>` tag.

function injectedIds(): string[] {
	return Array.from(document.head.querySelectorAll('style[data-octane]')).map((sheet) =>
		sheet.getAttribute('data-octane')!,
	);
}

function sheetText(id: string): string {
	const sheet = document.head.querySelector(`style[data-octane="${id}"]`);
	if (sheet === null) throw new Error(`no injected sheet for ${id}`);
	return sheet.textContent ?? '';
}

function scopeHashes(el: Element): string[] {
	return Array.from(el.classList).filter((cls) => cls.startsWith('tsrx-') && cls !== theme.$class);
}

describe('scoped <style> injection order (S3.1)', () => {
	it('injects the imported theme before the applier scopes, outer scope before nested', () => {
		expect(theme.$class).toMatch(/^tsrx-/);
		const r = mount(Applier);
		const outer = r.find('.outer');
		const inner = r.find('.inner');
		const dark = r.find('.outer > span');

		// Elements carry enclosing scope hashes outer → inner, then the theme.
		const [outerHash, ...outerRest] = scopeHashes(outer);
		expect(outerRest).toEqual([]);
		expect(outer.classList.contains(theme.$class)).toBe(true);
		const innerHashes = scopeHashes(inner);
		expect(innerHashes).toHaveLength(2);
		expect(innerHashes[0]).toBe(outerHash);
		const innerHash = innerHashes[1];
		expect(inner.classList.contains(theme.$class)).toBe(true);
		// `theme.dark` is the theme class map entry: `<$class> dark`.
		expect(dark.classList.contains('dark')).toBe(true);
		expect(dark.classList.contains(theme.$class)).toBe(true);

		// DOM order in <head>: theme first, then the applier's scopes pre-order.
		const ids = injectedIds();
		const themeAt = ids.indexOf(theme.$class);
		const outerAt = ids.indexOf(outerHash);
		const innerAt = ids.indexOf(innerHash);
		expect(themeAt).toBeGreaterThanOrEqual(0);
		expect(outerAt).toBeGreaterThan(themeAt);
		expect(innerAt).toBeGreaterThan(outerAt);

		// Each sheet holds its own rules, hashed to its own scope.
		expect(sheetText(theme.$class)).toContain('white');
		expect(sheetText(theme.$class)).toContain('black');
		expect(sheetText(outerHash)).toContain('purple');
		expect(sheetText(outerHash)).not.toContain('bold');
		expect(sheetText(innerHash)).toContain('bold');
		expect(sheetText(innerHash)).not.toContain('purple');
		r.unmount();
	});

	it('injects a theme shared by two components exactly once', () => {
		const first = mount(Applier);
		const second = mount(SecondApplier);
		expect(second.find('.second').classList.contains(theme.$class)).toBe(true);
		expect(second.find('.second > span').classList.contains('dark')).toBe(true);

		const ids = injectedIds();
		expect(ids.filter((id) => id === theme.$class)).toHaveLength(1);
		// No hash is ever injected twice, whatever shares it.
		expect(new Set(ids).size).toBe(ids.length);
		first.unmount();
		second.unmount();
	});
});

// Search-quality smoke tests: the contract is "an agent asking a reasonable
// question lands on the right doc", asserted on result slugs (not scores,
// which are a ranking implementation detail).
import { describe, expect, it } from 'vitest';
import { SEARCH_INDEX, search } from '../src/content/search.ts';

function slugsFor(query: string): string[] {
	return search(query).map((group) => group.slug);
}

describe('docs search over the snapshot', () => {
	it('indexes every doc, including sectioned repo markdown', () => {
		const slugs = new Set(SEARCH_INDEX.map((record) => record.slug));
		expect(slugs.has('quick-start')).toBe(true);
		expect(slugs.has('ssr')).toBe(true);
		expect(slugs.has('differences-from-react-reference')).toBe(true);
		// The markdown sectionizer produced real anchored sections, not one blob.
		const ssrIds = SEARCH_INDEX.filter((r) => r.slug === 'ssr').map((r) => r.id);
		expect(ssrIds.filter((id) => id !== '').length).toBeGreaterThanOrEqual(5);
	});

	it('finds installation guidance', () => {
		expect(slugsFor('Node.js 22')).toContain('quick-start');
	});

	it('finds the current-state getter divergence', () => {
		expect(slugsFor('useState getState')).toContain('differences-from-react-reference');
	});

	it('finds keyed list syntax', () => {
		expect(slugsFor('@for keyed')).toContain('tsrx-vs-tsx');
	});

	it('finds streaming SSR in the repo deep dive', () => {
		expect(slugsFor('renderToPipeableStream')).toContain('ssr');
	});

	it('finds bindings via package-name search terms', () => {
		expect(slugsFor('zustand')).toContain('bindings');
	});
});

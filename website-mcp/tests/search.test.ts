// Search-quality smoke tests: the contract is "an agent asking a reasonable
// question lands on the right doc", asserted on result slugs (not scores,
// which are a ranking implementation detail).
import { describe, expect, it } from 'vitest';
import { SEARCH_INDEX, search } from '../src/content/search.ts';

function slugsFor(query: string): string[] {
	return search(query).map((group) => group.slug);
}

describe('docs search over the snapshot', () => {
	it('indexes every website doc and its registered sections', () => {
		const slugs = new Set(SEARCH_INDEX.map((record) => record.slug));
		expect(slugs.has('quick-start')).toBe(true);
		expect(slugs.has('core-apis')).toBe(true);
		expect(slugs.has('differences-from-react')).toBe(true);
		const differenceIds = SEARCH_INDEX.filter((r) => r.slug === 'differences-from-react').map(
			(r) => r.id,
		);
		expect(differenceIds.filter((id) => id !== '').length).toBeGreaterThanOrEqual(6);
	});

	it('finds installation guidance', () => {
		expect(slugsFor('Node.js 22')).toContain('quick-start');
	});

	it('finds the current-state getter divergence', () => {
		expect(slugsFor('useState getDraft')).toContain('differences-from-react');
	});

	it('finds keyed list syntax', () => {
		expect(slugsFor('@for keyed')).toContain('tsrx-vs-tsx');
	});

	it('finds streaming SSR in the core API guide', () => {
		expect(slugsFor('renderToPipeableStream')).toContain('core-apis');
	});

	it('finds bindings via package-name search terms', () => {
		expect(slugsFor('zustand')).toContain('bindings');
	});

	it('finds section-specific aliases at their exact documentation anchor', () => {
		const [top] = search('vscode');
		expect(top.slug).toBe('quick-start');
		expect(top.id).toBe('tsrx-at-a-glance');
	});
});

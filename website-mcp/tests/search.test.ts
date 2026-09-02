// Search-quality smoke tests: an agent asking a reasonable question lands on
// the right document or canonical package destination. Scores remain a ranking
// implementation detail.
import { describe, expect, it } from 'vitest';
import { SEARCH_INDEX, search } from '../src/content/search.ts';

function slugsFor(query: string): string[] {
	return search(query)
		.filter((result) => result.kind === 'doc')
		.map((result) => result.slug);
}

describe('docs search over the snapshot', () => {
	it('indexes every doc, including sectioned repo markdown', () => {
		const documentRecords = SEARCH_INDEX.filter((record) => record.kind === 'doc');
		const slugs = new Set(documentRecords.map((record) => record.slug));
		expect(slugs.has('quick-start')).toBe(true);
		expect(slugs.has('ssr')).toBe(true);
		expect(slugs.has('differences-from-react-reference')).toBe(true);
		// The markdown sectionizer produced real anchored sections, not one blob.
		const ssrIds = documentRecords
			.filter((record) => record.slug === 'ssr')
			.map((record) => record.id);
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

	it('returns canonical community packages with their exact destinations', () => {
		const result = search('markstream-octane')[0];
		expect(result).toMatchObject({
			kind: 'package',
			title: 'Markstream',
			matchedName: 'markstream-octane',
			owner: 'Simon-He95',
			url: 'https://github.com/Simon-He95/markstream-vue/tree/main/packages/markstream-octane',
		});
	});

	it('converges current entry points and moved package names on one project', () => {
		const current = search('@tanstack/charts/octane')[0];
		const moved = search('@tanstack/octane-charts')[0];
		expect(current).toMatchObject({
			kind: 'package',
			title: 'TanStack Charts',
			matchedName: '@tanstack/charts/octane',
		});
		expect(moved).toMatchObject({
			kind: 'package',
			key: current?.key,
			title: 'TanStack Charts',
			matchedName: '@tanstack/octane-charts',
			url: 'https://github.com/TanStack/charts/tree/main/packages/octane',
		});
	});

	it('finds first-party packages through upstream aliases and public exports', () => {
		expect(search('@tanstack/react-query')[0]).toMatchObject({
			kind: 'package',
			title: '@octanejs/tanstack-query',
			matchedName: '@tanstack/react-query',
			owner: 'Octane',
		});
		expect(search('@octanejs/apollo-client/react/ssr')[0]).toMatchObject({
			kind: 'package',
			title: '@octanejs/apollo-client',
			matchedName: '@octanejs/apollo-client/react/ssr',
		});
	});

	it('resolves concrete wildcard imports without treating arbitrary suffixes as aliases', () => {
		const cases = [
			['@octanejs/lucide/icons/foo', '@octanejs/lucide', '@octanejs/lucide/icons/*'],
			['@octanejs/base-ui/foo', '@octanejs/base-ui', '@octanejs/base-ui/*'],
		] as const;

		for (const [query, title, matchedName] of cases) {
			const results = search(query).filter(
				(result) => result.kind === 'package' && result.title === title,
			);
			expect(results).toHaveLength(1);
			expect(results[0]).toMatchObject({ kind: 'package', title, matchedName });
		}
		expect(search('icons/foo').some((result) => result.title === '@octanejs/lucide')).toBe(false);
		expect(search('foo').some((result) => result.title === '@octanejs/base-ui')).toBe(false);
	});

	it('returns a successful empty result for an unmatched query', () => {
		expect(search('zz-no-octane-result-9f4c')).toEqual([]);
	});

	it('finds section-specific aliases at their exact documentation anchor', () => {
		const [top] = search('vscode');
		expect(top.kind).toBe('doc');
		if (top.kind !== 'doc') throw new Error('expected a documentation result');
		expect(top.slug).toBe('quick-start');
		expect(top.id).toBe('tsrx-at-a-glance');
	});
});

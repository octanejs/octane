import { describe, expect, it } from 'vitest';
import ecosystemIndex from '../src/content/ecosystem-index.json';
import {
	filterEcosystemEntities,
	searchEcosystem,
	type EcosystemEntity,
} from '../src/lib/ecosystem-search-core.ts';
import { loadSearchIndex } from '../src/lib/docs-search.ts';
import { searchSite } from '../src/lib/site-search.ts';

const entities = ecosystemIndex as EcosystemEntity[];

function packagesFor(query: string) {
	return searchEcosystem(entities, query).map((result) => result.entity.packageName);
}

describe('ecosystem entity search', () => {
	it('keeps TanStack Router distinct from TanStack Start', () => {
		for (const query of [
			'tanstack router',
			'@tanstack/react-router',
			'@octanejs/tanstack-router',
			'tanstack ruter',
		]) {
			const [top] = searchEcosystem(entities, query);
			expect(top.entity.packageName, query).toBe('@octanejs/tanstack-router');
			expect(top.matchBand, query).toBe('strong');
		}

		expect(packagesFor('tanstack router')[0]).not.toBe('@octanejs/tanstack-start');
	});

	it('types framework integrations and retains guide metadata', () => {
		const [start] = searchEcosystem(entities, 'tanstack start');
		const [astro] = searchEcosystem(entities, 'astro');

		expect(start.entity).toMatchObject({
			kind: 'framework-integration',
			packageName: '@octanejs/tanstack-start',
			guideAnchor: 'tanstack-start',
		});
		expect(astro.entity).toMatchObject({
			kind: 'framework-integration',
			packageName: '@octanejs/astro',
			guideAnchor: 'astro',
		});
	});

	it('matches package identity strongly and task metadata weakly', () => {
		const [hookForm] = searchEcosystem(entities, 'react hook form');
		const forms = searchEcosystem(entities, 'forms');

		expect(hookForm).toMatchObject({
			matchBand: 'strong',
			entity: { packageName: '@octanejs/hook-form' },
		});
		expect(forms.length).toBeGreaterThan(0);
		expect(forms.every((result) => result.matchBand === 'weak')).toBe(true);
		expect(
			forms.flatMap((result) =>
				result.entity.kind === 'library-binding' ? [result.entity.category] : [],
			),
		).toContain('Forms and content');
	});

	it('keeps broad mixed results stable and deduplicated', () => {
		const results = searchEcosystem(entities, 'tanstack');
		const packages = results.map((result) => result.entity.packageName);

		expect(new Set(packages).size).toBe(packages.length);
		expect(results.some((result) => result.entity.kind === 'framework-integration')).toBe(true);
		expect(results.some((result) => result.entity.kind === 'library-binding')).toBe(true);
		expect(packages).toEqual(packagesFor('tanstack'));
	});

	it('bounds fuzzy matching and ignores invalid filters', () => {
		expect(searchEcosystem(entities, '')).toEqual([]);
		expect(searchEcosystem(entities, 'a')).toEqual([]);
		expect(searchEcosystem(entities, 'ats')).toEqual([]);
		expect(searchEcosystem(entities, 'zzzznotathing')).toEqual([]);

		expect(
			filterEcosystemEntities(entities, { kind: 'not-a-kind', category: 'not-a-category' }),
		).toEqual(entities);
		expect(filterEcosystemEntities(entities, { kind: 'integration' })).toHaveLength(3);
		expect(
			filterEcosystemEntities(entities, { category: 'forms-and-content' }).every(
				(entity) => entity.kind === 'library-binding' && entity.categoryId === 'forms-and-content',
			),
		).toBe(true);
	});
});

describe('site search composition', () => {
	it('puts strong entities above docs and weak entity metadata below docs', async () => {
		const docs = await loadSearchIndex();
		const router = searchSite({ docs, entities }, 'tanstack router');
		const serverRendering = searchSite({ docs, entities }, 'server rendering');

		expect(router[0]).toMatchObject({
			type: 'entity',
			match: { entity: { packageName: '@octanejs/tanstack-router' } },
		});
		expect(serverRendering[0]).toMatchObject({
			type: 'docs',
		});
		const firstWeak = serverRendering.findIndex(
			(result) => result.type === 'entity' && result.match.matchBand === 'weak',
		);
		const lastDoc = serverRendering.findLastIndex((result) => result.type === 'docs');
		expect(firstWeak === -1 || firstWeak > lastDoc).toBe(true);
	});
});

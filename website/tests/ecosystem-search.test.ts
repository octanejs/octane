import { describe, expect, it } from 'vitest';
import ecosystemIndex from '../src/content/ecosystem-index.json';
import {
	filterEcosystemEntities,
	searchEcosystem,
	type EcosystemEntity,
} from '../src/lib/ecosystem-search-core.ts';
import { recordsFor } from '../src/lib/docs-search-core.ts';
import { createSiteSearchIndexLoader, searchSite } from '../src/lib/site-search.ts';

const entities = ecosystemIndex as EcosystemEntity[];
const docRecords = [
	...recordsFor(
		'router-guide',
		'TanStack Router guide',
		0,
		'<h2 id="routing">Routing</h2>Configure TanStack Router for an Octane app.',
	),
	...recordsFor(
		'server-rendering',
		'Server rendering',
		1,
		'<h2 id="rendering">Server rendering</h2>Render an Octane application on the server.',
	),
];

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
		).toContain('Forms');
	});

	it('uses controlled tags for cross-category discovery', () => {
		const charts = searchEcosystem(entities, 'charts');
		const dragDrop = searchEcosystem(entities, 'drag drop');

		expect(charts.every((result) => result.matchBand === 'weak')).toBe(true);
		expect(charts.map((result) => result.entity.packageName)).toEqual(
			expect.arrayContaining(['@octanejs/recharts', '@octanejs/visx']),
		);
		expect(dragDrop.map((result) => result.entity.packageName)).toEqual(
			expect.arrayContaining(['@octanejs/dnd-kit', '@octanejs/draggable']),
		);
	});

	it('keeps broad mixed results stable and deduplicated', () => {
		const results = searchEcosystem(entities, 'tanstack');
		const packages = results.map((result) => result.entity.packageName);

		expect(new Set(packages).size).toBe(packages.length);
		expect(results.some((result) => result.entity.kind === 'framework-integration')).toBe(true);
		expect(results.some((result) => result.entity.kind === 'library-binding')).toBe(true);
	});

	it('uses catalog order to break equal-score ties', () => {
		const fixture: EcosystemEntity[] = [
			{
				kind: 'library-binding',
				id: 'binding-later',
				title: 'Later package',
				packageName: '@octanejs/later',
				upstreamPackage: 'later',
				category: 'State',
				categoryId: 'state',
				description: 'Use later with Octane.',
				searchTerms: ['cache'],
				tags: [],
				order: 2,
			},
			{
				kind: 'library-binding',
				id: 'binding-earlier',
				title: 'Earlier package',
				packageName: '@octanejs/earlier',
				upstreamPackage: 'earlier',
				category: 'State',
				categoryId: 'state',
				description: 'Use earlier with Octane.',
				searchTerms: ['cache'],
				tags: [],
				order: 1,
			},
		];

		expect(searchEcosystem(fixture, 'cache').map((result) => result.entity.packageName)).toEqual([
			'@octanejs/earlier',
			'@octanejs/later',
		]);
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
			filterEcosystemEntities(entities, { category: 'state-management' }).every(
				(entity) => entity.kind === 'library-binding' && entity.categoryId === 'state-management',
			),
		).toBe(true);
	});
});

describe('site search composition', () => {
	it('puts strong entities above docs and weak entity metadata below docs', () => {
		const router = searchSite({ docs: docRecords, entities }, 'tanstack router');
		const serverRendering = searchSite({ docs: docRecords, entities }, 'server rendering');

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
	}, 30_000);

	it('keeps docs available when the ecosystem chunk fails', async () => {
		let entityAttempts = 0;
		const load = createSiteSearchIndexLoader({
			docs: async () => docRecords,
			entities: async () => {
				if (entityAttempts++ === 0) throw new Error('ecosystem chunk unavailable');
				return entities;
			},
		});

		const degraded = await load();
		expect(degraded.entities).toEqual([]);
		expect(searchSite(degraded, 'server rendering')[0]).toMatchObject({ type: 'docs' });
		await expect(load()).resolves.toMatchObject({ entities });
		expect(entityAttempts).toBe(2);
	});

	it('retries after the docs index fails to load', async () => {
		let attempts = 0;
		const load = createSiteSearchIndexLoader({
			docs: async () => {
				if (attempts++ === 0) throw new Error('docs chunk unavailable');
				return [];
			},
			entities: async () => [],
		});

		await expect(load()).rejects.toThrow('docs chunk unavailable');
		await expect(load()).resolves.toEqual({ docs: [], entities: [] });
		expect(attempts).toBe(2);
	});
});

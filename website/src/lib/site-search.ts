import type { SearchGroup, SearchRecord } from './docs-search-core.ts';
import { searchDocs } from './docs-search-core.ts';
import {
	searchEcosystem,
	type EcosystemEntity,
	type EcosystemSearchResult,
} from './ecosystem-search-core.ts';

export interface SiteSearchIndex {
	docs: readonly SearchRecord[];
	entities: readonly EcosystemEntity[];
}

export type SiteSearchResult =
	{ type: 'entity'; match: EcosystemSearchResult } | { type: 'docs'; group: SearchGroup };

export interface SiteSearchOptions {
	entityLimit?: number;
	docsLimit?: number;
	limit?: number;
}

export function searchSite(
	index: SiteSearchIndex,
	query: string,
	options: SiteSearchOptions = {},
): SiteSearchResult[] {
	const entityMatches = searchEcosystem(index.entities, query, {
		limit: options.entityLimit ?? 8,
	});
	const docs = searchDocs(index.docs, query, options.docsLimit ?? 6);
	const strong = entityMatches
		.filter((match) => match.matchBand === 'strong')
		.map((match) => ({ type: 'entity' as const, match }));
	const weak = entityMatches
		.filter((match) => match.matchBand === 'weak')
		.map((match) => ({ type: 'entity' as const, match }));
	return [...strong, ...docs.map((group) => ({ type: 'docs' as const, group })), ...weak].slice(
		0,
		options.limit ?? 12,
	);
}

interface SiteSearchIndexLoaders {
	docs: () => Promise<readonly SearchRecord[]>;
	entities: () => Promise<readonly EcosystemEntity[]>;
}

export function createSiteSearchIndexLoader(loaders: SiteSearchIndexLoaders) {
	let indexPromise: Promise<SiteSearchIndex> | undefined;
	return () => {
		if (!indexPromise) {
			let entityLoadFailed = false;
			const pending = Promise.all([
				loaders.docs(),
				loaders.entities().catch(() => {
					entityLoadFailed = true;
					return [] as readonly EcosystemEntity[];
				}),
			]).then(([docs, entities]) => ({ docs, entities }));
			indexPromise = pending.then(
				(index) => {
					if (entityLoadFailed) indexPromise = undefined;
					return index;
				},
				(error) => {
					indexPromise = undefined;
					throw error;
				},
			);
		}
		return indexPromise;
	};
}

export const loadSiteSearchIndex = createSiteSearchIndexLoader({
	docs: () => import('./docs-search.ts').then(({ loadSearchIndex }) => loadSearchIndex()),
	entities: () =>
		import('../content/ecosystem-index.json').then(
			({ default: entities }) => entities as EcosystemEntity[],
		),
});

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

let indexPromise: Promise<SiteSearchIndex> | undefined;

export function loadSiteSearchIndex(): Promise<SiteSearchIndex> {
	if (!indexPromise) {
		indexPromise = Promise.all([
			import('./docs-search.ts').then(({ loadSearchIndex }) => loadSearchIndex()),
			import('../content/ecosystem-index.json').then(
				({ default: entities }) => entities as EcosystemEntity[],
			),
		]).then(([docs, entities]) => ({ docs, entities }));
	}
	return indexPromise;
}

import type {
	DocumentSearchResult,
	PackageSearchRecord,
	PackageSearchResult,
	SearchRecord,
} from './docs-search-core.ts';
import { searchDocs } from './docs-search-core.ts';
import {
	searchEcosystem,
	type EcosystemEntity,
	type EcosystemSearchResult,
} from './ecosystem-search-core.ts';

export interface SiteSearchIndex {
	docs: readonly SearchRecord[];
	entities: readonly EcosystemEntity[];
	packages: readonly PackageSearchRecord[];
}

export type SiteSearchResult =
	| { type: 'entity'; match: EcosystemSearchResult }
	| { type: 'package'; result: PackageSearchResult }
	| { type: 'docs'; group: DocumentSearchResult };

export interface SiteSearchOptions {
	entityLimit?: number;
	docsLimit?: number;
	packageLimit?: number;
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
	const docs = searchDocs(index.docs, query, options.docsLimit ?? 6).filter(
		(result): result is DocumentSearchResult => result.kind === 'doc',
	);
	const matchedOfficialPackages = new Set(entityMatches.map((match) => match.entity.packageName));
	const packages = searchDocs(index.packages, query, options.packageLimit ?? 8)
		.filter((result): result is PackageSearchResult => result.kind === 'package')
		.filter(
			(result) =>
				!result.title.startsWith('@octanejs/') || !matchedOfficialPackages.has(result.title),
		);
	const strong = entityMatches
		.filter((match) => match.matchBand === 'strong')
		.map((match) => ({ type: 'entity' as const, match }));
	const weak = entityMatches
		.filter((match) => match.matchBand === 'weak')
		.map((match) => ({ type: 'entity' as const, match }));
	const content = [
		...packages.map((result) => ({ type: 'package' as const, result })),
		...docs.map((group) => ({ type: 'docs' as const, group })),
	].sort((a, b) => {
		const aScore = a.type === 'package' ? a.result.score : a.group.score;
		const bScore = b.type === 'package' ? b.result.score : b.group.score;
		return bScore - aScore;
	});
	return [...strong, ...content, ...weak].slice(0, options.limit ?? 12);
}

interface SiteSearchIndexLoaders {
	docs: () => Promise<readonly SearchRecord[]>;
	entities: () => Promise<readonly EcosystemEntity[]>;
	packages?: () => Promise<readonly PackageSearchRecord[]>;
}

export function createSiteSearchIndexLoader(loaders: SiteSearchIndexLoaders) {
	let indexPromise: Promise<SiteSearchIndex> | undefined;
	return () => {
		if (!indexPromise) {
			let supplementalLoadFailed = false;
			const pending = Promise.all([
				loaders.docs(),
				loaders.entities().catch(() => {
					supplementalLoadFailed = true;
					return [] as readonly EcosystemEntity[];
				}),
				(loaders.packages?.() ?? Promise.resolve([])).catch(() => {
					supplementalLoadFailed = true;
					return [] as readonly PackageSearchRecord[];
				}),
			]).then(([docs, entities, packages]) => ({ docs, entities, packages }));
			indexPromise = pending.then(
				(index) => {
					if (supplementalLoadFailed) indexPromise = undefined;
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
	packages: () =>
		import('../content/bindings-search.ts').then(({ loadPackageSearchRecords }) =>
			loadPackageSearchRecords(),
		),
});

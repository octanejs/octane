// The search index over the docs corpus — the SAME sectionizer and ranking the
// website's ⌘K dialog uses (docs-search-core.ts), built eagerly at module scope
// from the build-time snapshot instead of lazily in the browser.
import {
	addSearchTerms,
	liftMarkdownHeadings,
	recordsFor,
	searchDocs,
	type SearchGroup,
	type SearchRecord,
} from '../../../website/src/lib/docs-search-core.ts';
import {
	communityPackageRecords,
	firstPartyPackageRecord,
	publicExportSubpaths,
} from '../../../website/src/content/bindings-search.ts';
import { BINDING_CATEGORIES, BINDING_STATUSES } from './bindings.ts';
import { DOCS } from './docs.ts';

export type { SearchGroup, SearchRecord };

const DOCUMENT_SEARCH_INDEX: readonly SearchRecord[] = DOCS.flatMap((doc, order) => {
	// The sectionizer keys on `<h2 id="…">` anchors: hand-authored in MDX, lifted
	// from `## ` headings in plain Markdown (repo deep dives, best-practices.md).
	const records = recordsFor(doc.slug, doc.title, order, liftMarkdownHeadings(doc.markdown));
	// Extra ranking hints attach to the doc's first section — mirrors the
	// website's loadSearchIndex.
	addSearchTerms(
		records.find((record) => record.id === doc.sections[0]?.id) ?? records[0],
		doc.searchTerms,
	);
	for (const section of doc.sections) {
		if (!section.searchTerms?.length) continue;
		const target = records.find((record) => record.id === section.id);
		if (!target) {
			throw new Error(
				`Search terms for ${doc.slug}#${section.id} must target an indexed h2 section`,
			);
		}
		addSearchTerms(target, section.searchTerms);
	}
	return records;
});

interface PackageMetadata {
	description?: string;
	exports?: unknown;
}

const packageMetadataModules = import.meta.glob('../../../packages/*/package.json', {
	eager: true,
	import: 'default',
}) as Record<string, PackageMetadata>;

const packageMetadataByDirectory = new Map(
	Object.entries(packageMetadataModules).map(([path, metadata]) => [
		path.split('/').at(-2)!,
		metadata,
	]),
);
const statusByPackage = new Map(BINDING_STATUSES.map((status) => [status.package, status]));

const FIRST_PARTY_PACKAGE_INDEX: readonly SearchRecord[] = BINDING_CATEGORIES.flatMap(
	(category) => category.packages,
).map((packageName) => {
	const directory = packageName.slice('@octanejs/'.length);
	const metadata = packageMetadataByDirectory.get(directory);
	const status = statusByPackage.get(packageName);
	return firstPartyPackageRecord({
		packageName,
		purpose: metadata?.description ?? '',
		upstreamPackage: status?.upstream?.package,
		exportSubpaths: publicExportSubpaths(metadata?.exports),
	});
});

export const SEARCH_INDEX: readonly SearchRecord[] = [
	...DOCUMENT_SEARCH_INDEX,
	...FIRST_PARTY_PACKAGE_INDEX,
	...communityPackageRecords(),
];

export function search(query: string, limit = 6): SearchGroup[] {
	return searchDocs(SEARCH_INDEX, query, limit);
}

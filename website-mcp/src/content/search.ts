// The search index over the docs corpus — the SAME sectionizer and ranking the
// website's ⌘K dialog uses (docs-search-core.ts), built eagerly at module scope
// from the build-time snapshot instead of lazily in the browser.
import {
	addSearchTerms,
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

/**
 * The core sectionizer keys on the `<h2 id="…">` anchors the website MDX
 * authors by hand. Repo docs are plain markdown, so their `## ` headings are
 * pre-lifted into the same shape (fenced code blocks left alone).
 */
function liftMarkdownHeadings(markdown: string, sections: readonly { id: string }[]): string {
	let at = 0;
	let inFence = false;
	return markdown
		.split('\n')
		.map((line) => {
			if (line.trimStart().startsWith('```')) inFence = !inFence;
			else if (!inFence && line.startsWith('## ') && at < sections.length) {
				const title = line.slice(3).replace(/`/g, '').trim();
				return `<h2 id="${sections[at++].id}">${title}</h2>`;
			}
			return line;
		})
		.join('\n');
}

const DOCUMENT_SEARCH_INDEX: readonly SearchRecord[] = DOCS.flatMap((doc, order) => {
	const source =
		doc.source === 'repo' ? liftMarkdownHeadings(doc.markdown, doc.sections) : doc.markdown;
	const records = recordsFor(doc.slug, doc.title, order, source);
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

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
import { DOCS } from './docs.ts';

export type { SearchGroup, SearchRecord };

export const SEARCH_INDEX: readonly SearchRecord[] = DOCS.flatMap((doc, order) => {
	const records = recordsFor(doc.slug, doc.title, order, doc.markdown);
	// Extra ranking hints (the bindings catalog names every package) attach to
	// the doc's first section — mirrors the website's loadSearchIndex.
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

export function search(query: string, limit = 6): SearchGroup[] {
	return searchDocs(SEARCH_INDEX, query, limit);
}

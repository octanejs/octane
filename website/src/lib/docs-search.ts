// Client-side docs search. The index is built from the RAW .mdx sources (the
// compiled documents are components, so their prose is not readable at runtime)
// and is code-split behind a dynamic import: nothing here loads until the user
// actually opens the search dialog.
//
// The sectionizer and ranking live in docs-search-core.ts (pure, shared with
// the remote MCP server); this module owns the lazy index build over the raw
// MDX glob and re-exports the core surface for the dialog and tests.
import {
	addSearchTerms,
	docSlugOf,
	docSource,
	recordsFor,
	type DocumentSearchRecord,
} from './docs-search-core.ts';

export * from './docs-search-core.ts';

const rawDocs = import.meta.glob('../content/docs/*.{md,mdx}', {
	query: '?raw',
	import: 'default',
}) as Record<string, () => Promise<string>>;

let indexPromise: Promise<DocumentSearchRecord[]> | null = null;

/** Build (once) and return the flat section index. Safe to call repeatedly. */
export function loadSearchIndex(): Promise<DocumentSearchRecord[]> {
	if (!indexPromise) {
		indexPromise = import('../content/docs.ts').then(({ docs }) =>
			Promise.all(
				Object.entries(rawDocs).map(async ([path, load]) => {
					const slug = docSlugOf(path);
					const order = docs.findIndex((doc) => doc.slug === slug);
					const doc = order === -1 ? undefined : docs[order];
					const rank = order === -1 ? docs.length : order;
					const source = docSource(path, await load());
					const records = recordsFor(slug, doc?.title ?? slug, rank, source);
					if (doc) {
						addSearchTerms(
							records.find((record) => record.id === doc.sections?.[0]?.id) ?? records[0],
							doc.searchTerms,
						);
						for (const section of doc.sections ?? []) {
							if (!section.searchTerms?.length) continue;
							const target = records.find((record) => record.id === section.id);
							if (!target) {
								throw new Error(
									`Search terms for ${doc.slug}#${section.id} must target an indexed h2 section`,
								);
							}
							addSearchTerms(target, section.searchTerms);
						}
					}
					return records;
				}),
			).then((groups) => groups.flat()),
		);
		indexPromise = indexPromise.catch((error) => {
			indexPromise = null;
			throw error;
		});
	}
	return indexPromise;
}

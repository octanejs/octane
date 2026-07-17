// Client-side docs search. The index is built from the RAW .mdx sources (the
// compiled documents are components, so their prose is not readable at runtime)
// and is code-split behind a dynamic import: nothing here loads until the user
// actually opens the search dialog.
//
// The sectionizer and ranking live in docs-search-core.ts (pure, shared with
// the remote MCP server); this module owns the lazy index build over the raw
// MDX glob and re-exports the core surface for the dialog and tests.
import { recordsFor, type SearchRecord } from './docs-search-core.ts';

export * from './docs-search-core.ts';

const rawDocs = import.meta.glob('../content/docs/*.mdx', {
	query: '?raw',
	import: 'default',
}) as Record<string, () => Promise<string>>;

/** `../content/docs/quick-start.mdx` → `quick-start`. */
function slugOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.mdx$/, '');
}

let indexPromise: Promise<SearchRecord[]> | null = null;

/** Build (once) and return the flat section index. Safe to call repeatedly. */
export function loadSearchIndex(): Promise<SearchRecord[]> {
	if (!indexPromise) {
		indexPromise = import('../content/docs.ts').then(({ docs }) =>
			Promise.all(
				Object.entries(rawDocs).map(async ([path, load]) => {
					const slug = slugOf(path);
					const order = docs.findIndex((d) => d.slug === slug);
					const doc = order === -1 ? undefined : docs[order];
					const rank = order === -1 ? docs.length : order;
					const records = recordsFor(slug, doc?.title ?? slug, rank, await load());
					if (doc?.searchTerms?.length) {
						const target =
							records.find((record) => record.id === doc.sections?.[0]?.id) ?? records[0];
						if (target) {
							const block = { text: doc.searchTerms.join(' · '), code: false };
							target.blocks.push(block);
							target.text += ' ' + block.text;
							target.haystack += ' ' + block.text.toLowerCase();
						}
					}
					return records;
				}),
			).then((groups) => groups.flat()),
		);
	}
	return indexPromise;
}

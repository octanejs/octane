// The search index over the docs corpus — the SAME sectionizer and ranking the
// website's ⌘K dialog uses (docs-search-core.ts), built eagerly at module scope
// from the build-time snapshot instead of lazily in the browser.
import {
	recordsFor,
	searchDocs,
	type SearchGroup,
	type SearchRecord,
} from '../../../website/src/lib/docs-search-core.ts';
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

export const SEARCH_INDEX: readonly SearchRecord[] = DOCS.flatMap((doc, order) => {
	const source =
		doc.source === 'repo' ? liftMarkdownHeadings(doc.markdown, doc.sections) : doc.markdown;
	const records = recordsFor(doc.slug, doc.title, order, source);
	// Extra ranking hints (the bindings catalog names every package) attach to
	// the doc's first section — mirrors the website's loadSearchIndex.
	if (doc.searchTerms?.length) {
		const target = records.find((record) => record.id === doc.sections[0]?.id) ?? records[0];
		if (target) {
			const block = { text: doc.searchTerms.join(' · '), code: false };
			target.blocks.push(block);
			target.text += ' ' + block.text;
			target.haystack += ' ' + block.text.toLowerCase();
		}
	}
	return records;
});

export function search(query: string, limit = 6): SearchGroup[] {
	return searchDocs(SEARCH_INDEX, query, limit);
}

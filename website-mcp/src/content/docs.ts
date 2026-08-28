// The docs corpus, snapshotted at BUILD time: raw sources are inlined into the
// server bundle via Vite built-ins (?raw / import.meta.glob), so the deployed
// function serves docs with zero filesystem access and the content always
// matches the commit it was built from.
//
// This module is reached from octane.config.ts only through dynamic imports in
// route handlers, and it must stay on built-in Vite features (?raw, glob,
// JSON) — never import compiled .mdx/.tsrx from here.
import { docsMeta } from '../../../website/src/content/docs-meta.ts';

export interface McpDocSection {
	id: string;
	title: string;
	searchTerms?: readonly string[];
}

export interface McpDoc {
	slug: string;
	title: string;
	description: string;
	group: string;
	source: 'website';
	/** Canonical human-readable home of this document. */
	url: string;
	sections: readonly McpDocSection[];
	/** Extra ranking hints for search (mirrors the website registry). */
	searchTerms?: readonly string[];
	markdown: string;
}

const rawWebsiteDocs = import.meta.glob('../../../website/src/content/docs/*.mdx', {
	query: '?raw',
	import: 'default',
	eager: true,
}) as Record<string, string>;

/** `…/docs/quick-start.mdx` → `quick-start`. */
function slugOf(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.(mdx|md)$/, '');
}

function stripFrontmatter(source: string): string {
	return source.replace(/^---[\s\S]*?---\n*/, '');
}

const websiteDocs: McpDoc[] = docsMeta.map((meta) => {
	const entry = Object.entries(rawWebsiteDocs).find(([path]) => slugOf(path) === meta.slug);
	if (!entry) {
		throw new Error(`docs-meta.ts entry '${meta.slug}' has no raw .mdx source in the snapshot`);
	}
	return {
		slug: meta.slug,
		title: meta.title,
		description: meta.description,
		group: meta.group,
		source: 'website',
		url: `https://octanejs.dev/docs/${meta.slug}`,
		sections: meta.sections ?? [],
		searchTerms: meta.searchTerms,
		markdown: stripFrontmatter(entry[1]),
	};
});

// Every raw MDX doc must be registered, and vice versa — a doc added to the
// website without a docs-meta.ts entry fails the mcp build here instead of
// silently missing from the remote index.
{
	const unregistered = Object.keys(rawWebsiteDocs)
		.map(slugOf)
		.filter((slug) => !docsMeta.some((meta) => meta.slug === slug));
	if (unregistered.length > 0) {
		throw new Error(`website docs missing from docs-meta.ts: ${unregistered.join(', ')}`);
	}
}

export const DOCS: readonly McpDoc[] = websiteDocs;

export const DOC_SLUGS = DOCS.map((doc) => doc.slug) as [string, ...string[]];

export function docBySlug(slug: string): McpDoc | undefined {
	return DOCS.find((doc) => doc.slug === slug);
}

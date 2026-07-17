// The docs corpus, snapshotted at BUILD time: raw sources are inlined into the
// server bundle via Vite built-ins (?raw / import.meta.glob), so the deployed
// function serves docs with zero filesystem access and the content always
// matches the commit it was built from.
//
// This module is reached from octane.config.ts only through dynamic imports in
// route handlers, and it must stay on built-in Vite features (?raw, glob,
// JSON) — never import compiled .mdx/.tsrx from here.
import { docsMeta } from '../../../website/src/content/docs-meta.ts';
import ssrMd from '../../../docs/ssr.md?raw';
import reactDifferencesMd from '../../../docs/differences-from-react.md?raw';

export interface McpDocSection {
	id: string;
	title: string;
}

export interface McpDoc {
	slug: string;
	title: string;
	description: string;
	group: string;
	/** 'website' = octanejs.dev/docs page (MDX); 'repo' = docs/*.md deep dive. */
	source: 'website' | 'repo';
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

/** Approximate GitHub's heading slugger so repo-doc anchors deep link. */
function githubSlug(heading: string): string {
	return heading
		.toLowerCase()
		.replace(/`/g, '')
		.replace(/[^\w\- ]/g, '')
		.trim()
		.replace(/ /g, '-');
}

/** One section per `## ` markdown heading (fenced code blocks skipped). */
function markdownSections(markdown: string): McpDocSection[] {
	const sections: McpDocSection[] = [];
	let inFence = false;
	for (const line of markdown.split('\n')) {
		if (line.trimStart().startsWith('```')) inFence = !inFence;
		else if (!inFence && line.startsWith('## ')) {
			const title = line.slice(3).replace(/`/g, '').trim();
			sections.push({ id: githubSlug(line.slice(3)), title });
		}
	}
	return sections;
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

// Deep-dive documents that only exist in the repository. The divergence
// reference gets a '-reference' suffix so it never collides with the website's
// reader-friendly differences-from-react page.
const repoDocs: McpDoc[] = [
	{
		slug: 'ssr',
		title: 'Server-side rendering (deep dive)',
		description:
			'The complete SSR + hydration pipeline: renderToString, streaming, prerender, and how hydration adopts server DOM.',
		group: 'Explore',
		source: 'repo',
		url: 'https://github.com/octanejs/octane/blob/main/docs/ssr.md',
		sections: markdownSections(ssrMd),
		markdown: ssrMd,
	},
	{
		slug: 'differences-from-react-reference',
		title: 'Differences from React (full reference)',
		description:
			'The exhaustive divergence reference: every deliberate behavioral difference from React, with rationale.',
		group: 'Explore',
		source: 'repo',
		url: 'https://github.com/octanejs/octane/blob/main/docs/differences-from-react.md',
		sections: markdownSections(reactDifferencesMd),
		markdown: reactDifferencesMd,
	},
];

export const DOCS: readonly McpDoc[] = [...websiteDocs, ...repoDocs];

export const DOC_SLUGS = DOCS.map((doc) => doc.slug) as [string, ...string[]];

export function docBySlug(slug: string): McpDoc | undefined {
	return DOCS.find((doc) => doc.slug === slug);
}

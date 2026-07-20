import { getBranch, libraries } from '~/libraries';
import type { LibrarySlim } from '~/libraries/types';
import { getPublishedPosts } from '~/utils/blog';
import { getDocsManifest } from '~/utils/docs';
import { SITE_URL } from '~/utils/site';

export type SitemapEntry = {
	path: string;
	lastModified?: string;
};

const HIGH_VALUE_NON_DOC_PAGES = [
	'/',
	'/blog',
	'/libraries',
	'/learn',
	'/showcase',
	'/support',
	'/workshops',
	'/paid-support',
] as const satisfies ReadonlyArray<string>;

const LOW_VALUE_DOCS_SITEMAP_SEGMENTS = new Set(['examples', 'community']);

const LOW_VALUE_DOCS_SITEMAP_SLUGS = new Set(['community-resources', 'contributors', 'npm-stats']);

function trimTrailingSlash(url: string) {
	return url.replace(/\/$/, '');
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function asLastModified(value: string) {
	return new Date(`${value}T12:00:00.000Z`).toISOString();
}

function getLibraryEntries(): Array<SitemapEntry> {
	return libraries.flatMap((library) => {
		if (
			library.visible === false ||
			!library.latestVersion ||
			library.sitemap?.includeLandingPage !== true
		) {
			return [];
		}
		const basePath = `/${library.id}/latest`;
		return [{ path: basePath }];
	});
}

function isHighValueDocsSlug(slug: string) {
	const segments = slug.split('/').filter(Boolean);

	return (
		segments.length > 0 &&
		!segments.some((segment) => LOW_VALUE_DOCS_SITEMAP_SEGMENTS.has(segment)) &&
		!LOW_VALUE_DOCS_SITEMAP_SLUGS.has(slug)
	);
}

async function getLibraryDocsEntries(library: LibrarySlim): Promise<Array<SitemapEntry>> {
	if (
		library.visible === false ||
		!library.latestVersion ||
		library.sitemap?.includeDocsPages !== true
	) {
		return [];
	}

	const docsRoot = library.docsRoot || 'docs';
	const branch = getBranch(library, 'latest');
	const manifest = await getDocsManifest({
		repo: library.repo,
		branch,
		docsRoot,
	}).catch(() => ({ paths: [], redirects: {} }));

	return manifest.paths
		.filter(Boolean)
		.filter(isHighValueDocsSlug)
		.map((slug) => ({
			path: `/${library.id}/latest/docs/${slug}`,
		}));
}

function getBlogEntries(): Array<SitemapEntry> {
	return getPublishedPosts().map((post) => ({
		path: `/blog/${post.slug}`,
		lastModified: asLastModified(post.published),
	}));
}

export function getSiteOrigin() {
	return trimTrailingSlash(SITE_URL);
}

export async function getSitemapEntries(): Promise<Array<SitemapEntry>> {
	const docsEntries = await Promise.all(libraries.map((library) => getLibraryDocsEntries(library)));

	const entries = [
		...HIGH_VALUE_NON_DOC_PAGES.map((path) => ({ path })),
		...getLibraryEntries(),
		...docsEntries.flat(),
		...getBlogEntries(),
	].filter(
		(entry) => entry.path !== '/intent/registry' && !entry.path.startsWith('/intent/registry/'),
	);

	return Array.from(new Map(entries.map((entry) => [entry.path, entry])).values());
}

export async function generateSitemapXml(origin: string) {
	const urls = (await getSitemapEntries())
		.map((entry) => {
			const loc = `${origin}${entry.path}`;

			return [
				'  <url>',
				`    <loc>${escapeXml(loc)}</loc>`,
				entry.lastModified ? `    <lastmod>${entry.lastModified}</lastmod>` : '',
				'  </url>',
			]
				.filter(Boolean)
				.join('\n');
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function generateRobotsTxt(origin: string) {
	return ['User-agent: *', 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`].join('\n');
}

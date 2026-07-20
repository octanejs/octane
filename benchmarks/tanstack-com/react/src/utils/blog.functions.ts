import { createServerFn } from '@tanstack/react-start';
import { setResponseHeaders } from '@tanstack/react-start/server';
import { notFound, redirect } from '@tanstack/react-router';
import { allPosts } from 'content-collections';
import * as v from 'valibot';
import type { LibraryId } from '~/libraries';
import { getPostsForLibrary, getPublishedPosts } from '~/utils/blog';
import { formatAuthors, formatPublishedDate, isPublishedDateReleased } from '~/utils/blog-format';
import { buildRedirectManifest } from './redirects';

export type RecentPost = {
	slug: string;
	title: string;
	published: string;
	excerpt: string;
	headerImage: string | undefined;
	authors: Array<string>;
};

const blogRedirectManifest = buildRedirectManifest(
	allPosts.flatMap((post) =>
		(post.redirectFrom ?? []).map((redirectFrom: string) => ({
			from: normalizeBlogRedirectPath(redirectFrom),
			to: post.slug,
			source: post._meta.filePath,
		})),
	),
	{
		label: 'blog posts',
		formatTarget: (target) => `/blog/${target}`,
	},
);

function normalizeBlogRedirectPath(path: string) {
	return path.replace(/^\/+|\/+$/g, '');
}

function handleRedirects(blogPath: string) {
	const normalizedPaths = new Set([
		normalizeBlogRedirectPath(blogPath),
		normalizeBlogRedirectPath(`/blog/${blogPath}`),
	]);

	for (const path of normalizedPaths) {
		const redirectedPostSlug = blogRedirectManifest[path];

		if (redirectedPostSlug) {
			throw redirect({
				href: `/blog/${redirectedPostSlug}`,
				statusCode: 308,
			});
		}
	}

	if (blogPath.includes('directives-the-new-framework-lock-in')) {
		throw redirect({
			href: '/blog/directives-and-the-platform-boundary',
		});
	}
}

export const fetchBlogPost = createServerFn({ method: 'GET' })
	.validator(v.optional(v.string()))
	.handler(async ({ data }: { data: string | undefined }) => {
		if (!data) {
			throw new Error('Invalid blog path');
		}

		handleRedirects(data);

		const post = allPosts.find((candidate) => candidate.slug === data);

		if (!post) {
			throw notFound();
		}

		setResponseHeaders(
			new Headers({
				'Cache-Control': 'public, max-age=0, must-revalidate',
				'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
			}),
		);

		const blogContent = `<small><em>by ${formatAuthors(post.authors)} on ${formatPublishedDate(
			post.published || '1970-01-01',
		)}.</em></small>

${post.content}`;

		const isUnpublished = post.draft || !isPublishedDateReleased(post.published);

		return {
			authors: post.authors,
			content: blogContent,
			description: post.excerpt,
			filePath: `src/blog/${data}.md`,
			headerImage: post.headerImage,
			isUnpublished,
			library: post.library,
			published: post.published,
			title: post.title,
		};
	});

export const fetchRecentPosts = createServerFn({ method: 'GET' }).handler(
	async (): Promise<Array<RecentPost>> => {
		setResponseHeaders(
			new Headers({
				'Cache-Control': 'public, max-age=0, must-revalidate',
				'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
			}),
		);

		return getPublishedPosts()
			.slice(0, 3)
			.map((post) => ({
				slug: post.slug,
				title: post.title,
				published: post.published,
				excerpt: post.excerpt,
				headerImage: post.headerImage,
				authors: post.authors,
			}));
	},
);

export type RelatedPost = {
	libraryId: LibraryId;
	post: {
		slug: string;
		title: string;
		published: string;
		excerpt: string;
	};
};

/**
 * Mirrors CategoryArticle's original client-side
 * `libraries.flatMap((lib) => getPostsForLibrary(lib.id)...).slice(0, 4)`
 * so the display order/cutoff of related posts is unchanged.
 */
export const fetchRelatedPostsForLibraries = createServerFn({ method: 'GET' })
	.validator(v.array(v.string()))
	.handler(({ data }): Array<RelatedPost> => {
		return (data as Array<LibraryId>)
			.flatMap((libraryId) =>
				getPostsForLibrary(libraryId).map((post) => ({
					libraryId,
					post: {
						slug: post.slug,
						title: post.title,
						published: post.published,
						excerpt: post.excerpt,
					},
				})),
			)
			.slice(0, 4);
	});

export type LibraryBlogPost = {
	slug: string;
	title: string;
	published: string;
	excerpt: string;
	headerImage: string | undefined;
	authors: Array<string>;
	library: string | undefined;
};

/**
 * Wider 7-field shape (matches blog.index.tsx's fetchFrontMatters) since
 * /docs/blog needs authors (author filter), headerImage (cover), and
 * library (badge suppression) in addition to slug/title/published/excerpt.
 */
export const fetchPostsForLibrary = createServerFn({ method: 'GET' })
	.validator(v.string())
	.handler(({ data }): Array<LibraryBlogPost> => {
		return getPostsForLibrary(data as LibraryId).map((post) => ({
			slug: post.slug,
			title: post.title,
			published: post.published,
			excerpt: post.excerpt,
			headerImage: post.headerImage,
			authors: post.authors,
			library: post.library,
		}));
	});

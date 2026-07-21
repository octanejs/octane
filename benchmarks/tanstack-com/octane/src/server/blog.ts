import { createServerFn } from '@octanejs/tanstack-start';
import { setResponseHeaders } from '@octanejs/tanstack-start/server';
import { getPublishedPosts } from '~/utils/blog';

export type RecentPost = {
	slug: string;
	title: string;
	published: string;
	excerpt: string;
	headerImage: string | undefined;
	authors: Array<string>;
};

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

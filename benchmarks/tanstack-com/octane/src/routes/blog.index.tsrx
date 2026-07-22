import { Link, createFileRoute } from '@octanejs/tanstack-router';
import * as v from 'valibot';
import { BlogCard, type BlogCardPost } from '~/components/BlogCard.tsrx';
import { BlogAuthorFilter } from '~/components/BlogAuthorFilter.tsrx';
import { getPublishedPosts } from '~/utils/blog';
import { getDistinctAuthors } from '~/utils/blog-format';

import { Footer } from '~/components/Footer.tsrx';
import { PostNotFound } from './blog.tsrx';
import { createServerFn } from '@octanejs/tanstack-start';
import { setResponseHeaders } from '@octanejs/tanstack-start/server';
import { RssIcon } from '@octanejs/lucide';
import { libraries, type LibrarySlim } from '~/libraries';
import { LibrariesWidget } from '~/components/LibrariesWidget.tsrx';
import { Card } from '~/components/Card.tsrx';
import { partners } from '~/utils/partners.tsrx';
import { PartnersRail, RightRail } from '~/components/RightRail.tsrx';
import { RecentPostsWidget } from '~/components/RecentPostsWidget.tsrx';

const searchSchema = v.object({
	author: v.fallback(v.optional(v.string()), undefined),
});

const fetchFrontMatters = createServerFn({ method: 'GET' }).handler(async () => {
	setResponseHeaders(
		new Headers({
			'Cache-Control': 'public, max-age=0, must-revalidate',
			'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=300',
		}),
	);

	return getPublishedPosts().map((post) => {
		return {
			slug: post.slug,
			title: post.title,
			published: post.published,
			excerpt: post.excerpt,
			headerImage: post.headerImage,
			authors: post.authors,
			library: post.library,
		};
	});
});

export const Route = createFileRoute('/blog/')({
	staleTime: Infinity,
	validateSearch: searchSchema,
	loader: () => fetchFrontMatters(),
	notFoundComponent: () => <PostNotFound />,
	component: BlogIndex,
	head: () => ({
		meta: [
			{ title: 'Blog' },
		],
	}),
});

function getLibrariesWithPosts(posts: BlogCardPost[]): LibrarySlim[] {
	const ids = new Set<string>();
	for (const post of posts) {
		if (!post.library) continue;
		for (const id of post.library.split(',')) {
			ids.add(id.trim());
		}
	}
	return libraries.filter((lib) => ids.has(lib.id));
}

function BlogIndex() {
	const frontMatters = Route.useLoaderData() as BlogCardPost[];
	const { author } = Route.useSearch();
	const navigate = Route.useNavigate();
	const activePartners = partners.filter((d) => d.status === 'active');

	const authors = getDistinctAuthors(frontMatters);
	const librariesWithPosts = getLibrariesWithPosts(frontMatters);

	const filteredPosts =
		author ? frontMatters.filter((post) => post.authors.includes(author)) : frontMatters;

	return <div class="flex flex-col max-w-full min-h-screen">
		<div class="flex-1 flex w-full mb-16">
			<div class="flex-1 p-4 md:p-8 min-w-0 flex justify-center">
				<div class="w-full max-w-[1100px] space-y-12">
					<header class="">
						<div class="flex gap-3 items-baseline">
							<h1 class="text-3xl font-black">Blog</h1>
							<a
								href="/rss.xml"
								target="_blank"
								rel="noreferrer"
								class="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors text-xl"
								title="RSS Feed"
							>
								<RssIcon />
							</a>
						</div>

						<p class="text-lg mt-4 text-gray-600 dark:text-gray-400">
							The latest news and blog posts from TanStack
						</p>
					</header>

					<section class="space-y-6">
						<div class="flex flex-wrap items-center gap-3">
							<label
								htmlFor="blog-author-filter"
								class="text-sm font-medium text-gray-600 dark:text-gray-400"
							>
								Author
							</label>
							<div id="blog-author-filter" class="w-64 max-w-full">
								<BlogAuthorFilter
									authors={authors}
									selected={author}
									onSelect={(nextAuthor) => navigate({
										search: () => ({ author: nextAuthor }),
										replace: true,
									})}
								/>
							</div>
						</div>

						{librariesWithPosts.length
							? <div>
									<div class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
										Browse by library
									</div>
									<div class="flex flex-wrap gap-2">{librariesWithPosts.map(
										(library) => <Link
											key={library.id}
											to="/$libraryId/$version/docs/blog"
											params={{
												libraryId: library.id,
												version: 'latest',
											}}
											className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-black uppercase shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${library.bgStyle} ${
												library.badgeTextStyle ?? 'text-white'
											}`}
										>{library.name.replace('TanStack ', '') as string}</Link>,
									)}</div>
								</div>
							: null}
					</section>

					<section class="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-4">{filteredPosts.map(
						(post) => <BlogCard key={post.slug} post={post} />,
					)}</section>

					{filteredPosts.length === 0
						? <div class="text-center text-gray-600 dark:text-gray-400 py-8">
								No posts found
								{author
									? <>
											{' '}
											by
											<span class="font-medium">{author as string}</span>
										</>
									: null}
								.
							</div>
						: null}
				</div>
			</div>
			<RightRail breakpoint="md">
				<PartnersRail analyticsPlacement="blog_rail" partners={activePartners} />
				<div class="hidden md:block border border-gray-500/20 rounded-l-lg overflow-hidden w-full">
					<RecentPostsWidget posts={frontMatters.slice(0, 3)} />
				</div>
				<Card>
					<LibrariesWidget />
				</Card>
			</RightRail>
		</div>
		<Footer />
	</div>;
}

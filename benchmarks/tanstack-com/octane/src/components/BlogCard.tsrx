import { Link } from '@octanejs/tanstack-router';
import { Card } from '~/components/Card.tsrx';
import { CoverFallback } from '~/components/CoverFallback.tsrx';
import { formatAuthors, formatPublishedDate, getBlogLibraries } from '~/utils/blog-format';
import { getOptimizedImageUrl } from '~/utils/optimizedImage';

export type BlogCardPost = {
	slug: string;
	title: string;
	published: string;
	excerpt: string;
	headerImage: string | undefined;
	authors: string[];
	library: string | undefined;
};

type BlogCardProps = {
	post: BlogCardPost;
	showLibraryBadges?: boolean;
};

export function BlogCard({ post, showLibraryBadges = true }: BlogCardProps) {
	const { slug, title, published, excerpt, headerImage, authors, library } = post;
	const blogLibraries =
		showLibraryBadges ? getBlogLibraries(library) : [];

	return <Card
		as={Link}
		to="/blog/$"
		params={{ _splat: slug } as never}
		className="relative flex flex-col justify-between overflow-hidden transition-all hover:shadow-sm hover:border-blue-500"
	>
		{blogLibraries.length
			? <div
					class="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-1"
				>{blogLibraries.map(
					(blogLibrary) => <div
						key={blogLibrary.id}
						class={`rounded-md px-2 py-1 text-xs font-black uppercase shadow-sm ${blogLibrary.bgStyle} ${
							blogLibrary.badgeTextStyle ?? 'text-white'
						}`}
					>
						{blogLibrary.name.replace('TanStack ', '') as string}
					</div>,
				)}</div>
			: null}
		{headerImage
			? <div class="aspect-video overflow-hidden bg-gray-100 dark:bg-gray-800">
					<img
						src={getOptimizedImageUrl(headerImage, {
							fit: 'cover',
							format: 'auto',
							quality: 80,
							width: 800,
						})}
						alt=""
						loading="lazy"
						decoding="async"
						class="w-full h-full object-cover"
					/>
				</div>
			: <CoverFallback slug={slug} library={library} className="aspect-video w-full" />}
		<div class="p-4 md:p-8 flex flex-col gap-4 flex-1 justify-between">
			<div>
				<div class="text-lg font-extrabold">
					{title as string}
				</div>
				<div class="text-xs italic font-light mt-1">
					by
					{formatAuthors(authors) as string}
					{published
						? <time dateTime={published} title={formatPublishedDate(published)}>
								{' '}
								on
								{formatPublishedDate(published) as string}
							</time>
						: null}
				</div>
				{excerpt
					? <p class="text-sm mt-4 text-gray-600 dark:text-gray-400 leading-7 line-clamp-4">
							{excerpt as string}
						</p>
					: null}
			</div>
			<div>
				<div class="text-blue-500 uppercase font-black text-sm">Read More</div>
			</div>
		</div>
	</Card>;
}

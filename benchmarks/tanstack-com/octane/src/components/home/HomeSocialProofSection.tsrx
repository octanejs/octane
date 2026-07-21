import { Link } from '@octanejs/tanstack-router';
import { Hydrate } from '@octanejs/tanstack-start';
import { visible } from '@octanejs/tanstack-start/hydration';
import { ArrowRight } from '@octanejs/lucide';
import { Card } from '~/components/Card.tsrx';
import { PartnersGrid } from '~/components/PartnersGrid.tsrx';
import { Button } from '~/ui';
import { formatAuthors, formatPublishedDate } from '~/utils/blog-format';
import type { RecentPost } from '~/utils/blog.functions';

type HomeSocialProofSectionProps = {
	recentPosts: ReadonlyArray<RecentPost>;
};

export function HomeSocialProofSection({ recentPosts }: HomeSocialProofSectionProps) {
	return <Hydrate when={visible({ rootMargin: '25%' })} fallback={<SocialProofSkeleton />}>
		<HomeSocialProofContent recentPosts={recentPosts} />
	</Hydrate>;
}

function SocialProofSkeleton() {
	return <div class="space-y-24">
		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<div class="h-10 w-40 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse mb-6" />
			<div
				class="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-md border border-gray-200 dark:border-gray-800"
			>{Array.from({ length: 8 }).map(
				(_, index) =>
					<div
						key={`partner-skeleton-${index}`}
						class="min-h-[130px] bg-gray-100/70 dark:bg-gray-900/60 animate-pulse"
					/>,
			)}</div>
		</div>
		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<div class="h-10 w-56 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse mb-6" />
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">{Array.from({ length: 3 }).map(
				(_, index) => <Card
					key={`post-skeleton-${index}`}
					className="overflow-hidden animate-pulse"
				>
					<div class="aspect-video bg-gray-100 dark:bg-gray-800" />
					<div class="p-4">
						<div class="h-5 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
						<div class="mt-3 h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
						<div class="mt-4 space-y-2">
							<div class="h-3 rounded bg-gray-100 dark:bg-gray-800" />
							<div class="h-3 rounded bg-gray-100 dark:bg-gray-800" />
						</div>
					</div>
				</Card>,
			)}</div>
		</div>
	</div>;
}

function HomeSocialProofContent({ recentPosts }: HomeSocialProofSectionProps) {
	return <div class="space-y-24">
		<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
			<h3 id="partners" class="text-3xl font-bold mb-6 scroll-mt-24">
				<a href="#partners" class="hover:underline decoration-gray-400 dark:decoration-gray-600">
					Partners
				</a>
			</h3>
			<PartnersGrid analyticsPlacement="home_grid" />
			<div class="flex justify-center mt-6">
				<Link to="/partners" search={{ status: 'inactive' }}>
					<Button as="span">
						View Previous Partners
						<ArrowRight className="w-4 h-4" />
					</Button>
				</Link>
			</div>
		</div>

		{recentPosts.length > 0 &&
			<div class="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
				<h3 id="blog" class="text-3xl font-bold mb-6 scroll-mt-24">
					<a href="#blog" class="hover:underline decoration-gray-400 dark:decoration-gray-600">
						Latest Blog Posts
					</a>
				</h3>
				<div class="grid grid-cols-1 md:grid-cols-3 gap-4">{recentPosts.map(({
					slug,
					title,
					published,
					excerpt,
					headerImage,
					authors,
				}) => {
					return <Card
						as={Link}
						key={slug}
						to="/blog/$"
						params={{ _splat: slug } as never}
						className="flex flex-col justify-between overflow-hidden transition-all hover:shadow-md hover:border-blue-500"
					>
						{headerImage
							? <div class="aspect-video overflow-hidden bg-gray-100 dark:bg-gray-800">
									<img
										src={headerImage}
										alt=""
										loading="lazy"
										decoding="async"
										class="w-full h-full object-cover"
									/>
								</div>
							: null}
						<div class="p-4 flex flex-col gap-3 flex-1 justify-between">
							<div>
								<div class="text-base font-bold">
									{title as string}
								</div>
								<div class="text-xs italic font-light mt-1 text-gray-600 dark:text-gray-400">
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
									? <p
											class="text-sm mt-3 text-gray-600 dark:text-gray-400 line-clamp-4 leading-relaxed"
										>
											{excerpt as string}
										</p>
									: null}
							</div>
							<div class="text-blue-500 uppercase font-bold text-xs">Read More →</div>
						</div>
					</Card>;
				})}</div>
				<div class="flex justify-center mt-6">
					<Button as={Link} to="/blog">
						View All Posts
						<ArrowRight className="w-4 h-4" />
					</Button>
				</div>
			</div>}
	</div>;
}

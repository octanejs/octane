import { Link } from '@tanstack/react-router';
import { Hydrate } from '@tanstack/react-start';
import { visible } from '@tanstack/react-start/hydration';
import { ArrowRight } from 'lucide-react';
import { Card } from '~/components/Card';
import { PartnersGrid } from '~/components/PartnersGrid';
import { Button } from '~/ui';
import { formatAuthors, formatPublishedDate } from '~/utils/blog-format';
import type { RecentPost } from '~/utils/blog.functions';

type HomeSocialProofSectionProps = {
	recentPosts: ReadonlyArray<RecentPost>;
};

export function HomeSocialProofSection({ recentPosts }: HomeSocialProofSectionProps) {
	return (
		<Hydrate when={visible({ rootMargin: '25%' })} fallback={<SocialProofSkeleton />}>
			<HomeSocialProofContent recentPosts={recentPosts} />
		</Hydrate>
	);
}

function SocialProofSkeleton() {
	return (
		<div className="space-y-24">
			<div className="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
				<div className="h-10 w-40 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse mb-6" />
				<div className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-md border border-gray-200 dark:border-gray-800">
					{Array.from({ length: 8 }).map((_, index) => (
						<div
							key={`partner-skeleton-${index}`}
							className="min-h-[130px] bg-gray-100/70 dark:bg-gray-900/60 animate-pulse"
						/>
					))}
				</div>
			</div>
			<div className="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
				<div className="h-10 w-56 rounded bg-gray-200/70 dark:bg-gray-800/70 animate-pulse mb-6" />
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{Array.from({ length: 3 }).map((_, index) => (
						<Card key={`post-skeleton-${index}`} className="overflow-hidden animate-pulse">
							<div className="aspect-video bg-gray-100 dark:bg-gray-800" />
							<div className="p-4">
								<div className="h-5 w-5/6 rounded bg-gray-200 dark:bg-gray-700" />
								<div className="mt-3 h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
								<div className="mt-4 space-y-2">
									<div className="h-3 rounded bg-gray-100 dark:bg-gray-800" />
									<div className="h-3 rounded bg-gray-100 dark:bg-gray-800" />
								</div>
							</div>
						</Card>
					))}
				</div>
			</div>
		</div>
	);
}

function HomeSocialProofContent({ recentPosts }: HomeSocialProofSectionProps) {
	return (
		<div className="space-y-24">
			<div className="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
				<h3 id="partners" className="text-3xl font-bold mb-6 scroll-mt-24">
					<a
						href="#partners"
						className="hover:underline decoration-gray-400 dark:decoration-gray-600"
					>
						Partners
					</a>
				</h3>
				<PartnersGrid analyticsPlacement="home_grid" />
				<div className="flex justify-center mt-6">
					<Link to="/partners" search={{ status: 'inactive' }}>
						<Button as="span">
							View Previous Partners
							<ArrowRight className="w-4 h-4" />
						</Button>
					</Link>
				</div>
			</div>

			{recentPosts.length > 0 && (
				<div className="px-4 lg:max-w-(--breakpoint-lg) md:mx-auto">
					<h3 id="blog" className="text-3xl font-bold mb-6 scroll-mt-24">
						<a
							href="#blog"
							className="hover:underline decoration-gray-400 dark:decoration-gray-600"
						>
							Latest Blog Posts
						</a>
					</h3>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						{recentPosts.map(({ slug, title, published, excerpt, headerImage, authors }) => {
							return (
								<Card
									as={Link}
									key={slug}
									to="/blog/$"
									params={{ _splat: slug } as never}
									className="flex flex-col justify-between overflow-hidden transition-all hover:shadow-md hover:border-blue-500"
								>
									{headerImage ? (
										<div className="aspect-video overflow-hidden bg-gray-100 dark:bg-gray-800">
											<img
												src={headerImage}
												alt=""
												loading="lazy"
												decoding="async"
												className="w-full h-full object-cover"
											/>
										</div>
									) : null}
									<div className="p-4 flex flex-col gap-3 flex-1 justify-between">
										<div>
											<div className="text-base font-bold">{title}</div>
											<div className="text-xs italic font-light mt-1 text-gray-600 dark:text-gray-400">
												by {formatAuthors(authors)}
												{published ? (
													<time dateTime={published} title={formatPublishedDate(published)}>
														{' '}
														on {formatPublishedDate(published)}
													</time>
												) : null}
											</div>
											{excerpt ? (
												<p className="text-sm mt-3 text-gray-600 dark:text-gray-400 line-clamp-4 leading-relaxed">
													{excerpt}
												</p>
											) : null}
										</div>
										<div className="text-blue-500 uppercase font-bold text-xs">Read More →</div>
									</div>
								</Card>
							);
						})}
					</div>
					<div className="flex justify-center mt-6">
						<Button as={Link} to="/blog">
							View All Posts
							<ArrowRight className="w-4 h-4" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

import { createFileRoute } from '@octanejs/tanstack-router';
import { seo } from '~/utils/seo';
import { PostNotFound } from './blog.tsrx';
import { formatAuthors } from '~/utils/blog-format';
import { useEffect, useMemo, useRef, useState } from 'octane';
import { MarkdownContent } from '~/components/markdown';
import { Card } from '~/components/Card.tsrx';
import { LibrariesWidget } from '~/components/LibrariesWidget.tsrx';
import { partners } from '~/utils/partners.tsrx';
import { PartnersRail, RightRail } from '~/components/RightRail.tsrx';
import { RecentPostsWidget } from '~/components/RecentPostsWidget.tsrx';
import { useMediaQuery } from '~/utils/useMediaQuery';

import { Toc } from '~/components/Toc.tsrx';
import { Breadcrumbs } from '~/components/Breadcrumbs.tsrx';
import { CoverFallback } from '~/components/CoverFallback.tsrx';
import { fetchBlogPost } from '~/utils/blog.functions';
import { parseSiteMarkdown } from '~/utils/markdown';
import { getAbsoluteOptimizedImageUrl } from '~/utils/optimizedImage';

export const Route = createFileRoute('/blog/$')({
	staleTime: Infinity,
	loader: async ({ params }) => {
		const blogPath = params._splat;

		if (!blogPath) {
			throw new Error('Invalid blog path');
		}

		return fetchBlogPost({ data: blogPath });
	},
	head: ({ loaderData }) => {
		const getSocialImageUrl = (headerImage?: string) => {
			if (!headerImage) return undefined;

			if (headerImage.startsWith('http')) {
				return headerImage;
			}

			return getAbsoluteOptimizedImageUrl(headerImage, {
				fit: 'cover',
				format: 'auto',
				height: 630,
				quality: 80,
				width: 1200,
			});
		};

		return {
			meta: loaderData
				? [
						...seo({
							title: `${loaderData?.title ?? 'Docs'} | TanStack Blog`,
							description: loaderData?.description,
							image: getSocialImageUrl(loaderData?.headerImage),
							noindex: loaderData?.isUnpublished,
						}),
						{
							name: 'author',
							content: `${loaderData.authors.length > 1 ? 'co-authored by ' : ''}${formatAuthors(
								loaderData.authors,
							)}`,
						},
					]
				: [],
		};
	},
	notFoundComponent: () => <PostNotFound />,
	component: BlogPost,
});

function BlogPost() {
	const { content, filePath, title, headerImage, library } = Route.useLoaderData();
	const { _splat: slug } = Route.useParams();
	const markdown = useMemo(() => parseSiteMarkdown(content), [content]);
	const headings = markdown.headings;

	const isTocVisible = headings.length > 1;
	const isDesktopViewport = useMediaQuery('(min-width: 768px)');

	const markdownContainerRef = useRef<HTMLDivElement>(null);
	const [activeHeadings, setActiveHeadings] = useState<Array<string>>([]);

	const headingElementRefs = useRef<Record<string, IntersectionObserverEntry>>({});

	useEffect(() => {
		const callback = (headingsList: Array<IntersectionObserverEntry>) => {
			headingElementRefs.current = headingsList.reduce((map, headingElement) => {
				map[headingElement.target.id] = headingElement;
				return map;
			}, headingElementRefs.current);

			const visibleHeadings: Array<IntersectionObserverEntry> = [];
			Object.keys(headingElementRefs.current).forEach((key) => {
				const headingElement = headingElementRefs.current[key];
				if (headingElement.isIntersecting) {
					visibleHeadings.push(headingElement);
				}
			});

			if (visibleHeadings.length >= 1) {
				setActiveHeadings(visibleHeadings.map((h) => h.target.id));
			}
		};

		const observer = new IntersectionObserver(callback, {
			rootMargin: '0px',
			threshold: 0.2,
		});

		const headingElements = Array.from(
			markdownContainerRef.current?.querySelectorAll('h2[id], h3[id], h4[id], h5[id], h6[id]') ??
				[],
		);
		headingElements.forEach((el) => observer.observe(el));

		return () => observer.disconnect();
	}, [headings]);

	const repo = 'tanstack/tanstack.com';
	const branch = 'main';
	const activePartners = useMemo(() => partners.filter((d) => d.status === 'active'), []);

	return <div
		class={`
        min-h-[calc(100dvh-var(--navbar-height))]
        flex flex-col
        w-full transition-all duration-300`}
	>
		<div class="flex flex-col max-w-full min-w-0 w-full min-h-0 relative mb-8">
			<div class="min-w-0 flex justify-center w-full min-h-[88dvh] lg:min-h-0 mx-auto">
				<div class="flex-1 flex flex-col w-full min-w-0">
					<div class="px-4 pt-4 lg:pt-6">
						<div class="w-full max-w-[1100px] mx-auto">
							<div class="flex-1 min-h-0 flex flex-col">
								<div class="w-full flex justify-center">
									<div
										class={[
											'w-full p-2 lg:p-4 xl:p-6',
											isTocVisible ? 'max-w-full' : 'max-w-[768px]',
										].join(' ')}
									>
										<Breadcrumbs
											section="Blog"
											sectionTo="/blog"
											headings={isTocVisible ? headings : undefined}
											tocHiddenBreakpoint="xl"
										/>
									</div>
									{isTocVisible &&
										<div
											class="pl-4 w-32 lg:w-36 xl:w-44 2xl:w-56 3xl:w-64 shrink-0 hidden xl:block"
										/>}
								</div>
								<div
									class={[
										'w-full flex justify-center mx-auto',
										isTocVisible ? 'max-w-full' : 'max-w-[768px]',
									].join(' ')}
								>
									<div class="flex overflow-auto flex-col w-full p-2 lg:p-4 xl:p-6 pt-0">
										{!headerImage && slug
											? <CoverFallback
													slug={slug}
													library={library}
													className="aspect-[5/2] w-full rounded-2xl mb-6"
												/>
											: null}
										<MarkdownContent
											title={title}
											markdown={markdown}
											preserveTabPanels
											repo={repo}
											branch={branch}
											filePath={filePath}
											containerRef={markdownContainerRef}
											eagerFirstImage
										/>
									</div>
									{isTocVisible &&
										<div
											class="pl-4 w-32 lg:w-36 xl:w-44 2xl:w-56 3xl:w-64 shrink-0 hidden xl:block py-4 transition-all"
										>
											<Toc headings={headings} activeHeadings={activeHeadings} />
										</div>}
								</div>
							</div>
						</div>
					</div>
				</div>
				<RightRail breakpoint="md">
					<PartnersRail analyticsPlacement="blog_rail" partners={activePartners} />
					<div
						class="hidden md:block border border-gray-500/20 rounded-l-lg overflow-hidden w-full"
					>
						<RecentPostsWidget enabled={isDesktopViewport} />
					</div>
					<Card>
						<LibrariesWidget />
					</Card>
				</RightRail>
			</div>
		</div>
	</div>;
}

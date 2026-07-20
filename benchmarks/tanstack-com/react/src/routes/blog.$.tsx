import { createFileRoute } from '@tanstack/react-router';
import { seo } from '~/utils/seo';
import { PostNotFound } from './blog';
import { formatAuthors } from '~/utils/blog-format';
import * as React from 'react';
import { MarkdownContent } from '~/components/markdown';
import { Card } from '~/components/Card';
import { LibrariesWidget } from '~/components/LibrariesWidget';
import { partners } from '~/utils/partners';
import { PartnersRail, RightRail } from '~/components/RightRail';
import { RecentPostsWidget } from '~/components/RecentPostsWidget';
import { useMediaQuery } from '~/utils/useMediaQuery';

import { Toc } from '~/components/Toc';
import { Breadcrumbs } from '~/components/Breadcrumbs';
import { CoverFallback } from '~/components/CoverFallback';
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
							content: `${
								loaderData.authors.length > 1 ? 'co-authored by ' : ''
							}${formatAuthors(loaderData.authors)}`,
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
	const markdown = React.useMemo(() => parseSiteMarkdown(content), [content]);
	const headings = markdown.headings;

	const isTocVisible = headings.length > 1;
	const isDesktopViewport = useMediaQuery('(min-width: 768px)');

	const markdownContainerRef = React.useRef<HTMLDivElement>(null);
	const [activeHeadings, setActiveHeadings] = React.useState<Array<string>>([]);

	const headingElementRefs = React.useRef<Record<string, IntersectionObserverEntry>>({});

	React.useEffect(() => {
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
	const activePartners = React.useMemo(() => partners.filter((d) => d.status === 'active'), []);

	return (
		<div
			className={`
        min-h-[calc(100dvh-var(--navbar-height))]
        flex flex-col
        w-full transition-all duration-300`}
		>
			<div className="flex flex-col max-w-full min-w-0 w-full min-h-0 relative mb-8">
				<div className="min-w-0 flex justify-center w-full min-h-[88dvh] lg:min-h-0 mx-auto">
					<div className="flex-1 flex flex-col w-full min-w-0">
						<div className="px-4 pt-4 lg:pt-6">
							<div className="w-full max-w-[1100px] mx-auto">
								<div className="flex-1 min-h-0 flex flex-col">
									<div className="w-full flex justify-center">
										<div
											className={[
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
										{isTocVisible && (
											<div className="pl-4 w-32 lg:w-36 xl:w-44 2xl:w-56 3xl:w-64 shrink-0 hidden xl:block" />
										)}
									</div>
									<div
										className={[
											'w-full flex justify-center mx-auto',
											isTocVisible ? 'max-w-full' : 'max-w-[768px]',
										].join(' ')}
									>
										<div className="flex overflow-auto flex-col w-full p-2 lg:p-4 xl:p-6 pt-0">
											{!headerImage && slug ? (
												<CoverFallback
													slug={slug}
													library={library}
													className="aspect-[5/2] w-full rounded-2xl mb-6"
												/>
											) : null}
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
										{isTocVisible && (
											<div className="pl-4 w-32 lg:w-36 xl:w-44 2xl:w-56 3xl:w-64 shrink-0 hidden xl:block py-4 transition-all">
												<Toc headings={headings} activeHeadings={activeHeadings} />
											</div>
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
					<RightRail breakpoint="md">
						<PartnersRail analyticsPlacement="blog_rail" partners={activePartners} />
						<div className="hidden md:block border border-gray-500/20 rounded-l-lg overflow-hidden w-full">
							<RecentPostsWidget enabled={isDesktopViewport} />
						</div>
						<Card>
							<LibrariesWidget />
						</Card>
					</RightRail>
				</div>
			</div>
		</div>
	);
}

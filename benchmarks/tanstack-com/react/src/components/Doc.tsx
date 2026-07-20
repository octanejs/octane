import * as React from 'react';
import { FoldHorizontal, UnfoldHorizontal } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import { DocNavigation, WidthToggleContext } from '~/components/LibraryLayout';

import { Toc } from './Toc';
import { DocBreadcrumb } from './DocBreadcrumb';
import { MarkdownContent } from '~/components/markdown';
import type { ConfigSchema } from '~/utils/config';
import { useLocalCurrentFramework } from './FrameworkSelect';
import { useParams } from '@tanstack/react-router';
import { parseSiteMarkdown } from '~/utils/markdown';

type DocProps = {
	title: string;
	content: string;
	repo: string;
	branch: string;
	filePath: string;
	shouldRenderToc?: boolean;
	colorFrom?: string;
	colorTo?: string;
	textColor?: string;
	// Feedback props (optional)
	libraryId?: string;
	libraryVersion?: string;
	pagePath?: string;
	// Breadcrumb props (optional)
	config?: ConfigSchema;
	// Footer content rendered after markdown
	footer?: React.ReactNode;
	// Optional framework to use (overrides URL and local storage)
	framework?: string;
};

export function Doc({
	title,
	content,
	repo,
	branch,
	filePath,
	shouldRenderToc = false,
	colorFrom,
	colorTo,
	textColor,
	libraryId,
	libraryVersion,
	pagePath,
	config,
	footer,
	framework: frameworkProp,
}: DocProps) {
	const markdown = React.useMemo(() => parseSiteMarkdown(content), [content]);
	const headings = markdown.headings;

	// Get current framework from prop, URL params, or local storage
	const { framework: paramsFramework } = useParams({ strict: false });
	const localCurrentFramework = useLocalCurrentFramework();
	const currentFramework = React.useMemo(() => {
		const fw =
			frameworkProp || paramsFramework || localCurrentFramework.currentFramework || 'react';
		return typeof fw === 'string' ? fw.toLowerCase() : fw;
	}, [frameworkProp, paramsFramework, localCurrentFramework.currentFramework]);

	const isTocVisible = shouldRenderToc && headings.length > 1;

	const markdownContainerRef = React.useRef<HTMLDivElement>(null);
	const [activeHeadings, setActiveHeadings] = React.useState<Array<string>>([]);

	const headingElementRefs = React.useRef<Record<string, IntersectionObserverEntry>>({});

	const widthToggleContext = React.useContext(WidthToggleContext);

	const isFullWidth = widthToggleContext?.isFullWidth ?? false;
	const setIsFullWidth = widthToggleContext?.setIsFullWidth;

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

	return (
		<div className="flex-1 min-h-0 flex flex-col pt-4 lg:pt-6 xl:pt-8">
			<a href={`${pagePath}.md`} className="sr-only" tabIndex={-1} aria-hidden="true">
				AI/LLM: This documentation page is available in plain markdown format at
				{pagePath}.md
			</a>

			<div className={twMerge('w-full flex mx-auto max-w-[768px]', isTocVisible && 'max-w-full')}>
				<div className="flex flex-col w-full min-w-0">
					{config && (
						<div className="mb-3">
							<DocBreadcrumb config={config} headings={isTocVisible ? headings : undefined} />
						</div>
					)}
					<MarkdownContent
						title={title}
						repo={repo}
						branch={branch}
						filePath={filePath}
						markdown={markdown}
						containerRef={markdownContainerRef}
						libraryId={libraryId}
						libraryVersion={libraryVersion}
						pagePath={pagePath}
						currentFramework={currentFramework}
						proseClassName="[font-size:14px]"
						titleBarActions={
							setIsFullWidth ? (
								<button
									onClick={() => setIsFullWidth(!isFullWidth)}
									className="p-2 mr-4 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors shrink-0 hidden [@media(min-width:1535px)]:inline-flex"
									title={isFullWidth ? 'Constrain width' : 'Expand width'}
								>
									{isFullWidth ? (
										<FoldHorizontal className="w-4 h-4" />
									) : (
										<UnfoldHorizontal className="w-4 h-4" />
									)}
								</button>
							) : null
						}
					/>
					{footer ?? <DocNavigation />}
				</div>

				{isTocVisible && (
					<div className="pl-4 w-32 lg:w-36 xl:w-44 2xl:w-56 3xl:w-64 shrink-0 hidden xl:block transition-all">
						<Toc
							headings={headings}
							activeHeadings={activeHeadings}
							colorFrom={colorFrom}
							colorTo={colorTo}
							textColor={textColor}
							currentFramework={currentFramework}
						/>
					</div>
				)}
			</div>
		</div>
	);
}

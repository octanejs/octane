import { Link } from '@tanstack/react-router';
import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import type { MarkdownHeading } from '~/utils/markdown';

const headingLevels: Record<number, string> = {
	1: '',
	2: '',
	3: 'pl-2',
	4: 'pl-4',
	5: 'pl-6',
	6: 'pl-8',
};

type TocProps = {
	headings: MarkdownHeading[];
	colorFrom?: string;
	colorTo?: string;
	textColor?: string;
	activeHeadings: Array<string>;
	currentFramework?: string;
};

export function Toc({ headings, textColor, activeHeadings, currentFramework }: TocProps) {
	// Filter headings based on framework scope
	const visibleHeadings = React.useMemo(() => {
		return headings.filter((heading) => {
			if (heading.framework) {
				return currentFramework && heading.framework === currentFramework.toLowerCase();
			}
			// If no framework attribute, always show (not framework-scoped)
			return true;
		});
	}, [headings, currentFramework]);
	return (
		<nav className="flex flex-col sticky top-[calc(var(--navbar-height)+var(--docs-tabs-height,0px))] max-h-[calc(100dvh-var(--navbar-height)-var(--docs-tabs-height,0px))] overflow-hidden">
			<div className="py-1">
				<h3 className="text-[.8em] lg:text-[.825em] xl:text-[.875em] 2xl:text-[.9em] font-bold">
					On this page
				</h3>
			</div>
			<ul
				className={twMerge(
					'py-1 flex flex-col overflow-y-auto text-[.6em] lg:text-[.65em] xl:text-[.7em] 2xl:text-[.75em]',
				)}
			>
				{visibleHeadings?.map((heading) => (
					<li key={heading.id} className={twMerge('w-full', headingLevels[heading.level])}>
						<Link
							to="."
							title={heading.id}
							hash={heading.id}
							aria-current={activeHeadings.includes(heading.id) && 'location'}
							className={twMerge(
								'block py-1 pl-2 border-l-2 rounded-r transition-colors duration-200 opacity-60 hover:opacity-100 hover:bg-gray-500/10',
								activeHeadings.includes(heading.id)
									? `opacity-100 border-current ${textColor}`
									: 'border-transparent',
							)}
							resetScroll={false}
							hashScrollIntoView={{
								behavior: 'smooth',
							}}
						>
							<span
								className="block break-words overflow-hidden"
								dangerouslySetInnerHTML={{ __html: heading.text }}
							/>
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}

import { Link } from '@octanejs/tanstack-router';
import { ChevronDown } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import type { MarkdownHeading } from '~/utils/markdown';
import { Dropdown, DropdownTrigger, DropdownContent, DropdownItem } from './Dropdown.tsrx';

type BreadcrumbsProps = {
	/** Section label (e.g., "Getting Started", "Blog") */
	section: string;
	/** Optional link for the section */
	sectionTo?: string;
	headings?: MarkdownHeading[];
	/** Breakpoint at which the TOC toggle is hidden (default: 'lg') */
	tocHiddenBreakpoint?: 'md' | 'lg' | 'xl';
};

export function Breadcrumbs({
	section,
	sectionTo,
	headings,
	tocHiddenBreakpoint = 'lg',
}: BreadcrumbsProps) {
	const showTocToggle = headings && headings.length > 1;
	const hiddenClass =
		tocHiddenBreakpoint === 'md'
			? 'md:hidden'
			: tocHiddenBreakpoint === 'xl'
				? 'xl:hidden'
				: 'lg:hidden';

	return <div class="flex flex-col">
		<div class="flex items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
			{sectionTo
				? <Link
						to={sectionTo}
						className="whitespace-nowrap hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
					>
						{section as string}
					</Link>
				: <span class="whitespace-nowrap">
						{section as string}
					</span>}
			{showTocToggle &&
				<Dropdown>
					<DropdownTrigger>
						<button
							class={twMerge(
								hiddenClass,
								'whitespace-nowrap inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors cursor-pointer',
							)}
						>
							<span>On this page</span>
							<ChevronDown className="w-3.5 h-3.5" />
						</button>
					</DropdownTrigger>
					<DropdownContent align="end" sideOffset={8} className={hiddenClass}>{headings.map(
						(heading) => <DropdownItem key={`breadcrumb-toc-${heading.id}`} asChild>
							<Link
								to="."
								hash={heading.id}
								style={{
									paddingLeft: `${(heading.level - 2) * 0.5 + 0.5}rem`,
								}}
								resetScroll={false}
								hashScrollIntoView={{
									behavior: 'smooth',
								}}
							>
								<span dangerouslySetInnerHTML={{ __html: heading.text }} />
							</Link>
						</DropdownItem>,
					)}</DropdownContent>
				</Dropdown>}
		</div>
	</div>;
}

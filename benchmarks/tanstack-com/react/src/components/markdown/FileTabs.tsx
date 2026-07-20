import * as React from 'react';

export type FileTabDefinition = {
	slug: string;
	name: string;
};

export type FileTabsProps = {
	tabs: Array<FileTabDefinition>;
	children: Array<React.ReactNode> | React.ReactNode;
};

export function FileTabs({ tabs, children }: FileTabsProps) {
	const id = React.useId();
	const childrenArray = React.Children.toArray(children);
	const [activeSlug, setActiveSlug] = React.useState(tabs[0]?.slug ?? '');

	if (tabs.length === 0) return null;

	return (
		<div className="not-prose my-4">
			<div className="flex items-center justify-start gap-0 overflow-x-auto overflow-y-hidden bg-gray-100 dark:bg-gray-900 border border-b-0 border-gray-500/20 rounded-t-md">
				{tabs.map((tab) => (
					<button
						key={`${id}-${tab.slug}`}
						type="button"
						onClick={() => setActiveSlug(tab.slug)}
						aria-label={tab.name}
						title={tab.name}
						className={`px-3 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] ${
							activeSlug === tab.slug
								? 'border-current text-current bg-white dark:bg-gray-950'
								: 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-800'
						}`}
					>
						{tab.name}
					</button>
				))}
			</div>
			<div>
				{childrenArray.map((child, index) => {
					const tab = tabs[index];
					if (!tab) return null;
					const isActive = tab.slug === activeSlug;
					return (
						<div
							key={`${id}-${tab.slug}-panel`}
							data-tab={tab.slug}
							data-content="code-only"
							className={`border border-t-0 border-gray-500/20 rounded-b-md overflow-hidden ${
								isActive ? '' : 'hidden'
							}`}
						>
							{child}
						</div>
					);
				})}
			</div>
		</div>
	);
}

import { useParams } from '@tanstack/react-router';
import * as React from 'react';
import { frameworkOptions } from '~/libraries/frameworks';

export type TabDefinition = {
	slug: string;
	name: string;
	headers?: Array<string>;
};

export type TabsProps = {
	tabs?: Array<TabDefinition>;
	children?: Array<React.ReactNode> | React.ReactNode;
	activeSlug?: string;
	onTabChange?: (slug: string) => void;
	panelContent?: Record<string, string> | string;
};

export function Tabs({
	tabs: tabsProp = [],
	children: childrenProp,
	activeSlug: controlledActiveSlug,
	onTabChange,
	panelContent,
}: TabsProps) {
	const isControlled = controlledActiveSlug !== undefined;
	const id = React.useId();
	const childrenArray = React.Children.toArray(childrenProp);

	const params = useParams({ strict: false });
	const frameworkParam = isControlled ? undefined : params?.framework;

	const [internalActiveSlug, setInternalActiveSlug] = React.useState(() => {
		if (isControlled) return '';
		const match = frameworkParam ? tabsProp.find((tab) => tab.slug === frameworkParam) : undefined;
		return match?.slug ?? tabsProp[0]?.slug ?? '';
	});

	const activeSlug = controlledActiveSlug ?? internalActiveSlug;
	const setActiveSlug = React.useCallback(
		(slug: string) => {
			if (onTabChange) {
				onTabChange(slug);
			} else {
				setInternalActiveSlug(slug);
			}
		},
		[onTabChange],
	);

	if (tabsProp.length === 0) return null;

	return (
		<div className="my-4">
			<div className="not-prose flex items-center justify-start gap-2 rounded-t-md border-1 border-b-none border-gray-200 dark:border-gray-800 overflow-x-auto overflow-y-hidden bg-white dark:bg-gray-950">
				{tabsProp.map((tab) => {
					return (
						<Tab
							key={`${id}-${tab.slug}`}
							id={id}
							tab={tab}
							activeSlug={activeSlug}
							setActiveSlug={setActiveSlug}
						/>
					);
				})}
			</div>
			<div className="border border-gray-500/20 rounded-b-md bg-gray-100 dark:bg-gray-900 overflow-hidden">
				{childrenArray.map((child, index) => {
					const tab = tabsProp[index];
					if (!tab) return null;
					const isActive = tab.slug === activeSlug;
					const content =
						typeof panelContent === 'string' ? panelContent : panelContent?.[tab.slug];
					return (
						<div
							key={`${id}-${tab.slug}`}
							data-tab={tab.slug}
							data-content={content}
							className={`max-w-none flex-col gap-2 text-base ${isActive ? 'flex' : 'hidden'}`}
						>
							{child}
						</div>
					);
				})}
			</div>
		</div>
	);
}

const Tab = React.memo(function Tab({
	tab,
	activeSlug,
	setActiveSlug,
}: {
	id?: string;
	tab: TabDefinition;
	activeSlug: string;
	setActiveSlug: (slug: string) => void;
}) {
	const option = React.useMemo(
		() =>
			frameworkOptions.find(
				(o) =>
					o.value === tab.slug.toLowerCase() || o.label.toLowerCase() === tab.name.toLowerCase(),
			),
		[tab.slug, tab.name],
	);

	return (
		<button
			aria-label={tab.name}
			title={tab.name}
			type="button"
			onClick={() => setActiveSlug(tab.slug)}
			className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 -mb-[1px] border-b-2 text-sm font-bold transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 rounded-t-md overflow-y-none ${
				activeSlug === tab.slug
					? 'border-current text-current bg-gray-100 dark:bg-gray-900'
					: 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 hover:dark:text-gray-200'
			}`}
		>
			{option && <img src={option.logo} alt="" className="w-4 h-4 -ml-1" />}
			<span>{tab.name}</span>
		</button>
	);
});

import { librariesByGroup, librariesGroupNamesMap } from '~/libraries';
import type { LibrarySlim } from '~/libraries';

export type GroupId = keyof typeof librariesByGroup;

export type CategorySlug = 'framework' | 'state' | 'ui' | 'performance' | 'tooling';

export const slugToGroup: Record<CategorySlug, GroupId> = {
	framework: 'framework',
	state: 'state',
	ui: 'headlessUI',
	performance: 'performance',
	tooling: 'tooling',
};

export const groupToSlug: Record<GroupId, CategorySlug> = {
	framework: 'framework',
	state: 'state',
	headlessUI: 'ui',
	performance: 'performance',
	tooling: 'tooling',
};

export const categorySlugs = Object.keys(slugToGroup) as CategorySlug[];

export type CategoryMeta = {
	slug: CategorySlug;
	groupId: GroupId;
	name: string;
	shortName: string;
	headline: string;
	intro: string;
	topPickId: string;
	/** Accent gradient classes for the hero / numbered chips. */
	accent: { from: string; to: string; text: string };
};

export const categoryMeta: Record<CategorySlug, CategoryMeta> = {
	framework: {
		slug: 'framework',
		groupId: 'framework',
		name: librariesGroupNamesMap.framework,
		shortName: 'Framework',
		headline: 'Router-first apps, from SPA to full-stack',
		intro:
			'Typed routes, URL state, loaders, links, SSR, streaming, server functions, and deployable output from one app model.',
		topPickId: 'start',
		accent: {
			from: 'from-teal-500',
			to: 'to-cyan-500',
			text: 'text-cyan-600 dark:text-cyan-400',
		},
	},
	state: {
		slug: 'state',
		groupId: 'state',
		name: librariesGroupNamesMap.state,
		shortName: 'Data & State',
		headline: 'The right state layer for every kind of data',
		intro:
			'Four layers for apps that cache remote truth, sync collections, react locally, and talk to models.',
		topPickId: 'query',
		accent: {
			from: 'from-cyan-500',
			to: 'to-emerald-500',
			text: 'text-cyan-600 dark:text-cyan-400',
		},
	},
	ui: {
		slug: 'ui',
		groupId: 'headlessUI',
		name: librariesGroupNamesMap.headlessUI,
		shortName: 'UI & UX',
		headline: 'Headless engines for the UI users actually touch',
		intro:
			'Tables, forms, and hotkeys that leave markup and styling in your hands while handling row models, field state, and keyboard flow.',
		topPickId: 'table',
		accent: {
			from: 'from-blue-500',
			to: 'to-yellow-500',
			text: 'text-blue-600 dark:text-blue-400',
		},
	},
	performance: {
		slug: 'performance',
		groupId: 'performance',
		name: librariesGroupNamesMap.performance,
		shortName: 'Performance',
		headline: 'Render less, schedule less, stay fast',
		intro:
			'Virtualization and pacing primitives for large interfaces, event-heavy inputs, queues, batches, and rate limits.',
		topPickId: 'virtual',
		accent: {
			from: 'from-purple-500',
			to: 'to-lime-500',
			text: 'text-purple-600 dark:text-purple-400',
		},
	},
	tooling: {
		slug: 'tooling',
		groupId: 'tooling',
		name: librariesGroupNamesMap.tooling,
		shortName: 'Tooling',
		headline: 'The tools around TanStack apps and packages',
		intro:
			'The workbench around TanStack apps and packages: inspect libraries, scaffold projects, publish packages, and preserve package guidance.',
		topPickId: 'devtools',
		accent: {
			from: 'from-indigo-500',
			to: 'to-orange-500',
			text: 'text-indigo-600 dark:text-indigo-400',
		},
	},
};

export function getCategoryLibraries(slug: CategorySlug): LibrarySlim[] {
	return [...librariesByGroup[slugToGroup[slug]]];
}

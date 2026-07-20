import type { ReactNode } from 'react';
import type { MenuItem } from './config';

export const docsNavTabIds = [
	'home',
	'get-started',
	'tutorial',
	'guides',
	'api',
	'examples',
] as const;

export type DocsNavTabId = (typeof docsNavTabIds)[number];

export const docsNavTabs: Array<{ id: DocsNavTabId; label: string }> = [
	{ id: 'home', label: 'Home' },
	{ id: 'get-started', label: 'Get Started' },
	{ id: 'tutorial', label: 'Tutorial' },
	{ id: 'guides', label: 'Guides' },
	{ id: 'api', label: 'API' },
	{ id: 'examples', label: 'Examples' },
];

function getLabelText(label: ReactNode) {
	return typeof label === 'string' ? label : '';
}

function getFallbackDocsNavTabId(
	group: MenuItem,
	child: MenuItem['children'][number],
): DocsNavTabId {
	const groupLabel = getLabelText(group.label).toLowerCase();
	const childLabel = getLabelText(child.label).toLowerCase();
	const to = child.to.toLowerCase();
	const searchText = `${groupLabel} ${childLabel} ${to}`;

	if (
		child.to === '..' ||
		child.to === './framework' ||
		childLabel === 'home' ||
		childLabel === 'frameworks'
	) {
		return 'home';
	}

	// Community resources now live under the Home tab.
	if (
		child.to.startsWith('http') ||
		searchText.includes('community') ||
		searchText.includes('contributors') ||
		searchText.includes('npm-stats') ||
		searchText.includes('npm stats') ||
		searchText.includes('blog') ||
		searchText.includes('github') ||
		searchText.includes('discord') ||
		searchText.includes('youtube')
	) {
		return 'home';
	}

	if (searchText.includes('example')) {
		return 'examples';
	}

	if (
		to.includes('/api/') ||
		to.startsWith('api/') ||
		to.includes('/reference/') ||
		to.startsWith('reference/') ||
		groupLabel.includes('api') ||
		groupLabel.includes('reference')
	) {
		return 'api';
	}

	if (searchText.includes('tutorial')) {
		return 'tutorial';
	}

	if (
		groupLabel.includes('get started') ||
		groupLabel.includes('getting started') ||
		groupLabel.includes('overview') ||
		childLabel === 'overview' ||
		searchText.includes('installation') ||
		searchText.includes('quick-start') ||
		searchText.includes('quick start') ||
		searchText.includes('introduction')
	) {
		return 'get-started';
	}

	return 'guides';
}

export function getDocsNavTabId(group: MenuItem, child: MenuItem['children'][number]) {
	return child.tab ?? group.tab ?? getFallbackDocsNavTabId(group, child);
}

// A tab's `firstItem` is the destination clicked when the user activates the
// tab. It must point at real docs content, never a utility/special target like
// `..` (library home), `./framework` (framework picker), or external links.
function isDocsTabTarget(to: string) {
	if (to.startsWith('http')) return false;
	if (to === '..' || to === './framework') return false;
	if (to.startsWith('/')) return to.includes('/docs/');
	return true;
}

export function getTabbedMenuConfig(menuConfig: MenuItem[]) {
	return docsNavTabs
		.map((tab) => {
			const groups = menuConfig
				.map((group) => {
					const children = group.children.filter((child) => {
						return getDocsNavTabId(group, child) === tab.id;
					});

					return children.length
						? {
								...group,
								children,
							}
						: undefined;
				})
				.filter((group): group is MenuItem => group !== undefined);

			const children = groups.flatMap((group) => group.children);

			return {
				...tab,
				groups,
				firstItem:
					// The Home tab points at the library landing page (`..`), even though
					// it now also contains community docs (Blog, Contributors, etc.).
					(tab.id === 'home' ? children.find((child) => child.to === '..') : undefined) ??
					children.find((child) => isDocsTabTarget(child.to)) ??
					children.find((child) => !child.to.startsWith('http')),
			};
		})
		.filter((tab) => tab.groups.length);
}

// Matches a menu child's `to` against the current pathname, handling the
// special/absolute internal paths used by the Menu group (e.g. `..`,
// `./framework`, `/$libraryId/$version/docs/...`) in addition to plain
// relative doc paths.
function isChildPathMatch({
	childTo,
	pathname,
	relativePathname,
}: {
	childTo: string;
	pathname: string;
	relativePathname: string;
}) {
	if (childTo === relativePathname) return true;

	if (childTo === '..') {
		return /^\/[^/]+\/[^/]+\/?$/.test(pathname);
	}

	if (childTo === './framework') {
		return pathname.includes('/docs/framework') && !/\/docs\/framework\/[^/]+/.test(pathname);
	}

	if (childTo.includes('/$libraryId/$version/docs/')) {
		const suffix = childTo.split('/docs/')[1];
		return Boolean(suffix) && pathname.includes(`/docs/${suffix}`);
	}

	return false;
}

export function getActiveDocsNavTabId({
	isExample,
	menuConfig,
	pathname,
	relativePathname,
}: {
	isExample: boolean;
	menuConfig: MenuItem[];
	pathname: string;
	relativePathname: string;
}) {
	if (isExample) {
		return 'examples';
	}

	const activeGroup = menuConfig.find((group) =>
		group.children.some((child) =>
			isChildPathMatch({ childTo: child.to, pathname, relativePathname }),
		),
	);
	const activeChild = activeGroup?.children.find((child) =>
		isChildPathMatch({ childTo: child.to, pathname, relativePathname }),
	);

	if (activeGroup && activeChild) {
		return getDocsNavTabId(activeGroup, activeChild);
	}

	if (pathname.includes('/docs/api/') || pathname.includes('/docs/reference/')) {
		return 'api';
	}

	if (pathname.includes('/docs/tutorial')) {
		return 'tutorial';
	}

	if (
		pathname.includes('/docs/community') ||
		pathname.includes('/docs/contributors') ||
		pathname.includes('/docs/npm-stats') ||
		pathname.includes('/docs/blog')
	) {
		return 'home';
	}

	return 'get-started';
}

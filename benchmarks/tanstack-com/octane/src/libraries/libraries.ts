// Base library data - lightweight, stays in main bundle
// Extended library data (with React nodes, testimonials, etc.) is in individual library files

import { redirect } from '@octanejs/tanstack-router';
import type { LibrarySlim, LibraryId } from './types';
import { handleRedirects } from '~/utils/handleRedirects';
export { libraryIds, SIDEBAR_LIBRARY_IDS } from './ids';

export const query: LibrarySlim = {
	id: 'query',
	name: 'TanStack Query',
	cardStyles: 'text-red-500 hover:border-current',
	to: '/query',
	tagline: 'Powerful asynchronous state management, server-state utilities and data fetching',
	description:
		'Powerful asynchronous state management, server-state utilities and data fetching. Fetch, cache, update, and wrangle all forms of async data in your TS/JS, React, Vue, Solid, Svelte, Angular & Lit applications all without touching any "global state"',
	bgStyle: 'bg-red-500',
	borderStyle: 'border-red-500/50',
	textStyle: 'text-red-500',
	textColor: 'text-amber-500',
	colorFrom: 'from-red-500',
	colorTo: 'to-amber-500',
	bgRadial: 'from-red-500 via-red-500/60 to-transparent',
	badge: undefined,
	repo: 'tanstack/query',
	frameworks: ['react', 'preact', 'solid', 'vue', 'svelte', 'angular', 'lit'],
	latestVersion: 'v5',
	latestBranch: 'main',
	corePackageName: '@tanstack/query-core',
	npmPackageNames: ['@tanstack/query-core', 'react-query'],
	availableVersions: ['v5', 'v4', 'v3'],
	scarfId: '53afb586-3934-4624-a37a-e680c1528e17',
	defaultDocs: 'framework/react/overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
	installPath: 'framework/$framework/installation',
	legacyPackages: ['react-query'],
	handleRedirects: (href) => {
		handleRedirects(reactQueryV3List, href, '/query/v3', '/query/latest', 'from=reactQueryV3');

		handleRedirects(
			reactQueryV3RemovedInV5List,
			href,
			'/query/v3',
			'/query/v5',
			'from=reactQueryV3',
		);

		handleRedirects(
			queryCommunityLinks,
			href,
			'/query/latest',
			'/query/latest',
			'from=communityLinks',
		);
	},
};

// Redirect old query v3 docs
// prettier-ignore
const reactQueryV3List = [
    {from: "overview", to: "docs/framework/react/overview"},
    {from: "installation", to: "docs/framework/react/installation"},
    {from: "quick-start", to: "docs/framework/react/quick-start"},
    {from: "devtools", to: "docs/framework/react/devtools"},
    {from: "videos", to: "docs/framework/react/videos"},
    {from: "comparison", to: "docs/framework/react/comparison"},
    {from: "typescript", to: "docs/framework/react/typescript"},
    {from: "graphql", to: "docs/framework/react/graphql"},
    {from: "react-native", to: "docs/framework/react/react-native"},
    {from: "guides/important-defaults", to: "docs/framework/react/guides/important-defaults"},
    {from: "guides/queries", to: "docs/framework/react/guides/queries"},
    {from: "guides/query-keys", to: "docs/framework/react/guides/query-keys"},
    {from: "guides/query-functions", to: "docs/framework/react/guides/query-functions"},
    {from: "guides/network-mode", to: "docs/framework/react/guides/network-mode"},
    {from: "guides/parallel-queries", to: "docs/framework/react/guides/parallel-queries"},
    {from: "guides/dependent-queries", to: "docs/framework/react/guides/dependent-queries"},
    {from: "guides/background-fetching-indicators", to: "docs/framework/react/guides/background-fetching-indicators"},
    {from: "guides/window-focus-refetching", to: "docs/framework/react/guides/window-focus-refetching"},
    {from: "guides/disabling-queries", to: "docs/framework/react/guides/disabling-queries"},
    {from: "guides/query-retries", to: "docs/framework/react/guides/query-retries"},
    {from: "guides/paginated-queries", to: "docs/framework/react/guides/paginated-queries"},
    {from: "guides/infinite-queries", to: "docs/framework/react/guides/infinite-queries"},
    {from: "guides/placeholder-query-data", to: "docs/framework/react/guides/placeholder-query-data"},
    {from: "guides/initial-query-data", to: "docs/framework/react/guides/initial-query-data"},
    {from: "guides/prefetching", to: "docs/framework/react/guides/prefetching"},
    {from: "guides/mutations", to: "docs/framework/react/guides/mutations"},
    {from: "guides/query-invalidation", to: "docs/framework/react/guides/query-invalidation"},
    {from: "guides/invalidations-from-mutations", to: "docs/framework/react/guides/invalidations-from-mutations"},
    {from: "guides/updates-from-mutation-responses", to: "docs/framework/react/guides/updates-from-mutation-responses"},
    {from: "guides/optimistic-updates", to: "docs/framework/react/guides/optimistic-updates"},
    {from: "guides/query-cancellation", to: "docs/framework/react/guides/query-cancellation"},
    {from: "guides/scroll-restoration", to: "docs/framework/react/guides/scroll-restoration"},
    {from: "guides/filters", to: "docs/framework/react/guides/filters"},
    {from: "guides/ssr", to: "docs/framework/react/guides/ssr"},
    {from: "guides/caching", to: "docs/framework/react/guides/caching"},
    {from: "guides/default-query-function", to: "docs/framework/react/guides/default-query-function"},
    {from: "guides/suspense", to: "docs/framework/react/guides/suspense"},
    {from: "guides/testing", to: "docs/framework/react/guides/testing"},
    {from: "guides/does-this-replace-client-state", to: "docs/framework/react/guides/does-this-replace-client-state"},
    {from: "guides/migrating-to-react-query-3", to: "docs/framework/react/guides/migrating-to-react-query-3"},
    {from: "guides/migrating-to-react-query-4", to: "docs/framework/react/guides/migrating-to-react-query-4"},
    {from: "community/tkdodos-blog", to: "docs/framework/react/community/tkdodos-blog"},
    {from: "examples/simple", to: "docs/framework/react/examples/simple"},
    {from: "examples/basic-graphql-request", to: "docs/framework/react/examples/basic-graphql-request"},
    {from: "examples/custom-hooks", to: "docs/framework/react/examples/custom-hooks"},
    {from: "examples/auto-refetching", to: "docs/framework/react/examples/auto-refetching"},
    {from: "examples/focus-refetching", to: "docs/framework/react/examples/focus-refetching"},
    {from: "examples/optimistic-updates", to: "docs/framework/react/examples/optimistic-updates-typescript"},
    {from: "examples/optimistic-updates-typescript", to: "docs/framework/react/examples/optimistic-updates-typescript"},
    {from: "examples/pagination", to: "docs/framework/react/examples/pagination"},
    {from: "examples/load-more-infinite-scroll", to: "docs/framework/react/examples/load-more-infinite-scroll"},
    {from: "examples/suspense", to: "docs/framework/react/examples/suspense"},
    {from: "examples/default-query-function", to: "docs/framework/react/examples/default-query-function"},
    {from: "examples/playground", to: "docs/framework/react/examples/playground"},
    {from: "examples/prefetching", to: "docs/framework/react/examples/prefetching"},
    {from: "examples/star-wars", to: "docs/framework/react/examples/star-wars"},
    {from: "examples/rick-morty", to: "docs/framework/react/examples/rick-morty"},
    {from: "examples/nextjs", to: "docs/framework/react/examples/nextjs"},
    {from: "examples/react-native", to: "docs/framework/react/examples/react-native"},
    {from: "examples/offline", to: "docs/framework/react/examples/offline"},
    {from: "plugins/persistQueryClient", to: "docs/framework/react/plugins/persistQueryClient"},
    {from: "plugins/broadcastQueryClient", to: "docs/framework/react/plugins/broadcastQueryClient"},
    {from: "reference/useQueries", to: "docs/framework/react/reference/useQueries"},
    {from: "reference/useInfiniteQuery", to: "docs/framework/react/reference/useInfiniteQuery"},
    {from: "reference/useMutation", to: "docs/framework/react/reference/useMutation"},
    {from: "reference/useIsFetching", to: "docs/framework/react/reference/useIsFetching"},
    {from: "reference/useIsMutating", to: "docs/framework/react/reference/useIsMutating"},
    {from: "reference/QueryClientProvider", to: "docs/framework/react/reference/QueryClientProvider"},
    {from: "reference/useQueryClient", to: "docs/framework/react/reference/useQueryClient"},
    {from: "reference/QueryCache", to: "docs/reference/QueryCache"},
    {from: "reference/MutationCache", to: "docs/reference/MutationCache"},
    {from: "reference/QueryObserver", to: "docs/reference/QueryObserver"},
    {from: "reference/InfiniteQueryObserver", to: "docs/reference/InfiniteQueryObserver"},
    {from: "reference/QueriesObserver", to: "docs/reference/QueriesObserver"},
    {from: "reference/QueryErrorResetBoundary", to: "docs/framework/react/reference/QueryErrorResetBoundary"},
    {from: "reference/useQueryErrorResetBoundary", to: "docs/framework/react/reference/useQueryErrorResetBoundary"},
    {from: "reference/focusManager", to: "docs/reference/focusManager"},
    {from: "reference/onlineManager", to: "docs/reference/onlineManager"},
    {from: "reference/hydration", to: "docs/framework/react/reference/hydration"},
    {from: "reference/useQuery", to: "docs/framework/react/reference/useQuery"},
    {from: "reference/QueryClient", to: "docs/reference/QueryClient"},
    {from: "examples/basic", to: "docs/framework/react/examples/basic"},
    // {from: '',to: ''},
  ];

/**
  Features that have been removed in v5
*/
// prettier-ignore
const reactQueryV3RemovedInV5List = [
    {from: "guides/custom-logger", to: "docs/framework/react/guides/migrating-to-v5#the-deprecated-custom-logger-has-been-removed"},
    {from: "plugins/createWebStoragePersister", to: "docs/framework/react/guides/migrating-to-react-query-4#persistqueryclient-and-the-corresponding-persister-plugins-are-no-longer-experimental-and-have-been-renamed"},
    {from: "plugins/createAsyncStoragePersister", to: "docs/framework/react/guides/migrating-to-react-query-4#persistqueryclient-and-the-corresponding-persister-plugins-are-no-longer-experimental-and-have-been-renamed"},
];

/*
Community resources section to new location
*/
// prettier-ignore
const queryCommunityLinks = [
  {
    from: 'docs/framework/react/community/tkdodos-blog',
    to: 'docs/community-resources',
  },
  {
    from: 'docs/framework/react/community/community-projects',
    to: 'docs/community-resources',
  },
  {
    from: 'docs/framework/solid/community/tkdodos-blog',
    to: 'docs/community-resources',
  },
  {
    from: 'docs/framework/solid/community/community-projects',
    to: 'docs/community-resources',
  },
  {
    from: 'docs/framework/vue/community/tkdodos-blog',
    to: 'docs/community-resources',
  },
  {
    from: 'docs/framework/vue/community/community-projects',
    to: 'docs/community-resources',
  },
  {
    from: 'docs/framework/react/videos',
    to: 'docs/community-resources',
  },
];

export const router: LibrarySlim = {
	id: 'router',
	name: 'TanStack Router',
	installPath: 'framework/$framework/quick-start',
	cardStyles: 'text-emerald-500 dark:text-emerald-400 hover:border-current',
	to: '/router',
	tagline: 'Type-safe Routing for React and Solid applications',
	description:
		'A powerful React router for client-side and full-stack react applications. Fully type-safe APIs, first-class search-params for managing state in the URL and seamless integration with the existing React ecosystem.',
	bgStyle: 'bg-emerald-500',
	borderStyle: 'border-emerald-500/50',
	textStyle: 'text-emerald-500 dark:text-emerald-400',
	textColor: 'text-emerald-500 dark:text-emerald-400',
	colorFrom: 'from-emerald-500',
	colorTo: 'to-lime-600',
	bgRadial: 'from-emerald-500 via-lime-600/50 to-transparent',
	badge: undefined,
	repo: 'tanstack/router',
	frameworks: ['react', 'solid'],
	corePackageName: '@tanstack/router-core',
	npmPackageNames: ['@tanstack/router-core', 'react-location'],
	latestVersion: 'v1',
	latestBranch: 'main',
	availableVersions: ['v1'],
	scarfId: '3d14fff2-f326-4929-b5e1-6ecf953d24f4',
	docsRoot: 'docs/router',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
	legacyPackages: ['react-location'],
	hideCodesandboxUrl: true,
	handleRedirects: (href) => {
		if (href.includes('router/latest/docs/framework/react/start')) {
			throw redirect({
				href: href.replace(
					'router/latest/docs/framework/react/start',
					'start/latest/docs/framework/react',
				),
			});
		}

		if (href.includes('/router/latest/docs/framework/react/examples/start')) {
			throw redirect({
				href: href.replace(
					'router/latest/docs/framework/react/examples/start',
					'start/latest/docs/framework/react/examples/start',
				),
			});
		}

		// Rewrite framework-specific guides to generic guides
		// e.g. /router/latest/docs/framework/react/overview -> /router/latest/docs/overview
		// e.g. /router/latest/docs/framework/react/xyz -> /router/latest/docs/xyz
		// e.g. /router/latest/docs/framework/react/xyz/ssr -> /router/latest/docs/xyz/ssr
		// However, examples should still point to the framework-specific examples
		// e.g. /router/latest/docs/framework/react/examples/ssr -> /router/latest/docs/framework/react/examples/ssr
		// e.g. /router/latest/docs/framework/react/examples/xyz -> /router/latest/docs/framework/react/examples/xyz
		const frameworkMatch = href.match(/\/router\/([^/]+)\/docs\/framework\/[^/]+\/(.+)/);
		if (frameworkMatch && !href.includes('/examples/')) {
			const [, version, restPath] = frameworkMatch;
			throw redirect({
				href: `/router/${version}/docs/${restPath}`,
			});
		}
	},
};

export const start: LibrarySlim = {
	id: 'start',
	name: 'TanStack Start',
	cardStyles: 'text-cyan-500 dark:text-white-400 hover:border-current',
	to: '/start',
	tagline: 'Full-stack Framework powered by TanStack Router for React and Solid',
	description:
		'Full-document SSR, Streaming, Server Functions, bundling and more, powered by TanStack Router and Vite - Ready to deploy to your favorite hosting provider.',
	bgStyle: 'bg-cyan-500',
	borderStyle: 'border-cyan-500/50',
	textStyle: 'text-cyan-500',
	textColor: 'text-cyan-600',
	colorFrom: 'from-teal-500',
	colorTo: 'to-cyan-500',
	bgRadial: 'from-cyan-500 via-teal-600/50 to-transparent',
	badge: 'RC',
	repo: 'tanstack/router',
	frameworks: ['react', 'solid'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	corePackageName: '@tanstack/start-client-core',
	npmPackageNames: ['@tanstack/start-client-core'],
	scarfId: 'b6e2134f-e805-401d-95c3-2a7765d49a3d',
	docsRoot: 'docs/start',
	defaultDocs: 'framework/react/overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
	installPath: 'framework/$framework/build-from-scratch',
	embedEditor: 'codesandbox',
	showNetlifyUrl: true,
	showCloudflareUrl: true,
	showRailwayUrl: true,
	hideStackblitzUrl: true,
};

export const table: LibrarySlim = {
	id: 'table',
	name: 'TanStack Table',
	cardStyles: 'text-blue-500 hover:border-current',
	to: '/table',
	tagline: 'Headless UI for building powerful tables & datagrids',
	description:
		'Supercharge your tables or build a datagrid from scratch in any framework while retaining 100% control over markup and styles.',
	bgStyle: 'bg-blue-500',
	borderStyle: 'border-blue-500/50',
	textStyle: 'text-blue-500',
	textColor: 'text-blue-600',
	colorFrom: 'from-cyan-500',
	colorTo: 'to-blue-600',
	bgRadial: 'from-cyan-500 via-blue-600/50 to-transparent',
	badge: undefined,
	repo: 'tanstack/table',
	frameworks: [
		'angular',
		'ember',
		'react',
		'preact',
		'solid',
		'svelte',
		'vue',
		'qwik',
		'lit',
		'alpine',
		'vanilla',
	],
	latestVersion: 'v8',
	latestBranch: 'main',
	availableVersions: ['v8', 'beta'],
	scarfId: 'dc8b39e1-3fe9-4f3a-8e56-d4e2cf420a9e',
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
	corePackageName: '@tanstack/table-core',
	npmPackageNames: ['@tanstack/table-core', 'react-table'],
	legacyPackages: ['react-table'],
	handleRedirects: (href) => {
		handleRedirects(reactTableV7List, href, '/table/v7', '/table/v8', 'from=reactTableV7');
	},
};

// prettier-ignore
const reactTableV7List = [
    {from: 'docs/api/overview',to: 'docs/overview',},
    {from: 'docs/api/useColumnOrder',to: 'docs/api/features/column-ordering',},
    {from: 'docs/api/useExpanded',to: 'docs/api/features/expanding',},
    {from: 'docs/api/useFilters',to: 'docs/api/features/filters',},
    {from: 'docs/api/useGlobalFilter',to: 'docs/api/features/filters',},
    {from: 'docs/api/useGroupBy',to: 'docs/api/features/grouping',},
    {from: 'docs/api/usePagination',to: 'docs/api/features/pagination',},
    {from: 'docs/api/useResizeColumns',to: 'docs/api/features/column-sizing',},
    {from: 'docs/api/useRowSelect',to: 'docs/api/features/row-selection',},
    {from: 'docs/api/useSortBy',to: 'docs/api/features/sorting',},
    {from: 'docs/api/useTable',to: 'docs/guide/tables',},
    {from: 'docs/examples/basic',to: 'docs/framework/react/examples/basic',},
    {from: 'docs/examples/filtering',to: 'docs/framework/react/examples/filters',},
    {from: 'docs/examples/footers',to: 'docs/framework/react/examples/basic',},
    {from: 'docs/examples/grouping',to: 'docs/framework/react/examples/grouping',},
    {from: 'docs/examples/pagination-controlled',to: 'docs/framework/react/examples/pagination-controlled',},
    {from: 'docs/examples/pagination',to: 'docs/framework/react/examples/pagination',},
    {from: 'docs/examples/sorting',to: 'docs/framework/react/examples/sorting',},
    {from: 'docs/examples/row-selection',to: 'docs/framework/react/examples/row-selection',},
    {from: 'docs/examples/row-selection-with-pagination',to: 'docs/framework/react/examples/row-selection',},
    {from: 'docs/examples/expanding',to: 'docs/framework/react/examples/expanding',},
    {from: 'docs/examples/editable-data',to: 'docs/framework/react/examples/editable-data',},
    {from: 'docs/examples/column-ordering',to: 'docs/framework/react/examples/column-ordering',},
    {from: 'docs/examples/column-hiding',to: 'docs/framework/react/examples/column-visibility',},
    {from: 'docs/examples/column-resizing',to: 'docs/framework/react/examples/column-sizing',},
    {from: 'docs/installation',to: 'docs/installation',},
    {from: 'docs/overview',to: 'docs/introduction',},
    {from: 'docs/quick-start',to: 'docs/overview',},
];

export const form: LibrarySlim = {
	id: 'form',
	name: 'TanStack Form',
	cardStyles: 'text-yellow-500 hover:border-current',
	to: '/form',
	tagline: 'Headless UI for building performant and type-safe forms',
	description:
		'Headless, performant, and type-safe form state management for TS/JS, React, Preact, Vue, Angular, Solid, Lit and Svelte.',
	bgStyle: 'bg-yellow-500',
	borderStyle: 'border-yellow-500/50',
	textStyle: 'text-yellow-500',
	textColor: 'text-yellow-600',
	colorFrom: 'from-yellow-500',
	colorTo: 'to-yellow-600',
	bgRadial: 'from-yellow-500 via-yellow-600/50 to-transparent',
	badge: 'new',
	repo: 'tanstack/form',
	corePackageName: '@tanstack/form-core',
	npmPackageNames: ['@tanstack/form-core'],
	frameworks: ['react', 'preact', 'vue', 'angular', 'solid', 'lit', 'svelte'],
	latestVersion: 'v1',
	latestBranch: 'main',
	availableVersions: ['v1'],
	scarfId: '72ec4452-5d77-427c-b44a-57515d2d83aa',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const virtual: LibrarySlim = {
	id: 'virtual',
	name: 'TanStack Virtual',
	cardStyles: 'text-purple-500 hover:border-current',
	to: '/virtual',
	tagline: 'Headless UI for Virtualizing Large Element Lists',
	description:
		'Virtualize only the visible content for massive scrollable DOM nodes at 60FPS in TS/JS, React, Vue, Solid, Svelte, Lit, Angular & Marko while retaining 100% control over markup and styles.',
	bgStyle: 'bg-purple-500',
	borderStyle: 'border-purple-500/50',
	textStyle: 'text-purple-500',
	textColor: 'text-purple-600',
	colorFrom: 'from-purple-500',
	colorTo: 'to-violet-600',
	bgRadial: 'from-purple-500 via-violet-600/50 to-transparent',
	badge: undefined,
	repo: 'tanstack/virtual',
	frameworks: ['react', 'solid', 'vue', 'svelte', 'lit', 'angular', 'marko'],
	corePackageName: '@tanstack/virtual-core',
	npmPackageNames: ['@tanstack/virtual-core', 'react-virtual'],
	latestVersion: 'v3',
	latestBranch: 'main',
	availableVersions: ['v3'],
	scarfId: '32372eb1-91e0-48e7-8df1-4808a7be6b94',
	defaultDocs: 'introduction',
	legacyPackages: ['react-virtual'],
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const ranger: LibrarySlim = {
	id: 'ranger',
	name: 'TanStack Ranger',
	cardStyles: 'text-black dark:text-gray-100 hover:border-current',
	to: '/ranger',
	tagline: 'Headless range and multi-range slider utilities.',
	description:
		'Headless, lightweight, and extensible primitives for building range and multi-range sliders.',
	bgStyle: 'bg-black dark:bg-gray-100',
	borderStyle: 'border-black/50 dark:border-gray-100/50',
	textStyle: 'text-black dark:text-gray-100',
	textColor: 'text-black dark:text-gray-100',
	badgeTextStyle: 'text-white dark:text-gray-900',
	colorFrom: 'from-black dark:from-gray-100',
	colorTo: 'to-gray-600 dark:to-gray-400',
	accentColorFrom: 'from-blue-500',
	accentColorTo: 'to-blue-700',
	accentTextColor: 'text-blue-600 dark:text-blue-400',
	bgRadial: 'from-black via-gray-600/50 to-transparent dark:from-gray-100 dark:via-gray-400/50',
	badge: undefined,
	repo: 'tanstack/ranger',
	frameworks: ['react'],
	corePackageName: '@tanstack/ranger',
	npmPackageNames: ['@tanstack/ranger', 'react-ranger'],
	legacyPackages: ['react-ranger'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	scarfId: 'dd278e06-bb3f-420c-85c6-6e42d14d8f61',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const store: LibrarySlim = {
	id: 'store',
	name: 'TanStack Store',
	cardStyles: 'text-twine-500 dark:text-twine-400 hover:border-current',
	to: '/store',
	tagline: 'Framework agnostic data store with reactive framework adapters',
	description:
		'The immutable-reactive data store that powers the core of TanStack libraries and their framework adapters.',
	bgStyle: 'bg-twine-700',
	borderStyle: 'border-twine-700/50',
	textStyle: 'text-twine-500',
	textColor: 'text-twine-700',
	colorFrom: 'from-twine-500',
	colorTo: 'to-twine-700',
	bgRadial: 'from-twine-500 via-twine-700/50 to-transparent',
	badge: 'alpha',
	repo: 'tanstack/store',
	frameworks: ['react', 'preact', 'solid', 'svelte', 'vue', 'angular', 'lit'],
	corePackageName: '@tanstack/store',
	npmPackageNames: ['@tanstack/store'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	scarfId: '302d0fef-cb3f-43c6-b45c-f055b9745edb',
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const pacer: LibrarySlim = {
	id: 'pacer',
	name: 'TanStack Pacer',
	cardStyles: 'text-lime-500 dark:text-lime-400 hover:border-current',
	to: '/pacer',
	tagline:
		'Framework agnostic debouncing, throttling, rate limiting, queuing, and batching utilities',
	description:
		"Optimize your application's performance with TanStack Pacer's core primitives: Debouncing, Throttling, Rate Limiting, Queuing, and Batching.",
	bgStyle: 'bg-lime-600',
	borderStyle: 'border-lime-700/50',
	textStyle: 'text-lime-500',
	textColor: 'text-lime-700',
	colorFrom: 'from-lime-500',
	colorTo: 'to-lime-700',
	bgRadial: 'from-lime-500 via-lime-700/50 to-transparent',
	badge: 'beta',
	repo: 'tanstack/pacer',
	frameworks: ['react', 'preact', 'solid', 'angular', 'vanilla'],
	corePackageName: '@tanstack/pacer',
	npmPackageNames: ['@tanstack/pacer', '@tanstack/pacer-lite'],
	legacyPackages: ['@tanstack/pacer-lite'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	scarfId: '302d0fef-cb3f-43c6-b45c-f055b9745edb',
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
	handleRedirects: (href) => {
		if (
			/\/pacer\/[^/]+\/docs\/framework\/angular\/examples\/injectAsyncRateLimitedCallback/.test(
				href,
			)
		) {
			throw redirect({
				href: href.replace('injectAsyncRateLimitedCallback', 'injectAsyncRateLimiter'),
			});
		}
	},
};

export const hotkeys: LibrarySlim = {
	id: 'hotkeys',
	name: 'TanStack Hotkeys',
	cardStyles: 'text-rose-500 dark:text-rose-400 hover:border-current',
	to: '/hotkeys',
	tagline: 'Type-safe keyboard shortcuts, sequences, and key state tracking for your apps',
	description:
		'A type-safe, cross-platform hotkey library with sequence detection, key state tracking, hotkey recording, and framework adapters for React and more.',
	badge: 'alpha',
	bgStyle: 'bg-rose-500',
	borderStyle: 'border-rose-500/50',
	textStyle: 'text-rose-500 dark:text-rose-400',
	textColor: 'text-rose-600 dark:text-rose-400',
	colorFrom: 'from-rose-500',
	colorTo: 'to-rose-700',
	bgRadial: 'from-rose-500 via-rose-700/50 to-transparent',
	repo: 'tanstack/hotkeys',
	frameworks: ['vanilla', 'react', 'preact', 'solid', 'svelte', 'vue', 'angular', 'lit'],
	corePackageName: '@tanstack/hotkeys',
	npmPackageNames: ['@tanstack/hotkeys'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const db: LibrarySlim = {
	id: 'db',
	name: 'TanStack DB',
	cardStyles: 'text-orange-500 dark:text-orange-400 hover:border-current',
	to: '/db',
	tagline: 'The reactive client-first store for your API',
	description:
		'TanStack DB gives you a reactive, client-first store for your API data with collections, live queries and optimistic mutations that keep your UI reactive, consistent and blazing fast 🔥',
	badge: 'beta',
	bgStyle: 'bg-orange-500',
	borderStyle: 'border-orange-700/50',
	textStyle: 'text-orange-500',
	textColor: 'text-orange-700',
	colorFrom: 'from-orange-500',
	colorTo: 'to-orange-700',
	bgRadial: 'from-orange-500 via-orange-700/50 to-transparent',
	repo: 'tanstack/db',
	frameworks: ['react', 'vue', 'solid', 'svelte', 'vanilla'],
	corePackageName: '@tanstack/db',
	npmPackageNames: ['@tanstack/db', '@tanstack/react-db'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	scarfId: '302d0fef-cb3f-43c6-b45c-f055b9745edb',
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const ai: LibrarySlim = {
	id: 'ai',
	name: 'TanStack AI',
	cardStyles: 'text-pink-500 dark:text-pink-400 hover:border-current',
	to: '/ai',
	tagline: 'A powerful, open-source AI SDK with a unified interface across multiple providers',
	description:
		'A powerful, open-source AI SDK with a unified interface across multiple providers. No vendor lock-in, no proprietary formats, just clean TypeScript and honest open source.',
	badge: 'beta',
	bgStyle: 'bg-pink-500',
	borderStyle: 'border-pink-700/50',
	textStyle: 'text-pink-500',
	textColor: 'text-pink-700',
	colorFrom: 'from-pink-500',
	colorTo: 'to-pink-700',
	bgRadial: 'from-pink-500 via-pink-700/50 to-transparent',
	repo: 'tanstack/ai',
	frameworks: ['react', 'vue', 'solid', 'svelte', 'preact', 'vanilla'],
	corePackageName: '@tanstack/ai-client',
	npmPackageNames: ['@tanstack/ai-client'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	defaultDocs: 'getting-started/overview',
	frameworkPackageNames: {
		react: '@tanstack/ai-react',
		vue: '@tanstack/ai-vue',
		solid: '@tanstack/ai-solid',
		svelte: '@tanstack/ai-svelte',
		preact: '@tanstack/ai-preact',
		vanilla: '@tanstack/ai-client',
	},
	frameworkDocs: {
		react: 'getting-started/quick-start',
		vue: 'getting-started/quick-start-vue',
		solid: 'api/ai-solid',
		svelte: 'getting-started/quick-start-svelte',
		preact: 'api/ai-preact',
		vanilla: 'api/ai-client',
	},
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const intent: LibrarySlim = {
	id: 'intent',
	name: 'TanStack Intent',
	cardStyles: 'text-sky-500 dark:text-sky-400 hover:border-current',
	to: '/intent',
	tagline: 'Ship Agent Skills with your npm Packages',
	description:
		"Generate, validate, and ship Agent Skills alongside your library — versioned knowledge that agents discover automatically from node_modules. Skills live in each library's repo and update when the package updates.",
	badge: 'alpha',
	bgStyle: 'bg-sky-500',
	borderStyle: 'border-sky-500/50',
	textStyle: 'text-sky-500 dark:text-sky-400',
	textColor: 'text-sky-600 dark:text-sky-400',
	colorFrom: 'from-sky-500',
	colorTo: 'to-sky-700',
	bgRadial: 'from-sky-500 via-sky-700/50 to-transparent',
	repo: 'tanstack/intent',
	frameworks: [],
	corePackageName: '@tanstack/intent',
	npmPackageNames: ['@tanstack/intent'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const config: LibrarySlim = {
	id: 'config',
	name: 'TanStack Config',
	cardStyles: 'text-black dark:text-gray-100 hover:border-current',
	to: '/config',
	tagline:
		'Configuration and tools for publishing and maintaining high-quality JavaScript packages',
	description:
		'Opinionated tooling to lint, build, test, version, and publish JS/TS packages — minimal config, consistent results.',
	bgStyle: 'bg-black dark:bg-gray-100',
	borderStyle: 'border-black/50 dark:border-gray-100/50',
	textStyle: 'text-black dark:text-gray-100',
	textColor: 'text-black dark:text-gray-100',
	badgeTextStyle: 'text-white dark:text-gray-900',
	colorFrom: 'from-black dark:from-gray-100',
	colorTo: 'to-gray-600 dark:to-gray-400',
	accentColorFrom: 'from-blue-500',
	accentColorTo: 'to-blue-700',
	accentTextColor: 'text-blue-600 dark:text-blue-400',
	bgRadial: 'from-black via-gray-600/50 to-transparent dark:from-gray-100 dark:via-gray-400/50',
	badge: undefined,
	repo: 'tanstack/config',
	frameworks: [],
	corePackageName: '@tanstack/config',
	npmPackageNames: ['@tanstack/config'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const devtools: LibrarySlim = {
	id: 'devtools',
	name: 'TanStack Devtools',
	cardStyles: 'text-black dark:text-gray-100 hover:border-current',
	to: '/devtools',
	tagline: 'Centralized devtools panel for TanStack libraries and other custom devtools',
	description:
		'A unified devtools panel that houses all TanStack devtools and allows you to create and integrate your own custom devtools.',
	badge: 'alpha',
	bgStyle: 'bg-black dark:bg-gray-100',
	borderStyle: 'border-black/50 dark:border-gray-100/50',
	textStyle: 'text-black dark:text-gray-100',
	textColor: 'text-black dark:text-gray-100',
	colorFrom: 'from-black dark:from-gray-100',
	colorTo: 'to-gray-600 dark:to-gray-400',
	accentColorFrom: 'from-blue-500',
	accentColorTo: 'to-blue-700',
	accentTextColor: 'text-blue-600 dark:text-blue-400',
	badgeTextStyle: 'text-white dark:text-gray-900',
	bgRadial: 'from-black via-gray-600/50 to-transparent dark:from-gray-100 dark:via-gray-400/50',
	repo: 'tanstack/devtools',
	frameworks: ['react', 'preact', 'solid', 'vue', 'svelte', 'angular', 'vanilla'],
	corePackageName: '@tanstack/devtools',
	npmPackageNames: ['@tanstack/devtools', '@tanstack/react-devtools'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
	handleRedirects: (href) => {
		if (/\/devtools\/[^/]+\/docs\/framework\/solif\//.test(href)) {
			throw redirect({
				href: href.replace(
					/\/devtools\/([^/]+)\/docs\/framework\/solif\//,
					'/devtools/$1/docs/framework/solid/',
				),
			});
		}
	},
};

export const mcp: LibrarySlim = {
	id: 'mcp',
	name: 'TanStack MCP',
	cardStyles: 'text-black dark:text-gray-100 hover:border-current',
	to: '/mcp',
	tagline: 'AI-powered access to TanStack documentation',
	description:
		'Connect your AI assistant to TanStack documentation. Search docs, fetch pages, and explore the ecosystem programmatically via the Model Context Protocol.',
	badge: 'alpha',
	bgStyle: 'bg-black dark:bg-gray-100',
	borderStyle: 'border-black/50 dark:border-gray-100/50',
	textStyle: 'text-black dark:text-gray-100',
	textColor: 'text-black dark:text-gray-100',
	colorFrom: 'from-black dark:from-gray-100',
	colorTo: 'to-gray-600 dark:to-gray-400',
	accentColorFrom: 'from-blue-500',
	accentColorTo: 'to-blue-700',
	accentTextColor: 'text-blue-600 dark:text-blue-400',
	badgeTextStyle: 'text-white dark:text-gray-900',
	bgRadial: 'from-black via-gray-600/50 to-transparent dark:from-gray-100 dark:via-gray-400/50',
	repo: 'tanstack/tanstack.com',
	frameworks: [],
	latestVersion: 'v1',
	latestBranch: 'main',
	availableVersions: ['v1'],
	visible: false,
	handleRedirects: (href: string) => {
		// All /mcp routes redirect to the CLI MCP migration guide
		if (/\/mcp(\/|$)/.test(href)) {
			throw redirect({ href: '/cli/latest/docs/mcp-migration' });
		}
	},
};

export const cli: LibrarySlim = {
	id: 'cli',
	name: 'TanStack CLI',
	cardStyles: 'text-indigo-500 dark:text-indigo-400 hover:border-current',
	to: '/cli',
	tagline: 'CLI and project scaffolding toolkit for TanStack',
	description:
		'A CLI toolkit for TanStack. Create and customize TanStack Start apps, search docs, inspect add-ons, and generate project changes with current TanStack context.',
	badge: 'alpha',
	bgStyle: 'bg-indigo-500',
	borderStyle: 'border-indigo-500/50',
	textStyle: 'text-indigo-500 dark:text-indigo-400',
	textColor: 'text-indigo-600 dark:text-indigo-400',
	colorFrom: 'from-indigo-500',
	colorTo: 'to-violet-600',
	bgRadial: 'from-indigo-500 via-violet-600/50 to-transparent',
	repo: 'tanstack/cli',
	frameworks: [],
	corePackageName: '@tanstack/cli',
	npmPackageNames: ['@tanstack/cli'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	defaultDocs: 'overview',
	sitemap: {
		includeLandingPage: true,
		includeDocsPages: true,
	},
};

export const workflow: LibrarySlim = {
	id: 'workflow',
	name: 'TanStack Workflow',
	cardStyles: 'text-blue-800 dark:text-blue-400 hover:border-current',
	to: '/workflow',
	tagline: 'Durable, type-safe workflow orchestration for TypeScript',
	description:
		'Build resilient multi-step workflows with typed inputs, durable execution, retries, and observable state for long-running application processes.',
	badge: 'alpha',
	bgStyle: 'bg-blue-900',
	borderStyle: 'border-blue-900/50',
	textStyle: 'text-blue-800 dark:text-blue-400',
	textColor: 'text-blue-900 dark:text-blue-400',
	colorFrom: 'from-blue-800',
	colorTo: 'to-blue-600',
	bgRadial: 'from-blue-800 via-blue-700/50 to-transparent',
	repo: 'tanstack/workflow',
	frameworks: [],
	corePackageName: '@tanstack/workflow',
	npmPackageNames: ['@tanstack/workflow'],
	latestVersion: 'v0',
	latestBranch: 'main',
	availableVersions: ['v0'],
	defaultDocs: 'overview',
	visible: false,
};

export const libraries: LibrarySlim[] = [
	start,
	router,
	query,
	table,
	form,
	db,
	ai,
	intent,
	virtual,
	pacer,
	hotkeys,
	store,
	ranger,
	config,
	devtools,
	mcp,
	cli,
	workflow,
	{
		id: 'react-charts',
		name: 'React Charts',
		repo: 'tanstack/react-charts',
		to: undefined,
		tagline: '',
		cardStyles: '',
		bgStyle: '',
		borderStyle: '',
		textStyle: '',
		colorFrom: '',
		colorTo: '',
		badge: undefined,
		frameworks: [],
		latestVersion: '',
		availableVersions: [],
	},
	{
		id: 'create-tsrouter-app',
		name: 'Create TS Router App',
		repo: 'tanstack/create-tsrouter-app',
		to: undefined,
		tagline: '',
		cardStyles: '',
		bgStyle: '',
		borderStyle: '',
		textStyle: '',
		colorFrom: '',
		colorTo: '',
		badge: undefined,
		frameworks: [],
		latestVersion: '',
		availableVersions: [],
	},
];

export type PublicLibrarySlim = LibrarySlim & {
	to: string;
};

export function isPublicLibrary(library: LibrarySlim): library is PublicLibrarySlim {
	return typeof library.to === 'string' && library.to.startsWith('/') && library.visible !== false;
}

export const publicLibraries = libraries.filter(isPublicLibrary);

export const librariesByGroup = {
	framework: [start, router],
	state: [query, db, store, ai],
	headlessUI: [table, form, hotkeys],
	performance: [virtual, pacer],
	tooling: [devtools, config, cli, intent],
};

export const librariesGroupNamesMap = {
	framework: 'Framework',
	state: 'Data & State Management',
	headlessUI: 'UI & UX',
	performance: 'Performance',
	tooling: 'Tooling',
};

export function findLibrary(id: string): LibrarySlim | undefined {
	return libraries.find((d) => d.id === id);
}

export function getLibrary(id: LibraryId): LibrarySlim {
	const library = libraries.find((d) => d.id === id);
	if (!library) {
		throw new Error(`Library with id "${id}" not found!`);
	}
	return library;
}

import { useEffect, useState } from 'octane';
import {
	Body,
	Head,
	HeadContent,
	Html,
	Scripts,
	createRootRouteWithContext,
	defaultStringifySearch,
	useMatches,
	useRouterState,
} from '@octanejs/tanstack-router';
import { QueryClient } from '@octanejs/tanstack-query';
import { createThemeCss, type HighlightTheme } from '@tanstack/highlight/theme';
import { auroraXTheme } from '@tanstack/highlight/themes/aurora-x';
import { githubLightTheme } from '@tanstack/highlight/themes/github-light';
import '~/styles/app.css';
import { canonicalUrl, getCanonicalPath, seo, shouldIndexPath } from '~/utils/seo';
import ogImage from '~/images/og.png';
import { NotFound } from '~/components/NotFound.tsrx';
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary.tsrx';
import { SearchProvider } from '~/contexts/SearchContext.tsrx';
import { ToastProvider } from '~/components/ToastProvider.tsrx';
import { LoginModalProvider } from '~/contexts/LoginModalContext.tsrx';

import { Spinner } from '~/components/Spinner.tsrx';
import { ThemeProvider, useHtmlClass } from '~/components/ThemeProvider.tsrx';
import { Navbar } from '~/components/Navbar.tsrx';
import { THEME_COLORS } from '~/utils/utils';
import { createPartnerPlacementSessionSeed } from '~/utils/partner-placement';
import { twMerge } from 'tailwind-merge';

const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('theme')||'auto';var v=['light','dark','auto'].includes(t)?t:'auto';var r=v==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):v;document.documentElement.classList.add(r);if(v==='auto')document.documentElement.classList.add('auto');document.documentElement.style.colorScheme=r}catch(e){var r=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.add(r,'auto');document.documentElement.style.colorScheme=r}})()`;
// Bench delta: Google Analytics bootstrap + page-view tracking removed
// (third-party network traffic, not app behavior).
// Octane delta: the DEV-only TanStack Devtools mount (LazyAppDevtools behind
// OptionalDevtoolsBoundary in the react flavor) is omitted — the devtools
// packages are React-host-only and the benchmark runs production builds.
const DOCUMENT_CACHE_HEADERS = {
	'Cache-Control': 'public, max-age=0, must-revalidate',
	'Cloudflare-CDN-Cache-Control': 'no-store',
};
const tanstackNeutralDarkTheme = {
	...auroraXTheme,
	background: '#111111',
	foreground: '#d4d4d4',
	name: 'tanstack-neutral-dark',
	tokens: {
		...auroraXTheme.tokens,
		comment: '#a3a3a3',
		meta: '#737373',
		token: '#d4d4d4',
	},
} satisfies HighlightTheme;
const HIGHLIGHT_THEME_CSS = createThemeCss({
	light: githubLightTheme,
	dark: tanstackNeutralDarkTheme,
	darkSelector: '.dark',
});

type CanonicalHeadMatch = {
	pathname: string;
	search: Record<string, unknown>;
	staticData?: {
		includeSearchInCanonical?: boolean;
	};
};

function getCanonicalHeadTags(matches: ReadonlyArray<CanonicalHeadMatch>): {
	links: Array<Record<string, unknown>>;
	meta: Array<Record<string, unknown>>;
} {
	const lastMatch = matches[matches.length - 1];
	const canonicalPath = lastMatch?.pathname ?? '/';
	const includeSearchInCanonical = matches.some(
		(match) => match.staticData?.includeSearchInCanonical === true,
	);
	const canonicalSearch =
		includeSearchInCanonical && lastMatch ? defaultStringifySearch(lastMatch.search) : '';
	const preferredCanonicalPath = getCanonicalPath(canonicalPath);
	const pageUrl = canonicalUrl(preferredCanonicalPath ?? canonicalPath, canonicalSearch);

	return {
		links: preferredCanonicalPath
			? [
					{
						rel: 'canonical',
						href: canonicalUrl(preferredCanonicalPath, canonicalSearch),
					},
				]
			: [],
		meta: [
			{ property: 'og:url', content: pageUrl },
			{ name: 'twitter:url', content: pageUrl },
			...(!shouldIndexPath(canonicalPath)
				? [
						{ name: 'robots', content: 'noindex, nofollow' },
					]
				: []),
		],
	};
}

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	loader: () => {
		return {
			partnerPlacementSessionSeed: createPartnerPlacementSessionSeed(),
		};
	},
	head: ({ matches }) => {
		const canonicalHeadTags = getCanonicalHeadTags(matches);

		return {
			meta: [
				{ charSet: 'utf-8' },
				{
					name: 'viewport',
					content: 'width=device-width, initial-scale=1',
				},
				{
					name: 'theme-color',
					content: THEME_COLORS.light,
					media: '(prefers-color-scheme: light)',
				},
				{
					name: 'theme-color',
					content: THEME_COLORS.dark,
					media: '(prefers-color-scheme: dark)',
				},
				...seo({
					title: 'TanStack | High Quality Open-Source Software for Web Developers',
					description: `Headless, type-safe, powerful utilities for complex workflows like Data Management, Data Visualization, Charts, Tables, and UI Components.`,
					image: `https://tanstack.com${ogImage}`,
					keywords: 'tanstack,react,reactjs,react query,react table,open source,open source software,oss,software',
				}),
				...canonicalHeadTags.meta,
			],
			links: [
				...canonicalHeadTags.links,
				{
					rel: 'preload',
					href: '/fonts/Inter-latin.woff2',
					as: 'font',
					type: 'font/woff2',
					crossOrigin: 'anonymous',
				},
				{
					rel: 'apple-touch-icon',
					sizes: '180x180',
					href: '/apple-touch-icon.png',
				},
				{
					rel: 'icon',
					type: 'image/png',
					sizes: '32x32',
					href: '/favicon-32x32.png',
				},
				{
					rel: 'icon',
					type: 'image/png',
					sizes: '16x16',
					href: '/favicon-16x16.png',
				},
				{
					rel: 'manifest',
					href: '/site.webmanifest',
					color: '#fffff',
				},
				{
					rel: 'icon',
					href: '/favicon.ico',
				},
			],
			// The react flavor renders these two inline in the shell <head>; in the
			// octane flavor <Head> children are portaled on the client, so router-
			// managed head tags (deduped via data-tsr-managed-key) are the idiomatic
			// carrier for the same markup.
			scripts: [{ children: THEME_BOOTSTRAP }],
			styles: [
				{ id: 'tanstack-highlight-theme', children: HIGHLIGHT_THEME_CSS },
			],
		};
	},
	headers: () => DOCUMENT_CACHE_HEADERS,
	staleTime: Infinity,
	shellComponent: ({ children }: { children?: any }) => {
		return <RootShell>{children}</RootShell>;
	},
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: () => <NotFound />,
});

function RootShell({ children }: { children?: any }) {
	return <ThemeProvider>
		<SearchProvider>
			<ShellComponent>{children}</ShellComponent>
		</SearchProvider>
	</ThemeProvider>;
}

function ShellComponent({ children }: { children?: any }) {
	const hasBaseParent = useMatches({
		select: (matches) => matches.find((d) => d.staticData?.baseParent),
	});

	const isNavigating = useRouterState({
		select: (s) => s.isLoading || s.isTransitioning,
	});

	const [showNavigationSpinner, setShowNavigationSpinner] = useState(false);

	useEffect(() => {
		if (!isNavigating) {
			setShowNavigationSpinner(false);
			return;
		}

		const timeout = window.setTimeout(() => {
			setShowNavigationSpinner(true);
		}, 1000);

		return () => {
			window.clearTimeout(timeout);
		};
	}, [isNavigating]);

	const hideNavbar = useMatches({
		select: (s) => s.some((d) => d.staticData?.showNavbar === false),
	});

	const htmlClass = useHtmlClass();

	return <Html lang="en" class={htmlClass} suppressHydrationWarning>
		<Head>
			<HeadContent />
			{hasBaseParent ? <base target="_parent" /> : null}
		</Head>
		<Body class="overflow-x-hidden">
			<LoginModalProvider>
				<ToastProvider>
					{hideNavbar ? children : <Navbar>{children}</Navbar>}
					<div
						aria-hidden="true"
						class={twMerge(
							'pointer-events-none fixed top-0 left-0 z-99999999 h-[320px] w-full select-none',
						)}
					>
						<div
							class={twMerge(
								'absolute top-0 w-full h-80 rounded-[100%] bg-amber-500/30 blur-3xl transition-all duration-500 dark:bg-sky-400/25',
								showNavigationSpinner
									? '-translate-y-1/2 opacity-100'
									: '-translate-y-full opacity-0',
							)}
						/>
						<div
							class={twMerge(
								'absolute top-6 left-1/2 -translate-x-1/2 rounded-full bg-white/75 p-2 shadow-lg backdrop-blur-lg transition-all duration-300 dark:bg-slate-900/40',
								showNavigationSpinner ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0',
							)}
						>
							<Spinner className="text-4xl" />
						</div>
					</div>
				</ToastProvider>
			</LoginModalProvider>
			<Scripts />
		</Body>
	</Html>;
}

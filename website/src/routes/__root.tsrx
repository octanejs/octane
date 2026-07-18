import { Body, Head, HeadContent, Html, Scripts, createRootRoute } from '@tanstack/octane-router';
import { MainLayout } from '../layouts/MainLayout.tsrx';
import { NotFound } from '../pages/not-found/NotFound.tsrx';
import { DEFAULT_TITLE } from '../hooks/use-title.ts';

const BASE_STYLES = `
:root {
	--bg: #23272f;
	--panel: #2b3138;
	--code-bg: #16181d;
	--text: #f4eee8;
	--text-secondary: #99a1b3;
	--accent: #ff415a;
	--accent-hover: #ff5d72;
	--accent-text: #ff5d72;
	--on-accent: #16181d;
	--border: rgba(255, 255, 255, 0.1);
	color-scheme: dark;
}
* {
	box-sizing: border-box;
}
html {
	-webkit-text-size-adjust: 100%;
}
/* Smooth anchor scrolling only for readers who accept motion: an unscoped
   scroll-behavior would also override scrollIntoView({ behavior: 'auto' }),
   defeating the TOC's reduced-motion fallback. */
@media (prefers-reduced-motion: no-preference) {
	html {
		scroll-behavior: smooth;
	}
}
body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	line-height: 1.6;
	font-size: 16px;
}
code,
pre,
kbd,
samp {
	font-family: 'SF Mono', SFMono-Regular, ui-monospace, Menlo, Consolas, monospace;
}
a {
	color: var(--accent-text);
	text-decoration: none;
}
a:hover {
	color: var(--accent-hover);
}
::selection {
	background: rgba(255, 65, 90, 0.45);
}
pre.shiki {
	background: var(--code-bg) !important;
	border: 1px solid var(--border);
	border-radius: 1rem;
	padding: 1rem 1.25rem;
	overflow-x: auto;
	font-size: 0.875rem;
	line-height: 1.7;
	tab-size: 2;
}
`;

function RootDocument(props: { children?: unknown }) @{
	<Html lang="en">
		<Head>
			<HeadContent />
		</Head>
		<Body>
			{props.children}
			<Scripts />
		</Body>
	</Html>
}

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				name: 'description',
				content: 'Octane — React\'s programming model, compiled ahead of time. No VDOM, no rules of hooks.',
			},
			{
				name: 'theme-color',
				content: '#23272f',
			},
			{ title: DEFAULT_TITLE },
			{
				property: 'og:type',
				content: 'website',
			},
			{
				property: 'og:site_name',
				content: 'Octane',
			},
			{
				property: 'og:title',
				content: DEFAULT_TITLE,
			},
			{
				property: 'og:description',
				content: 'React\'s programming model, compiled ahead of time. No VDOM, no rules of hooks.',
			},
			{
				property: 'og:image',
				content: 'https://octanejs.dev/og-image.png',
			},
			{
				property: 'og:image:width',
				content: '1200',
			},
			{
				property: 'og:image:height',
				content: '630',
			},
			{
				property: 'og:image:alt',
				content: 'Octane — React\'s programming model, compiled ahead of time',
			},
			{
				name: 'twitter:card',
				content: 'summary_large_image',
			},
		],
		links: [
			{ rel: 'icon', href: '/favicon.ico', sizes: '48x48 32x32 16x16' },
			{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
			{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
			{ rel: 'manifest', href: '/site.webmanifest' },
		],
		styles: [{ children: BASE_STYLES }],
	}),
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
	component: MainLayout,
});

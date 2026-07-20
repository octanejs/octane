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
	--text-body: #d5d9e0;
	--text-secondary: #99a1b3;
	--accent: #ff415a;
	--accent-hover: #ff5d72;
	--accent-text: #ff5d72;
	--on-accent: #16181d;
	--border: rgba(255, 255, 255, 0.1);
	--border-strong: rgba(255, 255, 255, 0.22);
	/* Surfaces layered over --bg (dark: subtle white tints). */
	--surface-subtle: rgba(255, 255, 255, 0.03);
	--surface: rgba(255, 255, 255, 0.06);
	/* Inset surfaces (form fields, nested content wells): darker than --panel in
	   BOTH themes, unlike --surface which lightens. Text on these follows --text,
	   so they must track the theme or the text turns dark-on-dark in light mode. */
	--field-bg: rgba(22, 24, 29, 0.78);
	--surface-inset: rgba(22, 24, 29, 0.55);
	/* Status text (success / error): light tints in dark mode, darkened in light
	   so they stay legible on light surfaces instead of washing out. */
	--success-text: #8ae8ae;
	--danger-text: #ff8797;
	/* Translucent sticky-header/backdrop fills (a tint of --bg). */
	--header-bg: rgba(35, 39, 47, 0.85);
	--header-bg-solid: rgba(35, 39, 47, 0.97);
	/* Doc callout accent glyphs (note/important/tip). */
	--callout-note: #a9c2ff;
	--callout-important: #ffc56d;
	--callout-tip: #7ee2a7;
	/* Hand-highlighted install-command tokens (match the shiki bash fences). */
	--pkg-cmd: #ffb757;
	--pkg-arg: #addcff;
	color-scheme: dark;
}
:root[data-theme='light'] {
	--bg: #ffffff;
	--panel: #f4f5f7;
	--code-bg: #f6f8fa;
	--text: #1c2027;
	--text-body: #363c47;
	--text-secondary: #5c6473;
	--accent: #ff415a;
	--accent-hover: #c81e37;
	--accent-text: #d81f38;
	--on-accent: #ffffff;
	--border: rgba(0, 0, 0, 0.12);
	--border-strong: rgba(0, 0, 0, 0.22);
	--surface-subtle: rgba(0, 0, 0, 0.025);
	--surface: rgba(0, 0, 0, 0.04);
	--field-bg: #ffffff;
	--surface-inset: rgba(0, 0, 0, 0.03);
	--success-text: #1e7a45;
	--danger-text: #c81e37;
	--header-bg: rgba(255, 255, 255, 0.85);
	--header-bg-solid: rgba(255, 255, 255, 0.97);
	--callout-note: #2f5fd0;
	--callout-important: #a86400;
	--callout-tip: #1e7a45;
	--pkg-cmd: #953800;
	--pkg-arg: #0550ae;
	color-scheme: light;
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
/* Shiki dual-theme tokens (defaultColor: false — see mdx-options.ts). Dark is
   the default token set; light overrides it under [data-theme='light']. */
.shiki,
.shiki span {
	color: var(--shiki-dark);
}
:root[data-theme='light'] .shiki,
:root[data-theme='light'] .shiki span {
	color: var(--shiki-light);
}
`;

// Runs before first paint (and before hydration) so the theme is correct with
// no flash: honor a saved choice, else fall back to the OS preference, and align
// the address-bar theme-color to it (the SSR meta is the dark default). The
// server can't know the theme, so it renders the dark default and this
// reconciles on the client. `data-theme` is owned entirely by the client —
// Octane never renders it — so it does not participate in hydration. Placed
// AFTER the theme-color <meta> below so it already exists to update; still in
// <head>, so it runs before the body paints.
const THEME_INIT = `(function(){var s=null;try{s=localStorage.getItem('octane-theme');}catch(e){}try{var t=(s==='light'||s==='dark')?s:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#ffffff':'#23272f');}catch(e){}})();`;

function RootDocument(props: { children?: unknown }) @{
	<Html lang="en">
		<Head>
			<HeadContent />
			{/* theme-color is owned by the client (the pre-paint script and toggle
    mutate it), so it lives here in the shell — NOT in the route head()
    config. A router-managed tag is recreated from head() on every client
    navigation, which would reset it to the dark default; a static shell
    tag persists, so the light value survives route changes. */}
			<meta name="theme-color" content="#23272f" />
			<script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
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
			// use-credentials: browsers fetch manifests anonymously by default, so
			// on SSO-protected Vercel previews the request loses its auth cookie
			// and dies on a cross-origin login redirect (console CORS noise).
			// Same-origin production requests are unaffected.
			{ rel: 'manifest', href: '/site.webmanifest', crossOrigin: 'use-credentials' },
		],
		styles: [{ children: BASE_STYLES }],
	}),
	notFoundComponent: NotFound,
	shellComponent: RootDocument,
	component: MainLayout,
});

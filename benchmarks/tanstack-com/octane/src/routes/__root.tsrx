import {
	Body,
	Head,
	HeadContent,
	Html,
	Outlet,
	Scripts,
	createRootRoute,
} from '@octanejs/tanstack-router';
import { DefaultCatchBoundary } from '../components/DefaultCatchBoundary.tsrx';
import { NotFound } from '../components/NotFound.tsrx';
import { seo } from '../utils/seo.ts';
import '../styles/app.css';

// Same inline theme bootstrap as the react flavor's __root.tsx: resolves the
// stored theme before first paint so SSR html classes match the client.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('theme')||'auto';var v=['light','dark','auto'].includes(t)?t:'auto';var r=v==='auto'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):v;document.documentElement.classList.add(r);if(v==='auto')document.documentElement.classList.add('auto');document.documentElement.style.colorScheme=r}catch(e){var r=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.classList.add(r,'auto');document.documentElement.style.colorScheme=r}})()`;

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			...seo({
				title: 'TanStack | High Quality Open-Source Software for Web Developers',
				description: `Headless, type-safe, powerful utilities for complex workflows like Data Management, Data Visualization, Charts, Tables, and UI Components.`,
			}),
		],
		links: [
			{ rel: 'icon', href: '/favicon.ico' },
		],
		scripts: [{ children: THEME_BOOTSTRAP }],
	}),
	shellComponent: RootDocument,
	errorComponent: DefaultCatchBoundary,
	notFoundComponent: NotFound,
});

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

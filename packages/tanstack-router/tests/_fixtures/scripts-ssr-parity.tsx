/** @jsxImportSource octane */
// Pinned Scripts.test.tsx route factories, compiled separately for native SSR.
import { renderToString } from 'octane/server';
import {
	HeadContent,
	Outlet,
	RouterProvider,
	Scripts,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '../../src';
import type { Manifest } from '../../src';

export async function renderDefinedScripts() {
	const rootRoute = createRootRoute({
		scripts: () => [
			{ src: 'script.js' },
			undefined, // 'script2.js' opted out by certain conditions, such as `NODE_ENV=production`.
		],
		component: () => {
			return (
				<div>
					<div data-testid="root">root</div>
					<Outlet />
					<Scripts />
				</div>
			);
		},
	});

	const indexRoute = createRoute({
		path: '/',
		getParentRoute: () => rootRoute,
		scripts: () => [{ src: 'script3.js' }],
		component: () => {
			return <div data-testid="index">index</div>;
		},
	});

	const router = createRouter({
		history: createMemoryHistory({
			initialEntries: ['/'],
		}),
		routeTree: rootRoute.addChildren([indexRoute]),
		isServer: true,
	});

	await router.load();

	return { html: renderToString(RouterProvider, { router }).html, matches: router.state.matches };
}

export async function renderAsyncDeferScripts() {
	const rootRoute = createRootRoute({
		scripts: () => [
			{
				src: 'script.js',
				async: true,
			},
			{
				src: 'script2.js',
				defer: true,
			},
		],
		component: () => {
			return (
				<div>
					<div data-testid="server-root">root</div>
					<Outlet />
					<Scripts />
				</div>
			);
		},
	});

	const indexRoute = createRoute({
		path: '/',
		getParentRoute: () => rootRoute,
		component: () => {
			return <div data-testid="server-index">index</div>;
		},
	});

	const router = createRouter({
		history: createMemoryHistory({
			initialEntries: ['/'],
		}),
		routeTree: rootRoute.addChildren([indexRoute]),
		isServer: true,
	});

	await router.load();

	return { html: renderToString(RouterProvider, { router }).html, matches: router.state.matches };
}

export async function renderManifestScripts() {
	const clientEntryAsset = {
		attrs: {
			src: '/entry.js',
			type: 'module',
			async: true,
		},
	} satisfies NonNullable<Manifest['routes'][string]['scripts']>[number];

	const rootRoute = createRootRoute({
		component: () => {
			return (
				<html>
					<head />
					<body>
						<main data-testid="content">content</main>
						<Outlet />
						<Scripts />
					</body>
				</html>
			);
		},
	});

	const indexRoute = createRoute({
		path: '/',
		getParentRoute: () => rootRoute,
	});

	const router = createRouter({
		history: createMemoryHistory({
			initialEntries: ['/'],
		}),
		routeTree: rootRoute.addChildren([indexRoute]),
		isServer: true,
	});
	router.ssr = {
		manifest: {
			routes: {
				[rootRoute.id]: {
					scripts: [clientEntryAsset],
				},
			},
		},
	};

	await router.load();

	return { html: renderToString(RouterProvider, { router }).html, matches: router.state.matches };
}

export async function renderMetadata() {
	const rootRoute = createRootRoute({
		loader: () =>
			new Promise((r) => setTimeout(r, 1)).then(() => ({
				description: 'Root',
			})),
		head: ({ loaderData }) => {
			return {
				meta: [
					{
						title: 'Root',
					},
					{
						name: 'description',
						content: loaderData?.description,
					},
					{
						name: 'image',
						content: 'image.jpg',
					},
					{
						property: 'og:image',
						content: 'root-image.jpg',
					},
					{
						property: 'og:description',
						content: 'Root description',
					},
				],
			};
		},
		component: () => {
			return <HeadContent />;
		},
	});

	const indexRoute = createRoute({
		path: '/',
		getParentRoute: () => rootRoute,
		loader: () =>
			new Promise((r) => setTimeout(r, 2)).then(() => ({
				description: 'Index',
			})),
		head: ({ loaderData }) => {
			return {
				meta: [
					{
						title: 'Index',
					},
					{
						name: 'description',
						content: loaderData?.description,
					},
					{
						name: 'last-modified',
						content: '2021-10-10',
					},
					{
						property: 'og:image',
						content: 'index-image.jpg',
					},
				],
			};
		},
	});

	const router = createRouter({
		history: createMemoryHistory({
			initialEntries: ['/'],
		}),
		routeTree: rootRoute.addChildren([indexRoute]),
		isServer: true,
	});

	await router.load();

	return { html: renderToString(RouterProvider, { router }).html, matches: router.state.matches };
}

export async function renderDataScript() {
	const jsonLd = JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: 'Test Article',
	});

	const rootRoute = createRootRoute({
		scripts: () => [
			{
				type: 'application/ld+json',
				children: jsonLd,
			},
		],
		component: () => {
			return (
				<div>
					<div data-testid="ssr-root">root</div>
					<Outlet />
					<Scripts />
				</div>
			);
		},
	});

	const indexRoute = createRoute({
		path: '/',
		getParentRoute: () => rootRoute,
	});

	const router = createRouter({
		history: createMemoryHistory({
			initialEntries: ['/'],
		}),
		routeTree: rootRoute.addChildren([indexRoute]),
		isServer: true,
	});

	await router.load();

	return {
		html: renderToString(RouterProvider, { router }).html,
		matches: router.state.matches,
		jsonLd,
	};
}

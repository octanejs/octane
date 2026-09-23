// The React side of the SSR head-parity test: real @tanstack/react-router
// renders <HeadContent /> through react-dom/server. Kept in plain JS so the
// React binding's module augmentations stay out of this package's type program.
import {
	HeadContent,
	RouterContextProvider,
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
} from '@tanstack/react-router';
import { attachRouterServerSsrUtils } from '@tanstack/react-router/ssr/server';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

export async function renderReactHeadContent({ head, manifest, nonce }) {
	const rootRoute = createRootRoute({ head });
	const router = createRouter({
		routeTree: rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })]),
		history: createMemoryHistory({ initialEntries: ['/'] }),
		ssr: { nonce },
	});
	router.isServer = true;
	attachRouterServerSsrUtils({ router, manifest });
	await router.load();
	try {
		return renderToString(
			createElement(RouterContextProvider, { router }, createElement(HeadContent)),
		);
	} finally {
		router.serverSsr.cleanup();
	}
}

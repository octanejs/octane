// The single app root — every URL renders through here (see octane.config.ts:
// each RenderRoute points straight at this component, and the plugin passes the
// request `url` as a prop). On the server (SSR) it reads the per-URL server
// router prepared by the warm middleware, falling back to `use(entry.promise)`
// inside the @try boundary if the render arrived unwarmed. On the client it
// renders the browser-router singleton, whose match tree the plugin's
// `preHydrate` hook (router-client.ts) has already committed before hydrateRoot
// runs — so the first client pass renders the same resolved match tree the
// server did and hydration adopts cleanly.
import { use } from 'octane';
import { RouterProvider } from '@octanejs/tanstack-router';
import { getServerRouterEntry } from './router-server.ts';
import { clientRouter } from './router-client.ts';

const IS_SERVER = typeof document === 'undefined';

function Root(props: { url?: string }) @{
	let router: any;
	if (IS_SERVER) {
		// `url` is pathname + search; the server router is keyed by pathname.
		const pathname = (props.url ?? '/').split('?')[0];
		const entry = getServerRouterEntry(pathname);
		if (!entry.done) use(entry.promise); // octane: hooks may sit behind conditions
		router = entry.router;
	} else {
		router = clientRouter;
	}
	<RouterProvider router={router} />
}

export function App(props: { url?: string }) @{
	@try {
		<Root url={props.url} />
	} @pending {
		<p class="app-loading">{'Loading…'}</p>
	}
}

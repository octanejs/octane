// The single app root — every URL renders through here (see octane.config.ts).
// On the server (prerender) it reads the per-URL server router prepared by the
// warm middleware, falling back to `use(entry.promise)` inside the @try
// boundary if the render arrived unwarmed. On the client it renders the
// browser-router singleton, which AppEntry.ts's top-level await has already
// loaded before hydrateRoot runs — so the first client pass renders the same
// resolved match tree the server did and hydration adopts cleanly.
import { use } from 'octane';
import { RouterProvider } from '@octanejs/router';
import { getServerRouterEntry } from './router-server.ts';
import { clientRouter } from './router-client.ts';

const IS_SERVER = typeof document === 'undefined';

function Root(props: { pathname?: string }) @{
	let router: any;
	if (IS_SERVER) {
		const entry = getServerRouterEntry(props.pathname ?? '/');
		if (!entry.done) use(entry.promise); // octane: hooks may sit behind conditions
		router = entry.router;
	} else {
		router = clientRouter;
	}
	<RouterProvider router={router} />
}

export function App(props: { pathname?: string }) @{
	@try {
		<Root pathname={props.pathname} />
	} @pending {
		<p class="app-loading">{'Loading…'}</p>
	}
}

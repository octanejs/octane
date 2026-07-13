// The single app root — every URL renders through here (see octane.config.ts:
// each RenderRoute points straight at this component, and the plugin passes the
// request `url` as a prop). On the server (SSR) it reads the per-URL server
// router stored in this request's middleware state, falling back to
// `use(entry.promise)` inside the @try boundary if the render arrived unwarmed.
// No loaded router survives in module-global state. On the client it
// renders the browser-router singleton, whose match tree the plugin's
// `preHydrate` hook (router-client.ts) has already committed before hydrateRoot
// runs — so the first client pass renders the same resolved match tree the
// server did and hydration adopts cleanly.
import { use } from 'octane';
import { RouterProvider } from '@octanejs/tanstack-router';
import { getServerRouterEntry } from './router-server.ts';
import { clientRouter } from './router-client.ts';

const IS_SERVER = typeof document === 'undefined';

function Root(props: { url?: string; state?: Map<string, unknown> }) @{
	let router: any;
	if (IS_SERVER) {
		if (!props.state) {
			throw new Error('[octane website] SSR router state is missing; render through the request middleware.');
		}
		const entry = getServerRouterEntry(props.state, props.url ?? '/');
		if (!entry.done) use(entry.promise); // octane: hooks may sit behind conditions
		router = entry.router;
	} else {
		router = clientRouter;
	}
	<RouterProvider router={router} />
}

export function App(props: { url?: string; state?: Map<string, unknown> }) @{
	@try {
		<Root url={props.url} state={props.state} />
	} @pending {
		<p class="app-loading">{'Loading…'}</p>
	}
}

// Static SSR — transcribed from react-router@8.2.0 lib/dom/server.tsx onto
// octane: StaticRouter (a Router that may not navigate), StaticRouterProvider
// (renders a static data router + the __staticRouterHydrationData script),
// and createStaticRouter (a stateless DataRouter over a StaticHandlerContext).
// Render through `octane/server` (renderToString / renderToPipeableStream).
import type { OctaneNode } from 'octane';
import type { Location, Path, To } from '../router/history.ts';
import { Action as NavigationType, createPath, invariant, parsePath } from '../router/history.ts';
import { IDLE_BLOCKER, IDLE_FETCHER, IDLE_NAVIGATION } from '../router/router.ts';
import type { Router as DataRouter, StaticHandlerContext } from '../router/router.ts';
import { convertRoutesToDataRoutes, isRouteErrorResponse } from '../router/utils.ts';
import type { RouteManifest, RouteObject } from '../router/utils.ts';
import { ABSOLUTE_URL_REGEX } from '../router/url.ts';
import { Router } from '../components/Router.tsrx';
import { DataRoutes } from '../components/RouterProvider.tsrx';
import {
	DataRouterContext,
	DataRouterStateContext,
	FetchersContext,
	ViewTransitionContext,
} from '../context.ts';

type StaticRouterProps = {
	basename?: string;
	children?: OctaneNode;
	location?: Partial<Location> | string;
};

/**
 * A Router that may not navigate to any other location. This is useful on the
 * server where there is no stateful UI.
 */
export function StaticRouter(props: StaticRouterProps) @{
	const { basename, children, location: locationPropIn = '/' } = props;

	let locationProp = locationPropIn;
	if (typeof locationProp === 'string') {
		locationProp = parsePath(locationProp);
	}

	const action = NavigationType.Pop;
	const location = {
		pathname: locationProp.pathname || '/',
		search: locationProp.search || '',
		hash: locationProp.hash || '',
		state: locationProp.state != null ? locationProp.state : null,
		key: locationProp.key || 'default',
		mask: undefined,
	};

	const staticNavigator = getStatelessNavigator();
	<Router
		basename={basename}
		location={location}
		navigationType={action}
		navigator={staticNavigator}
		static={true}
		useTransitions={false}
		children={children}
	/>
}

/**
 * A DataRouter that may not navigate to any other location. This is useful on
 * the server where there is no stateful UI.
 */
type StaticRouterProviderProps = {
	context: StaticHandlerContext;
	router: DataRouter;
	hydrate?: boolean;
	nonce?: string;
};

export function StaticRouterProvider(props: StaticRouterProviderProps) @{
	const { context, router, hydrate = true, nonce } = props;

	invariant(router && context, 'You must provide `router` and `context` to <StaticRouterProvider>');

	const dataRouterContext = {
		router,
		navigator: getStatelessNavigator(),
		static: true,
		staticContext: context,
		basename: context.basename || '/',
	};

	const fetchersContext = new Map<string, any>();

	let hydrateScript = '';

	if (hydrate !== false) {
		const data = {
			loaderData: context.loaderData,
			actionData: context.actionData,
			errors: serializeErrors(context.errors),
		};
		// Use JSON.parse here instead of embedding a raw JS object here to speed
		// up parsing on the client.  Dual-stringify is needed to ensure all quotes
		// are properly escaped in the resulting string.  See:
		//   https://v8.dev/blog/cost-of-javascript-2019#json
		const json = escapeHtml(JSON.stringify(JSON.stringify(data)));
		hydrateScript = `window.__staticRouterHydrationData = JSON.parse(${json});`;
	}

	const { state } = dataRouterContext.router;

	<>
		<DataRouterContext.Provider value={dataRouterContext}>
			<DataRouterStateContext.Provider value={state}>
				<FetchersContext.Provider value={fetchersContext}>
					<ViewTransitionContext.Provider value={{ isTransitioning: false }}>
						<Router
							basename={dataRouterContext.basename}
							location={state.location}
							navigationType={state.historyAction}
							navigator={dataRouterContext.navigator}
							static={dataRouterContext.static}
							useTransitions={false}
						>
							<DataRoutes
								manifest={router.manifest}
								routes={router.routes}
								future={router.future}
								state={state}
								isStatic={true}
							/>
						</Router>
					</ViewTransitionContext.Provider>
				</FetchersContext.Provider>
			</DataRouterStateContext.Provider>
		</DataRouterContext.Provider>
		@if (hydrateScript !== '') {
			<script
				suppressHydrationWarning
				nonce={nonce}
				dangerouslySetInnerHTML={{ __html: hydrateScript }}
			/>
		}
	</>
}

function serializeErrors(errors: StaticHandlerContext['errors']): StaticHandlerContext['errors'] {
	if (!errors) return null;
	const entries = Object.entries(errors);
	const serialized: Record<string, unknown> = {};
	for (const [key, val] of entries) {
		// Hey you!  If you change this, please change the corresponding logic in
		// deserializeErrors in lib/dom/lib.tsx :)
		if (isRouteErrorResponse(val)) {
			serialized[key] = { ...val, __type: 'RouteErrorResponse' };
		} else if (val instanceof Error) {
			// Do not serialize stack traces from SSR for security reasons
			serialized[key] = {
				message: val.message,
				__type: 'Error',
				// If this is a subclass (i.e., ReferenceError), send up the type so we
				// can re-create the same type during hydration.
				...(val.name !== 'Error'
					? {
							__subType: val.name,
						}
					: {}),
			};
		} else {
			serialized[key] = val;
		}
	}
	return serialized;
}

function getStatelessNavigator() {
	return {
		createHref,
		encodeLocation,
		push(to: To) {
			throw new Error(`You cannot use navigator.push() on the server because it is a stateless ` +
				`environment. This error was probably triggered when you did a ` +
				`\`navigate(${JSON.stringify(to)})\` somewhere in your app.`);
		},
		replace(to: To) {
			throw new Error(`You cannot use navigator.replace() on the server because it is a stateless ` +
				`environment. This error was probably triggered when you did a ` +
				`\`navigate(${JSON.stringify(to)}, { replace: true })\` somewhere ` +
				`in your app.`);
		},
		go(delta: number) {
			throw new Error(`You cannot use navigator.go() on the server because it is a stateless ` +
				`environment. This error was probably triggered when you did a ` +
				`\`navigate(${delta})\` somewhere in your app.`);
		},
		back() {
			throw new Error(`You cannot use navigator.back() on the server because it is a stateless ` +
				`environment.`);
		},
		forward() {
			throw new Error(`You cannot use navigator.forward() on the server because it is a stateless ` +
				`environment.`);
		},
	};
}

/**
 * Create a static DataRouter for server-side rendering.
 */
export function createStaticRouter(
	routes: RouteObject[],
	context: StaticHandlerContext,
	opts: { branches?: any[]; future?: any } = {},
): DataRouter {
	const manifest: RouteManifest = {};
	const dataRoutes = convertRoutesToDataRoutes(routes, undefined, undefined, manifest);

	// Because our context matches may be from a set of routes passed to
	// createStaticHandler(), we update them here with our newly created/enhanced
	// data routes
	const matches = context.matches.map((match) => {
		const route = manifest[match.route.id] || match.route;
		return {
			...match,
			route,
		};
	});

	const msg = (method: string) =>
		`You cannot use router.${method}() on the server because it is a stateless environment`;

	return {
		get basename() {
			return context.basename;
		},
		get future() {
			return { ...opts?.future };
		},
		get state() {
			return {
				historyAction: NavigationType.Pop,
				location: context.location,
				matches,
				loaderData: context.loaderData,
				actionData: context.actionData,
				errors: context.errors,
				initialized: true,
				renderFallback: false,
				navigation: IDLE_NAVIGATION,
				restoreScrollPosition: null,
				preventScrollReset: false,
				revalidation: 'idle' as const,
				fetchers: new Map(),
				blockers: new Map(),
			};
		},
		get routes() {
			return dataRoutes;
		},
		get branches() {
			return opts.branches;
		},
		get manifest() {
			return manifest;
		},
		get window() {
			return undefined;
		},
		initialize() {
			throw msg('initialize');
		},
		subscribe() {
			throw msg('subscribe');
		},
		enableScrollRestoration() {
			throw msg('enableScrollRestoration');
		},
		navigate() {
			throw msg('navigate');
		},
		fetch() {
			throw msg('fetch');
		},
		revalidate() {
			throw msg('revalidate');
		},
		createHref,
		encodeLocation,
		getFetcher() {
			return IDLE_FETCHER;
		},
		deleteFetcher() {
			throw msg('deleteFetcher');
		},
		resetFetcher() {
			throw msg('resetFetcher');
		},
		dispose() {
			throw msg('dispose');
		},
		getBlocker() {
			return IDLE_BLOCKER;
		},
		deleteBlocker() {
			throw msg('deleteBlocker');
		},
		patchRoutes() {
			throw msg('patchRoutes');
		},
		_internalFetchControllers: new Map(),
		_internalSetRoutes() {
			throw msg('_internalSetRoutes');
		},
		_internalSetStateDoNotUseOrYouWillBreakYourApp() {
			throw msg('_internalSetStateDoNotUseOrYouWillBreakYourApp');
		},
	};
}

function createHref(to: To) {
	return typeof to === 'string' ? to : createPath(to);
}

function encodeLocation(to: To): Path {
	let href =
		typeof to === 'string' ? to : createPath(to);
	// Treating this as a full URL will strip any trailing spaces so we need to
	// pre-encode them since they might be part of a matching splat param from
	// an ancestor route
	href = href.replace(/ $/, '%20');
	const encoded = ABSOLUTE_URL_REGEX.test(href) ? new URL(href) : new URL(href, 'http://localhost');
	return {
		pathname: encoded.pathname,
		search: encoded.search,
		hash: encoded.hash,
	};
}

// Upstream imports escapeHtml from lib/dom/ssr/markup.ts (framework dir, not
// vendored) — the implementation is this table escape, transcribed verbatim.
const ESCAPE_LOOKUP: { [match: string]: string } = {
	'&': '\\u0026',
	'>': '\\u003e',
	'<': '\\u003c',
	' ': '\\u2028',
	' ': '\\u2029',
};

const ESCAPE_REGEX = /[&><\u2028\u2029]/g;

function escapeHtml(html: string): string {
	return html.replace(ESCAPE_REGEX, (match) => ESCAPE_LOOKUP[match]);
}

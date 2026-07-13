// Transcribed from react-router@8.2.0 lib/hooks.tsx onto octane. Upstream
// logic, comments, and warning strings are verbatim; octane substitutions:
// hooks from 'octane' with the binding slot idiom (splitSlot/subSlot — this
// file is NOT compiled, so exported hooks peel the caller's compiler-injected
// slot off their trailing args and derive a distinct sub-slot per base-hook
// call site), JSX → createElement descriptors (plain .ts), `__DEV__` →
// ENABLE_DEV_WARNINGS, and the class RenderErrorBoundary / inline
// DefaultErrorComponent live in sibling .tsrx files. RSC branches are dropped
// at their upstream sites with OCTANE notes.
import {
	createContext,
	createElement,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';
import type { NavigateOptions, RouteContextObject, ClientOnErrorFunction } from './context';
import {
	AwaitContext,
	DataRouterContext,
	DataRouterStateContext,
	LocationContext,
	NavigationContext,
	RouteContext,
	RouteErrorContext,
} from './context';
import type { Location, Path, To } from './router/history';
import { Action as NavigationType, invariant, parsePath, warning } from './router/history';
import type {
	Blocker,
	BlockerFunction,
	RelativeRoutingType,
	Router as DataRouter,
	NavigationStates,
} from './router/router';
import { IDLE_BLOCKER } from './router/router';
// OCTANE: dropped — upstream also imports hasInvalidProtocol here; it serves
// the RSC redirect handler (no octane RSC runtime).
import type {
	DataRouteMatch,
	ParamParseKey,
	Params,
	PathMatch,
	PathPattern,
	RouteManifest,
	RouteMatch,
	RouteObject,
	UIMatch,
} from './router/utils';
import {
	convertRouteMatchToUiMatch,
	decodePath,
	ENABLE_DEV_WARNINGS,
	getResolveToMatches,
	getRoutePattern,
	joinPaths,
	matchPath,
	matchRoutes,
	resolveTo,
	stripBasename,
} from './router/utils';
// OCTANE: dropped — upstream imports { GetActionData, GetLoaderData,
// SerializeFrom } from ./types/route-data (framework-mode serialization
// typing, not vendored) and RouteModules from ./types/register; they serve
// useRoute (Phase E) and the SerializeFrom generic, declared loosely below.
// OCTANE: dropped — upstream imports { decodeRedirectErrorDigest,
// decodeRouteErrorResponseDigest } from ./errors; both are consumed only by
// the RSC digest branches (RenderErrorBoundary.render / RSCErrorHandler).
import { RenderErrorBoundary } from './RenderErrorBoundary.tsrx';
import { DefaultErrorComponent } from './DefaultErrorComponent.tsrx';
import { splitSlot, subSlot } from '../internal';

/**
 * Resolves a URL against the current {@link Location}.
 *
 * @example
 * import { useHref } from "react-router";
 *
 * function SomeComponent() {
 *   let href = useHref("some/where");
 *   // "/resolved/some/where"
 * }
 *
 * @public
 * @category Hooks
 * @param to The path to resolve
 * @param options Options
 * @param options.relative Defaults to `"route"` so routing is relative to the
 * route tree.
 * Set to `"path"` to make relative routing operate against path segments.
 * @returns The resolved href string
 */
export function useHref(to: To, ...args: any[]): string {
	const [user, slot] = splitSlot(args);
	let { relative } = (user[0] as { relative?: RelativeRoutingType } | undefined) ?? {};
	invariant(
		useInRouterContext(),
		// TODO: This error is probably because they somehow have 2 versions of the
		// router loaded. We can help them understand how to avoid that.
		`useHref() may be used only in the context of a <Router> component.`,
	);

	let { basename, navigator } = useContext(NavigationContext);
	let { hash, pathname, search } = useResolvedPath(to, { relative }, subSlot(slot, 'href:rp'));

	let joinedPathname = pathname;

	// If we're operating within a basename, prepend it to the pathname prior
	// to creating the href.  If this is a root navigation, then just use the raw
	// basename which allows the basename to have full control over the presence
	// of a trailing slash on root links
	if (basename !== '/') {
		joinedPathname = pathname === '/' ? basename : joinPaths([basename, pathname]);
	}

	return navigator.createHref({ pathname: joinedPathname, search, hash });
}

/**
 * Returns `true` if this component is a descendant of a {@link Router}, useful
 * to ensure a component is used within a {@link Router}.
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns Whether the component is within a {@link Router} context
 */
export function useInRouterContext(): boolean {
	return useContext(LocationContext) != null;
}

/**
 * Returns the current {@link Location}. This can be useful if you'd like to
 * perform some side effect whenever it changes.
 *
 * @example
 * import { useLocation } from 'react-router'
 *
 * function SomeComponent() {
 *   let location = useLocation()
 *
 *   useEffect(() => {
 *     // Google Analytics
 *     ga('send', 'pageview')
 *   }, [location]);
 *
 *   return (
 *     // ...
 *   );
 * }
 *
 * @public
 * @category Hooks
 * @returns The current {@link Location} object
 */
export function useLocation(): Location {
	invariant(
		useInRouterContext(),
		// TODO: This error is probably because they somehow have 2 versions of the
		// router loaded. We can help them understand how to avoid that.
		`useLocation() may be used only in the context of a <Router> component.`,
	);

	return useContext(LocationContext).location;
}

/**
 * Returns the current {@link Navigation} action which describes how the router
 * came to the current {@link Location}, either by a pop, push, or replace on
 * the [`History`](https://developer.mozilla.org/en-US/docs/Web/API/History) stack.
 *
 * @public
 * @category Hooks
 * @returns The current {@link NavigationType} (`"POP"`, `"PUSH"`, or `"REPLACE"`)
 */
export function useNavigationType(): NavigationType {
	return useContext(LocationContext).navigationType;
}

/**
 * Returns a {@link PathMatch} object if the given pattern matches the current URL.
 * This is useful for components that need to know "active" state, e.g.
 * {@link NavLink | `<NavLink>`}.
 *
 * @public
 * @category Hooks
 * @param pattern The pattern to match against the current {@link Location}
 * @returns The path match object if the pattern matches, `null` otherwise
 */
export function useMatch<Path extends string>(
	pattern: PathPattern<Path> | Path,
	...args: any[]
): PathMatch<ParamParseKey<Path>> | null {
	const [, slot] = splitSlot(args);
	invariant(
		useInRouterContext(),
		// TODO: This error is probably because they somehow have 2 versions of the
		// router loaded. We can help them understand how to avoid that.
		`useMatch() may be used only in the context of a <Router> component.`,
	);

	let { pathname } = useLocation();
	return useMemo(
		() => matchPath<Path>(pattern, decodePath(pathname)),
		[pathname, pattern],
		subSlot(slot, 'match:memo'),
	);
}

/**
 * The interface for the `navigate` function returned from {@link useNavigate}.
 */
export interface NavigateFunction {
	(to: To, options?: NavigateOptions): void | Promise<void>;
	(delta: number): void | Promise<void>;
}

const navigateEffectWarning =
	`You should call navigate() in a useEffect(), not when ` + `your component is first rendered.`;

/**
 * Returns a function that lets you navigate programmatically in the browser in
 * response to user interactions or effects.
 *
 * It's often better to use {@link redirect} in [`action`](../../start/framework/route-module#action)/[`loader`](../../start/framework/route-module#loader)
 * functions than this hook.
 *
 * The returned function signature is `navigate(to, options?)`/`navigate(delta)` where:
 *
 * * `to` can be a string path, a {@link To} object, or a number (delta)
 * * `options` contains options for modifying the navigation
 *   * These options work in all modes (Framework, Data, and Declarative):
 *     * `relative`: `"route"` or `"path"` to control relative routing logic
 *     * `replace`: Replace the current entry in the [`History`](https://developer.mozilla.org/en-US/docs/Web/API/History) stack
 *     * `state`: Optional [`history.state`](https://developer.mozilla.org/en-US/docs/Web/API/History/state) to include with the new {@link Location}
 *   * These options only work in Framework and Data modes:
 *     * `flushSync`: Wrap the DOM updates in [`ReactDom.flushSync`](https://react.dev/reference/react-dom/flushSync)
 *     * `preventScrollReset`: Do not scroll back to the top of the page after navigation
 *     * `viewTransition`: Enable [`document.startViewTransition`](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for this navigation
 *
 * @example
 * import { useNavigate } from "react-router";
 *
 * function SomeComponent() {
 *   let navigate = useNavigate();
 *   return (
 *     <button onClick={() => navigate(-1)}>
 *       Go Back
 *     </button>
 *   );
 * }
 *
 * @additionalExamples
 * ### Navigate to another path
 *
 * ```tsx
 * navigate("/some/route");
 * navigate("/some/route?search=param");
 * ```
 *
 * ### Navigate with a {@link To} object
 *
 * All properties are optional.
 *
 * ```tsx
 * navigate({
 *   pathname: "/some/route",
 *   search: "?search=param",
 *   hash: "#hash",
 *   state: { some: "state" },
 * });
 * ```
 *
 * If you use `state`, that will be available on the {@link Location} object on
 * the next page. Access it with `useLocation().state` (see {@link useLocation}).
 *
 * ### Navigate back or forward in the history stack
 *
 * ```tsx
 * // back
 * // often used to close modals
 * navigate(-1);
 *
 * // forward
 * // often used in a multistep wizard workflows
 * navigate(1);
 * ```
 *
 * Be cautious with `navigate(number)`. If your application can load up to a
 * route that has a button that tries to navigate forward/back, there may not be
 * a [`History`](https://developer.mozilla.org/en-US/docs/Web/API/History)
 * entry to go back or forward to, or it can go somewhere you don't expect
 * (like a different domain).
 *
 * Only use this if you're sure they will have an entry in the [`History`](https://developer.mozilla.org/en-US/docs/Web/API/History)
 * stack to navigate to.
 *
 * ### Replace the current entry in the history stack
 *
 * This will remove the current entry in the [`History`](https://developer.mozilla.org/en-US/docs/Web/API/History)
 * stack, replacing it with a new one, similar to a server side redirect.
 *
 * ```tsx
 * navigate("/some/route", { replace: true });
 * ```
 *
 * ### Prevent Scroll Reset
 *
 * [MODES: framework, data]
 *
 * <br/>
 * <br/>
 *
 * To prevent {@link ScrollRestoration | `<ScrollRestoration>`} from resetting
 * the scroll position, use the `preventScrollReset` option.
 *
 * ```tsx
 * navigate("?some-tab=1", { preventScrollReset: true });
 * ```
 *
 * For example, if you have a tab interface connected to search params in the
 * middle of a page, and you don't want it to scroll to the top when a tab is
 * clicked.
 *
 * ### Return Type Augmentation
 *
 * Internally, `useNavigate` uses a separate implementation when you are in
 * Declarative mode versus Data/Framework mode - the primary difference being
 * that the latter is able to return a stable reference that does not change
 * identity across navigations. The implementation in Data/Framework mode also
 * returns a [`Promise`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise)
 * that resolves when the navigation is completed. This means the return type of
 * `useNavigate` is `void | Promise<void>`. This is accurate, but can lead to
 * some red squigglies based on the union in the return value:
 *
 * - If you're using `typescript-eslint`, you may see errors from
 *   [`@typescript-eslint/no-floating-promises`](https://typescript-eslint.io/rules/no-floating-promises)
 * - In Framework/Data mode, `React.use(navigate())` will show a false-positive
 *   `Argument of type 'void | Promise<void>' is not assignable to parameter of
 *   type 'Usable<void>'` error
 *
 * The easiest way to work around these issues is to augment the type based on the
 * router you're using:
 *
 * ```ts
 * // If using <BrowserRouter>
 * declare module "react-router" {
 *   interface NavigateFunction {
 *     (to: To, options?: NavigateOptions): void;
 *     (delta: number): void;
 *   }
 * }
 *
 * // If using <RouterProvider> or Framework mode
 * declare module "react-router" {
 *   interface NavigateFunction {
 *     (to: To, options?: NavigateOptions): Promise<void>;
 *     (delta: number): Promise<void>;
 *   }
 * }
 * ```
 *
 * @public
 * @category Hooks
 * @returns A navigate function for programmatic navigation
 */
export function useNavigate(...args: any[]): NavigateFunction {
	const [, slot] = splitSlot(args);
	let { isDataRoute } = useContext(RouteContext);
	// Conditional usage is OK here because the usage of a data router is static
	return isDataRoute
		? useNavigateStable(subSlot(slot, 'nav:stable'))
		: useNavigateUnstable(subSlot(slot, 'nav:unstable'));
}

function useNavigateUnstable(slot?: symbol): NavigateFunction {
	invariant(
		useInRouterContext(),
		// TODO: This error is probably because they somehow have 2 versions of the
		// router loaded. We can help them understand how to avoid that.
		`useNavigate() may be used only in the context of a <Router> component.`,
	);

	let dataRouterContext = useContext(DataRouterContext);
	let { basename, navigator } = useContext(NavigationContext);
	let { matches } = useContext(RouteContext);
	let { pathname: locationPathname } = useLocation();

	let routePathnamesJson = JSON.stringify(getResolveToMatches(matches));

	let activeRef = useRef(false, subSlot(slot, 'unav:ref'));
	useLayoutEffect(
		() => {
			activeRef.current = true;
		},
		undefined,
		subSlot(slot, 'unav:ile'),
	);

	let navigate: NavigateFunction = useCallback(
		(to: To | number, options: NavigateOptions = {}) => {
			warning(activeRef.current, navigateEffectWarning);

			// Short circuit here since if this happens on first render the navigate
			// is useless because we haven't wired up our history listener yet
			if (!activeRef.current) return;

			if (typeof to === 'number') {
				navigator.go(to);
				return;
			}

			let path = resolveTo(
				to,
				JSON.parse(routePathnamesJson),
				locationPathname,
				options.relative === 'path',
			);

			// If we're operating within a basename, prepend it to the pathname prior
			// to handing off to history (but only if we're not in a data router,
			// otherwise it'll prepend the basename inside of the router).
			// If this is a root navigation, then we navigate to the raw basename
			// which allows the basename to have full control over the presence of a
			// trailing slash on root links
			if (dataRouterContext == null && basename !== '/') {
				path.pathname = path.pathname === '/' ? basename : joinPaths([basename, path.pathname]);
			}

			(!!options.replace ? navigator.replace : navigator.push)(path, options.state, options);
		},
		[basename, navigator, routePathnamesJson, locationPathname, dataRouterContext],
		subSlot(slot, 'unav:cb'),
	);

	return navigate;
}

const OutletContext = createContext<unknown>(null);

/**
 * Returns the parent route {@link Outlet | `<Outlet context>`}.
 *
 * Often parent routes manage state or other values you want shared with child
 * routes. You can create your own [context provider](https://react.dev/learn/passing-data-deeply-with-context)
 * if you like, but this is such a common situation that it's built-into
 * {@link Outlet | `<Outlet>`}.
 *
 * ```tsx
 * // Parent route
 * function Parent() {
 *   const [count, setCount] = useState(0);
 *   return <Outlet context={[count, setCount]} />;
 * }
 * ```
 *
 * ```tsx
 * // Child route
 * import { useOutletContext } from "react-router";
 *
 * function Child() {
 *   const [count, setCount] = useOutletContext();
 *   const increment = () => setCount((c) => c + 1);
 *   return <button onClick={increment}>{count}</button>;
 * }
 * ```
 *
 * If you're using TypeScript, we recommend the parent component provide a
 * custom hook for accessing the context value. This makes it easier for
 * consumers to get nice typings, control consumers, and know who's consuming
 * the context value.
 *
 * Here's a more realistic example:
 *
 * ```tsx filename=src/routes/dashboard.tsx lines=[14,20]
 * import { useState } from "react";
 * import { Outlet, useOutletContext } from "react-router";
 *
 * import type { User } from "./types";
 *
 * type ContextType = { user: User | null };
 *
 * export default function Dashboard() {
 *   const [user, setUser] = useState<User | null>(null);
 *
 *   return (
 *     <div>
 *       <h1>Dashboard</h1>
 *       <Outlet context={{ user } satisfies ContextType} />
 *     </div>
 *   );
 * }
 *
 * export function useUser() {
 *   return useOutletContext<ContextType>();
 * }
 * ```
 *
 * ```tsx filename=src/routes/dashboard/messages.tsx lines=[1,4]
 * import { useUser } from "../dashboard";
 *
 * export default function DashboardMessages() {
 *   const { user } = useUser();
 *   return (
 *     <div>
 *       <h2>Messages</h2>
 *       <p>Hello, {user.name}!</p>
 *     </div>
 *   );
 * }
 * ```
 *
 * @public
 * @category Hooks
 * @returns The context value passed to the parent {@link Outlet} component
 */
export function useOutletContext<Context = unknown>(): Context {
	return useContext(OutletContext) as Context;
}

/**
 * Returns the element for the child route at this level of the route
 * hierarchy. Used internally by {@link Outlet | `<Outlet>`} to render child
 * routes.
 *
 * @public
 * @category Hooks
 * @param context The context to pass to the outlet
 * @returns The child route element or `null` if no child routes match
 */
export function useOutlet(...args: any[]): unknown {
	const [user, slot] = splitSlot(args);
	let context = user[0] as unknown;
	let outlet = useContext(RouteContext).outlet;
	return useMemo(
		() =>
			outlet && createElement(OutletContext.Provider as any, { value: context, children: outlet }),
		[outlet, context],
		subSlot(slot, 'outlet:memo'),
	);
}

/**
 * Returns an object of key/value-pairs of the dynamic params from the current
 * URL that were matched by the routes. Child routes inherit all params from
 * their parent routes.
 *
 * Assuming a route pattern like `/posts/:postId` is matched by `/posts/123`
 * then `params.postId` will be `"123"`.
 *
 * @example
 * import { useParams } from "react-router";
 *
 * function SomeComponent() {
 *   let params = useParams();
 *   params.postId;
 * }
 *
 * @additionalExamples
 * ### Basic Usage
 *
 * ```tsx
 * import { useParams } from "react-router";
 *
 * // given a route like:
 * <Route path="/posts/:postId" element={<Post />} />;
 *
 * // or a data route like:
 * createBrowserRouter([
 *   {
 *     path: "/posts/:postId",
 *     component: Post,
 *   },
 * ]);
 *
 * // or in routes.ts
 * route("/posts/:postId", "routes/post.tsx");
 * ```
 *
 * Access the params in a component:
 *
 * ```tsx
 * import { useParams } from "react-router";
 *
 * export default function Post() {
 *   let params = useParams();
 *   return <h1>Post: {params.postId}</h1>;
 * }
 * ```
 *
 * ### Multiple Params
 *
 * Patterns can have multiple params:
 *
 * ```tsx
 * "/posts/:postId/comments/:commentId";
 * ```
 *
 * All will be available in the params object:
 *
 * ```tsx
 * import { useParams } from "react-router";
 *
 * export default function Post() {
 *   let params = useParams();
 *   return (
 *     <h1>
 *       Post: {params.postId}, Comment: {params.commentId}
 *     </h1>
 *   );
 * }
 * ```
 *
 * ### Catchall Params
 *
 * Catchall params are defined with `*`:
 *
 * ```tsx
 * "/files/*";
 * ```
 *
 * The matched value will be available in the params object as follows:
 *
 * ```tsx
 * import { useParams } from "react-router";
 *
 * export default function File() {
 *   let params = useParams();
 *   let catchall = params["*"];
 *   // ...
 * }
 * ```
 *
 * You can destructure the catchall param:
 *
 * ```tsx
 * export default function File() {
 *   let { "*": catchall } = useParams();
 *   console.log(catchall);
 * }
 * ```
 *
 * @public
 * @category Hooks
 * @returns An object containing the dynamic route parameters
 */
export function useParams<
	ParamsOrKey extends string | Record<string, string | undefined> = string,
>(): Readonly<[ParamsOrKey] extends [string] ? Params<ParamsOrKey> : Partial<ParamsOrKey>> {
	let { matches } = useContext(RouteContext);
	let routeMatch = matches[matches.length - 1];
	return (routeMatch?.params ?? {}) as any;
}

/**
 * Resolves the pathname of the given `to` value against the current
 * {@link Location}. Similar to {@link useHref}, but returns a
 * {@link Path} instead of a string.
 *
 * @example
 * import { useResolvedPath } from "react-router";
 *
 * function SomeComponent() {
 *   // if the user is at /dashboard/profile
 *   let path = useResolvedPath("../accounts");
 *   path.pathname; // "/dashboard/accounts"
 *   path.search; // ""
 *   path.hash; // ""
 * }
 *
 * @public
 * @category Hooks
 * @param to The path to resolve
 * @param options Options
 * @param options.relative Defaults to `"route"` so routing is relative to the route tree.
 *                         Set to `"path"` to make relative routing operate against path segments.
 * @returns The resolved {@link Path} object with `pathname`, `search`, and `hash`
 */
export function useResolvedPath(to: To, ...args: any[]): Path {
	const [user, slot] = splitSlot(args);
	let { relative } = (user[0] as { relative?: RelativeRoutingType } | undefined) ?? {};
	let { matches } = useContext(RouteContext);
	let { pathname: locationPathname } = useLocation();
	let routePathnamesJson = JSON.stringify(getResolveToMatches(matches));

	return useMemo(
		() => resolveTo(to, JSON.parse(routePathnamesJson), locationPathname, relative === 'path'),
		[to, routePathnamesJson, locationPathname, relative],
		subSlot(slot, 'rp:memo'),
	);
}

/**
 * Hook version of {@link Routes | `<Routes>`} that uses objects instead of
 * components. These objects have the same properties as the component props.
 * The return value of `useRoutes` is either a valid React element you can use
 * to render the route tree, or `null` if nothing matched.
 *
 * @example
 * import { useRoutes } from "react-router";
 *
 * function App() {
 *   let element = useRoutes([
 *     {
 *       path: "/",
 *       element: <Dashboard />,
 *       children: [
 *         {
 *           path: "messages",
 *           element: <DashboardMessages />,
 *         },
 *         { path: "tasks", element: <DashboardTasks /> },
 *       ],
 *     },
 *     { path: "team", element: <AboutPage /> },
 *   ]);
 *
 *   return element;
 * }
 *
 * @public
 * @category Hooks
 * @param routes An array of {@link RouteObject}s that define the route hierarchy
 * @param locationArg An optional {@link Location} object or pathname string to
 * use instead of the current {@link Location}
 * @returns A React element to render the matched route, or `null` if no routes matched
 */
export function useRoutes(routes: RouteObject[], ...args: any[]): unknown {
	const [user] = splitSlot(args);
	let locationArg = user[0] as Partial<Location> | string | undefined;
	return useRoutesImpl(routes, locationArg);
}

// Internal implementation with accept optional param for RouterProvider usage
export function useRoutesImpl(routes: RouteObject[], ...args: any[]): unknown {
	const [user] = splitSlot(args);
	let locationArg = user[0] as Partial<Location> | string | undefined;
	let dataRouterOpts = user[1] as
		| {
				manifest: RouteManifest;
				state: DataRouter['state'];
				isStatic: boolean;
				onError: ClientOnErrorFunction | undefined;
				future: DataRouter['future'];
		  }
		| undefined;
	invariant(
		useInRouterContext(),
		// TODO: This error is probably because they somehow have 2 versions of the
		// router loaded. We can help them understand how to avoid that.
		`useRoutes() may be used only in the context of a <Router> component.`,
	);

	let { navigator } = useContext(NavigationContext);
	let { matches: parentMatches } = useContext(RouteContext);
	let routeMatch = parentMatches[parentMatches.length - 1];
	let parentParams = routeMatch ? routeMatch.params : {};
	let parentPathname = routeMatch ? routeMatch.pathname : '/';
	let parentPathnameBase = routeMatch ? routeMatch.pathnameBase : '/';
	let parentRoute = routeMatch && routeMatch.route;

	if (ENABLE_DEV_WARNINGS) {
		// You won't get a warning about 2 different <Routes> under a <Route>
		// without a trailing *, but this is a best-effort warning anyway since we
		// cannot even give the warning unless they land at the parent route.
		//
		// Example:
		//
		// <Routes>
		//   {/* This route path MUST end with /* because otherwise
		//       it will never match /blog/post/123 */}
		//   <Route path="blog" element={<Blog />} />
		//   <Route path="blog/feed" element={<BlogFeed />} />
		// </Routes>
		//
		// function Blog() {
		//   return (
		//     <Routes>
		//       <Route path="post/:id" element={<Post />} />
		//     </Routes>
		//   );
		// }
		let parentPath = (parentRoute && parentRoute.path) || '';
		warningOnce(
			parentPathname,
			!parentRoute || parentPath.endsWith('*') || parentPath.endsWith('*?'),
			`You rendered descendant <Routes> (or called \`useRoutes()\`) at ` +
				`"${parentPathname}" (under <Route path="${parentPath}">) but the ` +
				`parent route path has no trailing "*". This means if you navigate ` +
				`deeper, the parent won't match anymore and therefore the child ` +
				`routes will never render.\n\n` +
				`Please change the parent <Route path="${parentPath}"> to <Route ` +
				`path="${parentPath === '/' ? '*' : `${parentPath}/*`}">.`,
		);
	}

	let locationFromContext = useLocation();

	let location;
	if (locationArg) {
		let parsedLocationArg = typeof locationArg === 'string' ? parsePath(locationArg) : locationArg;

		invariant(
			parentPathnameBase === '/' || parsedLocationArg.pathname?.startsWith(parentPathnameBase),
			`When overriding the location using \`<Routes location>\` or \`useRoutes(routes, location)\`, ` +
				`the location pathname must begin with the portion of the URL pathname that was ` +
				`matched by all parent routes. The current pathname base is "${parentPathnameBase}" ` +
				`but pathname "${parsedLocationArg.pathname}" was given in the \`location\` prop.`,
		);

		location = parsedLocationArg;
	} else {
		location = locationFromContext;
	}

	let pathname = location.pathname || '/';

	let remainingPathname = pathname;
	if (parentPathnameBase !== '/') {
		// Determine the remaining pathname by removing the # of URL segments the
		// parentPathnameBase has, instead of removing based on character count.
		// This is because we can't guarantee that incoming/outgoing encodings/
		// decodings will match exactly.
		// We decode paths before matching on a per-segment basis with
		// decodeURIComponent(), but we re-encode pathnames via `new URL()` so they
		// match what `window.location.pathname` would reflect.  Those don't 100%
		// align when it comes to encoded URI characters such as % and &.
		//
		// So we may end up with:
		//   pathname:           "/descendant/a%25b/match"
		//   parentPathnameBase: "/descendant/a%b"
		//
		// And the direct substring removal approach won't work :/
		let parentSegments = parentPathnameBase.replace(/^\//, '').split('/');
		let segments = pathname.replace(/^\//, '').split('/');
		remainingPathname = '/' + segments.slice(parentSegments.length).join('/');
	}

	let matches =
		dataRouterOpts && dataRouterOpts.state.matches.length
			? // If we're in a data router, use the matches we've already identified but ensure
				// we have the latest route instances from the manifest in case elements have changed
				dataRouterOpts.state.matches.map((m) =>
					Object.assign(m, {
						route: dataRouterOpts!.manifest[m.route.id] || m.route,
					}),
				)
			: matchRoutes(routes, { pathname: remainingPathname });

	if (ENABLE_DEV_WARNINGS) {
		warning(
			parentRoute || matches != null,
			`No routes matched location "${location.pathname}${location.search}${location.hash}" `,
		);

		warning(
			matches == null ||
				matches[matches.length - 1].route.element !== undefined ||
				matches[matches.length - 1].route.Component !== undefined ||
				matches[matches.length - 1].route.lazy !== undefined,
			`Matched leaf route at location "${location.pathname}${location.search}${location.hash}" ` +
				`does not have an element or Component. This means it will render an <Outlet /> with a ` +
				`null value by default resulting in an "empty" page.`,
		);
	}

	let renderedMatches = _renderMatches(
		matches &&
			matches.map((match) =>
				Object.assign({}, match, {
					params: Object.assign({}, parentParams, match.params),
					pathname: joinPaths([
						parentPathnameBase,
						// Re-encode pathnames that were decoded inside matchRoutes.
						// Pre-encode `%`, `?` and `#` ahead of `encodeLocation` because it uses
						// `new URL()` internally and we need to prevent it from treating
						// them as separators
						navigator.encodeLocation
							? navigator.encodeLocation(
									match.pathname.replace(/%/g, '%25').replace(/\?/g, '%3F').replace(/#/g, '%23'),
								).pathname
							: match.pathname,
					]),
					pathnameBase:
						match.pathnameBase === '/'
							? parentPathnameBase
							: joinPaths([
									parentPathnameBase,
									// Re-encode pathnames that were decoded inside matchRoutes
									// Pre-encode `%`, `?` and `#` ahead of `encodeLocation` because it uses
									// `new URL()` internally and we need to prevent it from treating
									// them as separators
									navigator.encodeLocation
										? navigator.encodeLocation(
												match.pathnameBase
													.replace(/%/g, '%25')
													.replace(/\?/g, '%3F')
													.replace(/#/g, '%23'),
											).pathname
										: match.pathnameBase,
								]),
				}),
			),
		parentMatches,
		dataRouterOpts,
	);

	// When a user passes in a `locationArg`, the associated routes need to
	// be wrapped in a new `LocationContext.Provider` in order for `useLocation`
	// to use the scoped location instead of the global location.
	if (locationArg && renderedMatches) {
		return createElement(LocationContext.Provider as any, {
			value: {
				location: {
					pathname: '/',
					search: '',
					hash: '',
					state: null,
					key: 'default',
					mask: undefined,
					...location,
				},
				navigationType: NavigationType.Pop,
			},
			children: renderedMatches,
		});
	}

	return renderedMatches;
}

// OCTANE: the inline `function DefaultErrorComponent()` lives in
// ./DefaultErrorComponent.tsrx (JSX needs a compiled file); imported above.
// Upstream: `const defaultErrorElement = <DefaultErrorComponent />;`
const defaultErrorElement = createElement(DefaultErrorComponent);

// OCTANE: the `class RenderErrorBoundary extends React.Component` lives in
// ./RenderErrorBoundary.tsrx (imported above, re-exported here to keep
// upstream's export surface). Its RSC digest decoding
// (decodeRouteErrorResponseDigest via the RSCRouterContext contextType) is
// dropped — no octane RSC runtime.
export { RenderErrorBoundary };

// OCTANE: dropped — `errorRedirectHandledMap` and the `RSCErrorHandler`
// component (RSC redirect-digest handling via decodeRedirectErrorDigest,
// parseToInfo, hasInvalidProtocol, isBrowser) have no octane RSC runtime.

interface RenderedRouteProps {
	routeContext: RouteContextObject;
	match: RouteMatch<string, RouteObject>;
	children: unknown | null;
}

function RenderedRoute({ routeContext, match, children }: RenderedRouteProps) {
	let dataRouterContext = useContext(DataRouterContext);

	// Track how deep we got in our render pass to emulate SSR componentDidCatch
	// in a DataStaticRouter
	if (
		dataRouterContext &&
		dataRouterContext.static &&
		dataRouterContext.staticContext &&
		(match.route.errorElement || match.route.ErrorBoundary)
	) {
		dataRouterContext.staticContext._deepestRenderedBoundaryId = match.route.id;
	}

	return createElement(RouteContext.Provider as any, { value: routeContext, children });
}

export function _renderMatches(
	matches: RouteMatch[] | null,
	parentMatches: RouteMatch[] = [],
	dataRouterOpts?: {
		state: DataRouter['state'];
		isStatic: boolean;
		onError: ClientOnErrorFunction | undefined;
		future: DataRouter['future'];
	},
): unknown {
	let dataRouterState = dataRouterOpts?.state;

	if (matches == null) {
		if (!dataRouterState) {
			return null;
		}

		if (dataRouterState.errors) {
			// Don't bail if we have data router errors so we can render them in the
			// boundary.  Use the pre-matched (or shimmed) matches
			matches = dataRouterState.matches as DataRouteMatch[];
		} else if (
			parentMatches.length === 0 &&
			!dataRouterState.initialized &&
			dataRouterState.matches.length > 0
		) {
			// Don't bail if we're initializing with partial hydration and we have
			// router matches.  That means we're actively running `patchRoutesOnNavigation`
			// so we should render down the partial matches to the appropriate
			// `HydrateFallback`.  We only do this if `parentMatches` is empty so it
			// only impacts the root matches for `RouterProvider` and no descendant
			// `<Routes>`
			matches = dataRouterState.matches as DataRouteMatch[];
		} else {
			return null;
		}
	}

	let renderedMatches = matches;

	// If we have data errors, trim matches to the highest error boundary
	let errors = dataRouterState?.errors;
	if (errors != null) {
		let errorIndex = renderedMatches.findIndex(
			(m) => m.route.id && errors?.[m.route.id] !== undefined,
		);
		invariant(
			errorIndex >= 0,
			`Could not find a matching route for errors on route IDs: ${Object.keys(errors).join(',')}`,
		);
		renderedMatches = renderedMatches.slice(0, Math.min(renderedMatches.length, errorIndex + 1));
	}

	// If we're in a partial hydration mode, detect if we need to render down to
	// a given HydrateFallback while we load the rest of the hydration data
	let renderFallback = false;
	let fallbackIndex = -1;
	if (dataRouterOpts && dataRouterState) {
		renderFallback = dataRouterState.renderFallback;
		for (let i = 0; i < renderedMatches.length; i++) {
			let match = renderedMatches[i];
			// Track the deepest fallback up until the first route without data
			if (match.route.HydrateFallback || match.route.hydrateFallbackElement) {
				fallbackIndex = i;
			}

			if (match.route.id) {
				let { loaderData, errors } = dataRouterState;
				let needsToRunLoader =
					match.route.loader &&
					!loaderData.hasOwnProperty(match.route.id) &&
					(!errors || errors[match.route.id] === undefined);
				if (match.route.lazy || needsToRunLoader) {
					// We found the first route that's not ready to render (waiting on
					// lazy, or has a loader that hasn't run yet) - render up until the
					// appropriate fallback
					if (dataRouterOpts.isStatic) {
						renderFallback = true;
					}
					if (fallbackIndex >= 0) {
						renderedMatches = renderedMatches.slice(0, fallbackIndex + 1);
					} else {
						renderedMatches = [renderedMatches[0]];
					}
					break;
				}
			}
		}
	}

	let onErrorHandler = dataRouterOpts?.onError;
	let onError =
		dataRouterState && onErrorHandler
			? (error: unknown, errorInfo?: unknown) => {
					onErrorHandler(error, {
						location: dataRouterState.location,
						params: dataRouterState.matches?.[0]?.params ?? {},
						pattern: getRoutePattern(dataRouterState.matches),
						errorInfo,
					});
				}
			: undefined;

	return renderedMatches.reduceRight((outlet, match, index) => {
		// Only data routers handle errors/fallbacks
		let error: any;
		let shouldRenderHydrateFallback = false;
		let errorElement: unknown | null = null;
		let hydrateFallbackElement: unknown | null = null;
		if (dataRouterState) {
			error = errors && match.route.id ? errors[match.route.id] : undefined;
			errorElement = match.route.errorElement || defaultErrorElement;

			if (renderFallback) {
				if (fallbackIndex < 0 && index === 0) {
					warningOnce(
						'route-fallback',
						false,
						'No `HydrateFallback` element provided to render during initial hydration',
					);
					shouldRenderHydrateFallback = true;
					hydrateFallbackElement = null;
				} else if (fallbackIndex === index) {
					shouldRenderHydrateFallback = true;
					hydrateFallbackElement = match.route.hydrateFallbackElement || null;
				}
			}
		}

		let matches = parentMatches.concat(renderedMatches.slice(0, index + 1));
		let getChildren = () => {
			let children: unknown;
			if (error) {
				children = errorElement;
			} else if (shouldRenderHydrateFallback) {
				children = hydrateFallbackElement;
			} else if (match.route.Component) {
				// Note: This is a de-optimized path since React won't re-use the
				// ReactElement since it's identity changes with each new
				// React.createElement call.  We keep this so folks can use
				// `<Route Component={...}>` in `<Routes>` but generally `Component`
				// usage is only advised in `RouterProvider` when we can convert it to
				// `element` ahead of time.
				children = createElement(match.route.Component as any);
			} else if (match.route.element) {
				children = match.route.element;
			} else {
				children = outlet;
			}

			return createElement(RenderedRoute as any, {
				match,
				routeContext: {
					outlet,
					matches,
					isDataRoute: dataRouterState != null,
				},
				children,
			});
		};
		// Only wrap in an error boundary within data router usages when we have an
		// ErrorBoundary/errorElement on this route.  Otherwise let it bubble up to
		// an ancestor ErrorBoundary/errorElement
		return dataRouterState && (match.route.ErrorBoundary || match.route.errorElement || index === 0)
			? createElement(RenderErrorBoundary as any, {
					location: dataRouterState.location,
					revalidation: dataRouterState.revalidation,
					component: errorElement,
					error,
					children: getChildren(),
					routeContext: { outlet: null, matches, isDataRoute: true },
					onError,
				})
			: getChildren();
	}, null as unknown);
}

enum DataRouterHook {
	UseBlocker = 'useBlocker',
	UseRevalidator = 'useRevalidator',
	UseNavigateStable = 'useNavigate',
}

enum DataRouterStateHook {
	UseBlocker = 'useBlocker',
	UseLoaderData = 'useLoaderData',
	UseActionData = 'useActionData',
	UseRouteError = 'useRouteError',
	UseNavigation = 'useNavigation',
	UseRouteLoaderData = 'useRouteLoaderData',
	UseMatches = 'useMatches',
	UseRevalidator = 'useRevalidator',
	UseNavigateStable = 'useNavigate',
	UseRouteId = 'useRouteId',
	UseRoute = 'useRoute',
	UseRouterState = 'unstable_useRouterState',
}

function getDataRouterConsoleError(hookName: DataRouterHook | DataRouterStateHook) {
	return `${hookName} must be used within a data router.  See https://reactrouter.com/en/main/routers/picking-a-router.`;
}

function useDataRouterContext(hookName: DataRouterHook) {
	let ctx = useContext(DataRouterContext);
	invariant(ctx, getDataRouterConsoleError(hookName));
	return ctx;
}

function useDataRouterState(hookName: DataRouterStateHook) {
	let state = useContext(DataRouterStateContext);
	invariant(state, getDataRouterConsoleError(hookName));
	return state;
}

function useRouteContext(hookName: DataRouterStateHook) {
	let route = useContext(RouteContext);
	invariant(route, getDataRouterConsoleError(hookName));
	return route;
}

// Internal version with hookName-aware debugging
function useCurrentRouteId(hookName: DataRouterStateHook) {
	let route = useRouteContext(hookName);
	let thisRoute = route.matches[route.matches.length - 1];
	invariant(
		thisRoute.route.id,
		`${hookName} can only be used on routes that contain a unique "id"`,
	);
	return thisRoute.route.id;
}

/**
 * Returns the ID for the nearest contextual route
 *
 * @category Hooks
 * @returns The ID of the nearest contextual route
 */
export function useRouteId() {
	return useCurrentRouteId(DataRouterStateHook.UseRouteId);
}

// Omit the fields from each navigation state individually to preserve the discriminated union
type UseNavigationResult = UseNavigationResultStates[keyof UseNavigationResultStates];

type UseNavigationResultStates = {
	Idle: Omit<NavigationStates['Idle'], 'matches' | 'historyAction'>;
	Loading: Omit<NavigationStates['Loading'], 'matches' | 'historyAction'>;
	Submitting: Omit<NavigationStates['Submitting'], 'matches' | 'historyAction'>;
};

/**
 * Returns the current {@link Navigation}, defaulting to an "idle" navigation
 * when no navigation is in progress. You can use this to render pending UI
 * (like a global spinner) or read [`FormData`](https://developer.mozilla.org/en-US/docs/Web/API/FormData)
 * from a form navigation.
 *
 * @example
 * import { useNavigation } from "react-router";
 *
 * function SomeComponent() {
 *   let navigation = useNavigation();
 *   navigation.state;
 *   navigation.formData;
 *   // etc.
 * }
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns The current {@link Navigation} object
 */
export function useNavigation(...args: any[]): UseNavigationResult {
	const [, slot] = splitSlot(args);
	let state = useDataRouterState(DataRouterStateHook.UseNavigation);
	return useMemo<UseNavigationResult>(
		() => {
			let { matches, historyAction, ...rest } = state.navigation;
			return rest;
		},
		[state.navigation],
		subSlot(slot, 'nav:memo'),
	);
}

/**
 * Revalidate the data on the page for reasons outside of normal data mutations
 * like [`Window` focus](https://developer.mozilla.org/en-US/docs/Web/API/Window/focus_event)
 * or polling on an interval.
 *
 * Note that page data is already revalidated automatically after actions.
 * If you find yourself using this for normal CRUD operations on your data in
 * response to user interactions, you're probably not taking advantage of the
 * other APIs like {@link useFetcher}, {@link Form}, {@link useSubmit} that do
 * this automatically.
 *
 * @example
 * import { useRevalidator } from "react-router";
 *
 * function WindowFocusRevalidator() {
 *   const revalidator = useRevalidator();
 *
 *   useFakeWindowFocus(() => {
 *     revalidator.revalidate();
 *   });
 *
 *   return (
 *     <div hidden={revalidator.state === "idle"}>
 *       Revalidating...
 *     </div>
 *   );
 * }
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns An object with a `revalidate` function and the current revalidation
 * `state`
 */
export function useRevalidator(...args: any[]): {
	revalidate: () => Promise<void>;
	state: DataRouter['state']['revalidation'];
} {
	const [, slot] = splitSlot(args);
	let dataRouterContext = useDataRouterContext(DataRouterHook.UseRevalidator);
	let state = useDataRouterState(DataRouterStateHook.UseRevalidator);
	let revalidate = useCallback(
		async () => {
			await dataRouterContext.router.revalidate();
		},
		[dataRouterContext.router],
		subSlot(slot, 'reval:cb'),
	);

	return useMemo(
		() => ({ revalidate, state: state.revalidation }),
		[revalidate, state.revalidation],
		subSlot(slot, 'reval:memo'),
	);
}

/**
 * Returns the active route matches, useful for accessing `loaderData` for
 * parent/child routes or the route [`handle`](../../start/framework/route-module#handle)
 * property
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns An array of {@link UIMatch | UI matches} for the current route hierarchy
 */
export function useMatches(...args: any[]): UIMatch[] {
	const [, slot] = splitSlot(args);
	let { matches, loaderData } = useDataRouterState(DataRouterStateHook.UseMatches);
	return useMemo(
		() => matches.map((m) => convertRouteMatchToUiMatch(m, loaderData)),
		[matches, loaderData],
		subSlot(slot, 'matches:memo'),
	);
}

// OCTANE: local substitute — upstream's `SerializeFrom` comes from
// ./types/route-data (framework-mode serialization typing, not vendored).
// Loose equivalent keeps the public hook generics shaped like upstream
// (tanstack-router precedent: loose public generics).
type SerializeFrom<T> = T extends (...args: any[]) => infer U ? Awaited<U> : Awaited<T>;

/**
 * Returns the data from the closest route
 * [`loader`](../../start/framework/route-module#loader) or
 * [`clientLoader`](../../start/framework/route-module#clientloader).
 *
 * @example
 * import { useLoaderData } from "react-router";
 *
 * export async function loader() {
 *   return await fakeDb.invoices.findAll();
 * }
 *
 * export default function Invoices() {
 *   let invoices = useLoaderData<typeof loader>();
 *   // ...
 * }
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns The data returned from the route's [`loader`](../../start/framework/route-module#loader) or [`clientLoader`](../../start/framework/route-module#clientloader) function
 */
export function useLoaderData<T = any>(): SerializeFrom<T> {
	let state = useDataRouterState(DataRouterStateHook.UseLoaderData);
	let routeId = useCurrentRouteId(DataRouterStateHook.UseLoaderData);
	return state.loaderData[routeId] as SerializeFrom<T>;
}

/**
 * Returns the [`loader`](../../start/framework/route-module#loader) data for a
 * given route by route ID.
 *
 * Route IDs are created automatically. They are simply the path of the route file
 * relative to the app folder without the extension.
 *
 * | Route Filename               | Route ID               |
 * | ---------------------------- | ---------------------- |
 * | `app/root.tsx`               | `"root"`               |
 * | `app/routes/teams.tsx`       | `"routes/teams"`       |
 * | `app/whatever/teams.$id.tsx` | `"whatever/teams.$id"` |
 *
 * @example
 * import { useRouteLoaderData } from "react-router";
 *
 * function SomeComponent() {
 *   const { user } = useRouteLoaderData("root");
 * }
 *
 * // You can also specify your own route ID's manually in your routes.ts file:
 * route("/", "containers/app.tsx", { id: "app" })
 * useRouteLoaderData("app");
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @param routeId The ID of the route to return loader data from
 * @returns The data returned from the specified route's [`loader`](../../start/framework/route-module#loader)
 * function, or `undefined` if not found
 */
export function useRouteLoaderData<T = any>(routeId: string): SerializeFrom<T> | undefined {
	let state = useDataRouterState(DataRouterStateHook.UseRouteLoaderData);
	return state.loaderData[routeId] as SerializeFrom<T> | undefined;
}

/**
 * Returns the [`action`](../../start/framework/route-module#action) data from
 * the most recent `POST` navigation form submission or `undefined` if there
 * hasn't been one.
 *
 * @example
 * import { Form, useActionData } from "react-router";
 *
 * export async function action({ request }) {
 *   const body = await request.formData();
 *   const name = body.get("visitorsName");
 *   return { message: `Hello, ${name}` };
 * }
 *
 * export default function Invoices() {
 *   const data = useActionData();
 *   return (
 *     <Form method="post">
 *       <input type="text" name="visitorsName" />
 *       {data ? data.message : "Waiting..."}
 *     </Form>
 *   );
 * }
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns The data returned from the route's [`action`](../../start/framework/route-module#action)
 * function, or `undefined` if no [`action`](../../start/framework/route-module#action)
 * has been called
 */
export function useActionData<T = any>(): SerializeFrom<T> | undefined {
	let state = useDataRouterState(DataRouterStateHook.UseActionData);
	let routeId = useCurrentRouteId(DataRouterStateHook.UseLoaderData);
	return (state.actionData ? state.actionData[routeId] : undefined) as SerializeFrom<T> | undefined;
}

/**
 * Accesses the error thrown during an
 * [`action`](../../start/framework/route-module#action),
 * [`loader`](../../start/framework/route-module#loader),
 * or component render to be used in a route module
 * [`ErrorBoundary`](../../start/framework/route-module#errorboundary).
 *
 * @example
 * export function ErrorBoundary() {
 *   const error = useRouteError();
 *   return <div>{error.message}</div>;
 * }
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns The error that was thrown during route [loading](../../start/framework/route-module#loader),
 * [`action`](../../start/framework/route-module#action) execution, or rendering
 */
export function useRouteError(): unknown {
	let error = useContext(RouteErrorContext);
	let state = useDataRouterState(DataRouterStateHook.UseRouteError);
	let routeId = useCurrentRouteId(DataRouterStateHook.UseRouteError);

	// If this was a render error, we put it in a RouteError context inside
	// of RenderErrorBoundary
	if (error !== undefined) {
		return error;
	}

	// Otherwise look for errors from our data router state
	return state.errors?.[routeId];
}

/**
 * Returns the resolved promise value from the closest {@link Await | `<Await>`}.
 *
 * @example
 * function SomeDescendant() {
 *   const value = useAsyncValue();
 *   // ...
 * }
 *
 * // somewhere in your app
 * <Await resolve={somePromise}>
 *   <SomeDescendant />
 * </Await>;
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns The resolved value from the nearest {@link Await} component
 */
export function useAsyncValue(): unknown {
	let value = useContext(AwaitContext);
	return value?._data;
}

/**
 * Returns the rejection value from the closest {@link Await | `<Await>`}.
 *
 * @example
 * import { Await, useAsyncError } from "react-router";
 *
 * function ErrorElement() {
 *   const error = useAsyncError();
 *   return (
 *     <p>Uh Oh, something went wrong! {error.message}</p>
 *   );
 * }
 *
 * // somewhere in your app
 * <Await
 *   resolve={promiseThatRejects}
 *   errorElement={<ErrorElement />}
 * />;
 *
 * @public
 * @category Hooks
 * @mode framework
 * @mode data
 * @returns The error that was thrown in the nearest {@link Await} component
 */
export function useAsyncError(): unknown {
	let value = useContext(AwaitContext);
	return value?._error;
}

let blockerId = 0;

/**
 * Allow the application to block navigations within the SPA and present the
 * user a confirmation dialog to confirm the navigation.
 */
export function useBlocker(shouldBlock: boolean | BlockerFunction, ...args: any[]): Blocker {
	const [, slot] = splitSlot(args);
	let { router, basename } = useDataRouterContext(DataRouterHook.UseBlocker);
	let state = useDataRouterState(DataRouterStateHook.UseBlocker);

	let [blockerKey, setBlockerKey] = useState('', subSlot(slot, 'ub:key'));
	let blockerFunction = useCallback(
		((arg: Parameters<BlockerFunction>[0]) => {
			if (typeof shouldBlock !== 'function') {
				return !!shouldBlock;
			}
			if (basename === '/') {
				return shouldBlock(arg);
			}

			// If they provided us a function and we've got an active basename, strip
			// it from the locations we expose to the user to match the behavior of
			// useLocation
			let { currentLocation, nextLocation, historyAction } = arg;
			return shouldBlock({
				currentLocation: {
					...currentLocation,
					pathname: stripBasename(currentLocation.pathname, basename) || currentLocation.pathname,
				},
				nextLocation: {
					...nextLocation,
					pathname: stripBasename(nextLocation.pathname, basename) || nextLocation.pathname,
				},
				historyAction,
			});
		}) as BlockerFunction,
		[basename, shouldBlock],
		subSlot(slot, 'ub:fn'),
	);

	// This effect is in charge of blocker key assignment and deletion (which is
	// tightly coupled to the key)
	useEffect(
		() => {
			let key = String(++blockerId);
			setBlockerKey(key);
			return () => router.deleteBlocker(key);
		},
		[router],
		subSlot(slot, 'ub:keyEff'),
	);

	// This effect handles assigning the blockerFunction.  This is to handle
	// unstable blocker function identities, and happens only after the prior
	// effect so we don't get an orphaned blockerFunction in the router with a
	// key of "".  Until then we just have the IDLE_BLOCKER.
	useEffect(
		() => {
			if (blockerKey !== '') {
				router.getBlocker(blockerKey, blockerFunction);
			}
		},
		[router, blockerKey, blockerFunction],
		subSlot(slot, 'ub:fnEff'),
	);

	// Prefer the blocker from `state` not `router.state` since DataRouterContext
	// is memoized so this ensures we update on blocker state updates
	return blockerKey && state.blockers.has(blockerKey)
		? state.blockers.get(blockerKey)!
		: IDLE_BLOCKER;
}

// Stable version of useNavigate that is used when we are in the context of
// a RouterProvider.
function useNavigateStable(slot?: symbol): NavigateFunction {
	let { router } = useDataRouterContext(DataRouterHook.UseNavigateStable);
	let id = useCurrentRouteId(DataRouterStateHook.UseNavigateStable);

	let activeRef = useRef(false, subSlot(slot, 'snav:ref'));
	useLayoutEffect(
		() => {
			activeRef.current = true;
		},
		undefined,
		subSlot(slot, 'snav:ile'),
	);

	let navigate: NavigateFunction = useCallback(
		async (to: To | number, options: NavigateOptions = {}) => {
			warning(activeRef.current, navigateEffectWarning);

			// Short circuit here since if this happens on first render the navigate
			// is useless because we haven't wired up our router subscriber yet
			if (!activeRef.current) return;

			if (typeof to === 'number') {
				await router.navigate(to);
			} else {
				await router.navigate(to, { fromRouteId: id, ...options });
			}
		},
		[router, id],
		subSlot(slot, 'snav:cb'),
	);

	return navigate;
}

const alreadyWarned: Record<string, boolean> = {};

function warningOnce(key: string, cond: boolean, message: string) {
	if (!cond && !alreadyWarned[key]) {
		alreadyWarned[key] = true;
		warning(false, message);
	}
}

// OCTANE: upstream types useRoute over ./types/register's RouteModules and
// ./types/route-data's GetLoaderData/GetActionData (framework-mode
// serialization typing, not vendored) — declared loosely here.
export function useRoute(...args: any[]): any {
	const [user] = splitSlot(args);
	const currentRouteId = useCurrentRouteId(DataRouterStateHook.UseRoute);
	const id: string = user[0] ?? currentRouteId;

	const state = useDataRouterState(DataRouterStateHook.UseRoute);
	const route = state.matches.find(({ route }) => route.id === id);

	if (route === undefined) return undefined;
	return {
		handle: route.route.handle,
		loaderData: state.loaderData[id],
		actionData: state.actionData?.[id],
	};
}

/**
 * A single route match returned from `unstable_useRouterState`. Mirrors
 * UIMatch minus the data-related fields (`data`, `loaderData`).
 */
export type unstable_RouterStateMatch<Handle = unknown> = Omit<
	UIMatch<unknown, Handle>,
	'data' | 'loaderData'
>;

export type unstable_RouterStateActiveVariant = {
	location: Location;
	searchParams: URLSearchParams;
	params: Params;
	matches: unstable_RouterStateMatch[];
	type: NavigationType;
};

export type unstable_RouterStatePendingVariant = unstable_RouterStateActiveVariant & {
	state: 'loading' | 'submitting';
	formMethod: string | undefined;
	formAction: string | undefined;
	formEncType: string | undefined;
	formData: FormData | undefined;
	json: unknown;
	text: string | undefined;
};

export type unstable_RouterState = {
	active: unstable_RouterStateActiveVariant;
	pending: unstable_RouterStatePendingVariant | null;
};

function toRouterStateMatch(match: DataRouteMatch): unstable_RouterStateMatch {
	return {
		id: match.route.id,
		pathname: match.pathname,
		params: match.params,
		handle: match.route.handle,
	};
}

/**
 * A unified hook for reading router state: current (`active`) and in-flight
 * (`pending`) locations, search params, params, matches, and navigation type.
 */
export function useRouterState(...args: any[]): unstable_RouterState {
	const [, slot] = splitSlot(args);
	let {
		location,
		historyAction: type,
		matches,
		navigation,
	} = useDataRouterState(DataRouterStateHook.UseRouterState);

	let active = useMemo(
		() => ({
			type,
			location,
			searchParams: new URLSearchParams(location.search),
			params: matches[matches.length - 1]?.params ?? {},
			matches: matches.map((m) => toRouterStateMatch(m)),
		}),
		[location, matches, type],
		subSlot(slot, 'urs:active'),
	) as unstable_RouterStateActiveVariant;

	let pending = useMemo(
		() => {
			if (navigation.state === 'idle') return null;
			let shared = {
				type: navigation.historyAction,
				location: navigation.location,
				searchParams: new URLSearchParams(navigation.location.search),
				params: navigation.matches[navigation.matches.length - 1]?.params ?? {},
				matches: navigation.matches.map((m: DataRouteMatch) => toRouterStateMatch(m)),
			};

			// Do submissions fields independently to keep TS happy with the
			// `NavigationStates` discriminated union
			return navigation.state === 'loading'
				? {
						...shared,
						state: 'loading',
						formMethod: navigation.formMethod,
						formAction: navigation.formAction,
						formEncType: navigation.formEncType,
						formData: navigation.formData,
						json: navigation.json,
						text: navigation.text,
					}
				: {
						...shared,
						state: 'submitting',
						formMethod: navigation.formMethod,
						formAction: navigation.formAction,
						formEncType: navigation.formEncType,
						formData: navigation.formData,
						json: navigation.json,
						text: navigation.text,
					};
		},
		[navigation],
		subSlot(slot, 'urs:pending'),
	) as unstable_RouterStatePendingVariant | null;

	return useMemo(
		() => ({ active, pending }),
		[active, pending],
		subSlot(slot, 'urs:combined'),
	) as unstable_RouterState;
}

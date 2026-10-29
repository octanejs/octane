'use strong';

// RouterProvider uses the browser's view transition and waits for the published
// context and destination DOM to commit before completing an asynchronous update.
import {
	memo,
	startTransition,
	useCallback,
	useEffect,
	useLayoutEffect,
	useLinkedState,
	useMemo,
	useOptimistic,
	useRef,
} from 'octane';
import {
	DataRouterContext,
	DataRouterStateContext,
	FetchersContext,
	ViewTransitionContext,
} from '../context.ts';
import type {
	ClientOnErrorFunction,
	FetchersContextObject,
	Navigator,
	ViewTransitionContextObject,
} from '../context.ts';
import type { Router as DataRouter, RouterState, RouterSubscriber } from '../router/router.ts';
import { getRoutePattern } from '../router/utils.ts';
import type { RouteManifest, RouteObject } from '../router/utils.ts';
import { useOutlet, useRoutesImpl } from '../hooks.ts';
import { Router } from './Router.tsrx';
import { Deferred, getOptimisticRouterState, warnOnce } from './utils.ts';

export function Outlet(props: { context?: unknown }) {
	return useOutlet(props.context);
}

type DataRoutesProps = {
	routes: RouteObject[];
	manifest?: RouteManifest;
	future?: unknown;
	state: RouterState;
	isStatic?: boolean;
	onError?: ClientOnErrorFunction;
};

export function DataRoutes(props: DataRoutesProps) {
	return useRoutesImpl(props.routes, undefined, {
		manifest: props.manifest,
		state: props.state,
		isStatic: props.isStatic,
		onError: props.onError,
		future: props.future,
	});
}

// Memoize to avoid re-renders when updating `ViewTransitionContext`
const MemoizedDataRoutes = memo(DataRoutes);

type RouterProviderProps = {
	router: DataRouter;
	flushSync?: (fn: () => unknown) => undefined;
	onError?: ClientOnErrorFunction;
	useTransitions?: boolean;
};

type ActiveViewTransition = {
	router: DataRouter;
	locationKey: string;
	context: ViewTransitionContextObject;
	contextCommitted: Deferred<void>;
	destinationCommitted: Deferred<void>;
	updateStarted: boolean;
	browser?: ViewTransition;
	next?: { locationKey: string; begin: () => void };
};

export function RouterProvider(props: RouterProviderProps) @{
	const { router, flushSync: reactDomFlushSyncImpl, onError, useTransitions } = props;

	const [_state, setStateImpl] = useLinkedState(router, (source) => source.state);
	// OCTANE NOTE: React's useOptimistic falls back to basicStateReducer, which
	// applies function updaters — octane's default replaces the state with the
	// raw queued value, so the upstream `setOptimisticState((s) => …)` call sites
	// need the reducer spelled out to keep updater semantics.
	const [state, setOptimisticState] = useOptimistic<
		RouterState,
		(current: RouterState) => RouterState
	>(_state, (current, update) => update(current));
	const [vtContext, setVtContext] = useLinkedState<DataRouter, ViewTransitionContextObject>(
		router,
		() => ({ isTransitioning: false }),
	);
	const [fetcherData, setFetcherData] = useLinkedState<DataRouter, FetchersContextObject>(
		router,
		() => new Map(),
	);
	const activeTransition = useRef<ActiveViewTransition | null>(null);

	const setState = useCallback<RouterSubscriber>(
		(newState, { deletedFetchers, newErrors, flushSync, viewTransitionOpts }) => {
			// Send router errors through onError
			if (newErrors && onError) {
				Object.values(newErrors).forEach((error) =>
					onError(error, {
						location: newState.location,
						params: newState.matches[0]?.params ?? {},
						pattern: getRoutePattern(newState.matches),
					}),
				);
			}

			if (newState.fetchers.size || deletedFetchers.length) {
				// The router trims idle fetchers immediately after notifying subscribers.
				const changes = new Map<string, unknown>();
				for (const [key, { data }] of newState.fetchers) {
					if (data !== undefined) changes.set(key, data);
				}
				for (const key of deletedFetchers) changes.set(key, undefined);
				if (changes.size) {
					setFetcherData((previous) => {
						let next: FetchersContextObject | undefined;
						for (const [key, data] of changes) {
							if (Object.is(previous.get(key), data)) continue;
							next ??= new Map(previous);
							if (data === undefined) next.delete(key);
							else next.set(key, data);
						}
						return next ?? previous;
					});
				}
			}

			warnOnce(
				flushSync === false || reactDomFlushSyncImpl != null,
				'You provided the `flushSync` option to a router update, ' +
					'but you are not using the `<RouterProvider>` from `@octanejs/remix-router/dom` ' +
					'so `flushSync()` is unavailable.  Please update your app ' +
					'to `import { RouterProvider } from "@octanejs/remix-router/dom"` ' +
					'to use the `flushSync` option.',
			);

			const isViewTransitionAvailable =
				router.window != null &&
				router.window.document != null &&
				typeof router.window.document.startViewTransition === 'function';

			warnOnce(
				viewTransitionOpts == null || isViewTransitionAvailable,
				'You provided the `viewTransition` option to a router update, ' +
					'but you do not appear to be running in a DOM environment as ' +
					'`window.startViewTransition` is not available.',
			);

			const flush = flushSync ? reactDomFlushSyncImpl : undefined;
			const update = (nextState: RouterState) => {
				if (flush) {
					flush(() => setStateImpl(nextState));
				} else if (useTransitions === false) {
					setStateImpl(nextState);
				} else {
					startTransition(() => {
						if (useTransitions === true) {
							setOptimisticState((s) => getOptimisticRouterState(s, nextState));
						}
						setStateImpl(nextState);
					});
				}
			};
			if (!viewTransitionOpts || !isViewTransitionAvailable) {
				const previous = activeTransition.current;
				// Keep the outgoing DOM intact until the browser takes its snapshot.
				// The update callback will read the latest data for this destination.
				if (
					previous &&
					(newState.location.key === previous.next?.locationKey ||
						(newState.location.key === previous.locationKey && !previous.updateStarted))
				)
					return;
				if (previous && newState.location.key !== previous.locationKey) {
					activeTransition.current = null;
					previous.contextCommitted.resolve();
					previous.destinationCommitted.resolve();
					previous.browser?.skipTransition();
					setVtContext({ isTransitioning: false });
				}
				update(newState);
				return;
			}

			const begin = () => {
				if (router.state.location.key !== newState.location.key) return;
				const active: ActiveViewTransition = {
					router,
					locationKey: newState.location.key,
					context: { isTransitioning: true, flushSync: !!flush, ...viewTransitionOpts },
					contextCommitted: new Deferred<void>(),
					destinationCommitted: new Deferred<void>(),
					updateStarted: false,
				};
				activeTransition.current = active;

				const start = () => {
					if (activeTransition.current !== active) return;
					const transition = router.window!.document.startViewTransition(() => {
						// A delayed browser callback must not replay an older location or its old loader data.
						const latest = router.state;
						if (activeTransition.current !== active || latest.location.key !== active.locationKey)
							return;
						active.updateStarted = true;
						update(latest);
						if (!flush) return active.destinationCommitted.promise;
					});
					active.browser = transition;
					const finish = () => {
						if (activeTransition.current !== active) return;
						active.context = { isTransitioning: false };
						active.contextCommitted = new Deferred<void>();
						if (flush) flush(() => setVtContext(active.context));
						else setVtContext(active.context);

						// An interruption starts after the prior transition's context leaves the DOM.
						void active.contextCommitted.promise.then(() => {
							if (activeTransition.current !== active) return;
							activeTransition.current = null;
							active.next?.begin();
						});
					};
					void transition.finished.then(finish, finish);
				};
				if (flush) {
					flush(() => setVtContext(active.context));
					start();
				} else {
					setVtContext(active.context);
					void active.contextCommitted.promise.then(start);
				}
			};
			const previous = activeTransition.current;
			if (previous) {
				previous.destinationCommitted.resolve();
				previous.browser?.skipTransition();
				if (previous.browser && !flush) {
					previous.next = { locationKey: newState.location.key, begin };
					return;
				}
				// A superseded transition might still be waiting to publish its context.
				previous.contextCommitted.resolve();
			}
			begin();
		},
	);

	// Need to use a layout effect here so we are subscribed early enough to
	// pick up on any render-driven redirects/navigations (useEffect/<Navigate>).
	// If the router finished initializing (and emitted errors) before this
	// subscriber was attached, `subscribe()` replays that notification so
	// `onError` still fires for initial data load errors.
	useLayoutEffect(() => router.subscribe(setState));

	useEffect(() => {
		const active = activeTransition.current;
		if (!active) return;
		if (active.context === vtContext) active.contextCommitted.resolve();
		if (active.locationKey === state.location.key) active.destinationCommitted.resolve();
	});
	useLayoutEffect(() => () => {
		const active = activeTransition.current;
		if (!active || active.router !== router) return;
		activeTransition.current = null;
		active.contextCommitted.resolve();
		active.destinationCommitted.resolve();
		active.browser?.skipTransition();
	});

	const navigator = useMemo<Navigator>(() => {
		return {
			createHref: router.createHref,
			encodeLocation: router.encodeLocation,
			go: (n) => router.navigate(n),
			push: (to, state2, opts) =>
				router.navigate(to, {
					state: state2,
					preventScrollReset: opts?.preventScrollReset,
				}),
			replace: (to, state2, opts) =>
				router.navigate(to, {
					replace: true,
					state: state2,
					preventScrollReset: opts?.preventScrollReset,
				}),
		};
	});

	const basename = router.basename || '/';

	const dataRouterContext = useMemo(() => ({
		router,
		navigator,
		static: false,
		basename,
		onError,
	}));

	// The fragment shape mirrors upstream (kept for useId stability parity with
	// the server-rendered StaticRouterProvider in a later phase).
	<>
		<DataRouterContext value={dataRouterContext}>
			<DataRouterStateContext value={state}>
				<FetchersContext value={fetcherData}>
					<ViewTransitionContext value={vtContext}>
						<Router
							basename={basename}
							location={state.location}
							navigationType={state.historyAction}
							navigator={navigator}
							useTransitions={useTransitions}
						>
							<MemoizedDataRoutes
								routes={router.routes}
								manifest={router.manifest}
								future={router.future}
								state={state}
								isStatic={false}
								onError={onError}
							/>
						</Router>
					</ViewTransitionContext>
				</FetchersContext>
			</DataRouterStateContext>
		</DataRouterContext>
	</>
}

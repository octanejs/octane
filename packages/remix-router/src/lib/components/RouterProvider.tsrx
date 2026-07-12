// RouterProvider + DataRoutes + Outlet — transcribed from react-router@7.18.1
// lib/components.tsx onto octane. Structure preserved verbatim: useState for
// router state + layout-effect subscription (early enough for render-driven
// redirects; subscribe() replays a pre-attach notification), useOptimistic for
// the optimistic in-flight state, and the three commit paths — plain
// startTransition, flushSync + startViewTransition, and startTransition INSIDE
// the deferred startViewTransition callback (which is exactly what octane's
// transition-at-commit constraint requires — see tanstack-router's
// src/router.ts:19-53 for the background). jsdom has no startViewTransition,
// so the VT paths are dormant under tests until Phase E exercises them.
//
// Octane substitutions: hooks from 'octane' (useOptimistic exists — upstream's
// useOptimisticSafe feature-detection collapses to a direct call), memo() for
// MemoizedDataRoutes, and the RSC branch dropped (RSCRouterContext is
// hardwired false in this port).
import {
	memo,
	startTransition,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useOptimistic,
	useRef,
	useState,
} from 'octane';
import {
	DataRouterContext,
	DataRouterStateContext,
	FetchersContext,
	ViewTransitionContext,
} from '../context.ts';
import { getRoutePattern } from '../router/utils.ts';
import { useOutlet, useRoutesImpl } from '../hooks.ts';
import { Router } from './Router.tsrx';
import { Deferred, getOptimisticRouterState, warnOnce } from './utils.ts';

export function Outlet(props) {
	return useOutlet(props.context);
}

export function DataRoutes(props) {
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

export function RouterProvider(props) @{
	const { router, flushSync: reactDomFlushSyncImpl, onError, useTransitions } = props;

	const [_state, setStateImpl] = useState(router.state);
	const [state, setOptimisticState] = useOptimistic(_state);
	const [pendingState, setPendingState] = useState(undefined);
	const [vtContext, setVtContext] = useState({ isTransitioning: false });
	const [renderDfd, setRenderDfd] = useState(undefined);
	const [transition, setTransition] = useState(undefined);
	const [interruption, setInterruption] = useState(undefined);
	const fetcherData = useRef(new Map());

	const setState = useCallback((
		newState,
		{ deletedFetchers, newErrors, flushSync, viewTransitionOpts },
	) => {
		// Send router errors through onError
		if (newErrors && onError) {
			Object.values(newErrors).forEach(
				(error) => onError(error, {
					location: newState.location,
					params: newState.matches[0]?.params ?? {},
					pattern: getRoutePattern(newState.matches),
				}),
			);
		}

		newState.fetchers.forEach((fetcher, key) => {
			if (fetcher.data !== undefined) {
				fetcherData.current.set(key, fetcher.data);
			}
		});
		deletedFetchers.forEach((key) => fetcherData.current.delete(key));

		warnOnce(
			flushSync === false || reactDomFlushSyncImpl != null,
			'You provided the `flushSync` option to a router update, ' +
				'but you are not using the `<RouterProvider>` from `@octanejs/remix-router/dom` ' +
				'so `flushSync()` is unavailable.  Please update your app ' +
				'to `import { RouterProvider } from "@octanejs/remix-router/dom"` ' +
				'to use the `flushSync` option.',
		);

		const isViewTransitionAvailable =
			router.window != null && router.window.document != null &&
				typeof router.window.document.startViewTransition === 'function';

		warnOnce(
			viewTransitionOpts == null || isViewTransitionAvailable,
			'You provided the `viewTransition` option to a router update, ' +
				'but you do not appear to be running in a DOM environment as ' +
				'`window.startViewTransition` is not available.',
		);

		// If this isn't a view transition or it's not available in this browser,
		// just update and be done with it
		if (!viewTransitionOpts || !isViewTransitionAvailable) {
			if (reactDomFlushSyncImpl && flushSync) {
				reactDomFlushSyncImpl(() => setStateImpl(newState));
			} else if (useTransitions === false) {
				setStateImpl(newState);
			} else {
				startTransition(() => {
					if (useTransitions === true) {
						setOptimisticState((s) => getOptimisticRouterState(s, newState));
					}
					setStateImpl(newState);
				});
			}
			return;
		}

		// flushSync + startViewTransition
		if (reactDomFlushSyncImpl && flushSync) {
			// Flush through the context to mark DOM elements as transition=ing
			reactDomFlushSyncImpl(() => {
				// Cancel any pending transitions
				if (transition) {
					renderDfd?.resolve();
					transition.skipTransition();
				}
				setVtContext({
					isTransitioning: true,
					flushSync: true,
					currentLocation: viewTransitionOpts.currentLocation,
					nextLocation: viewTransitionOpts.nextLocation,
				});
			});

			// Update the DOM
			const t = router.window.document.startViewTransition(() => {
				reactDomFlushSyncImpl(() => setStateImpl(newState));
			});

			// Clean up after the animation completes
			t.finished.finally(() => {
				reactDomFlushSyncImpl(() => {
					setRenderDfd(undefined);
					setTransition(undefined);
					setPendingState(undefined);
					setVtContext({ isTransitioning: false });
				});
			});

			reactDomFlushSyncImpl(() => setTransition(t));
			return;
		}

		// startTransition + startViewTransition
		if (transition) {
			// Interrupting an in-progress transition, cancel and let everything flush
			// out, and then kick off a new transition from the interruption state
			renderDfd?.resolve();
			transition.skipTransition();
			setInterruption({
				state: newState,
				currentLocation: viewTransitionOpts.currentLocation,
				nextLocation: viewTransitionOpts.nextLocation,
			});
		} else {
			// Completed navigation update with opted-in view transitions, let 'er rip
			setPendingState(newState);
			setVtContext({
				isTransitioning: true,
				flushSync: false,
				currentLocation: viewTransitionOpts.currentLocation,
				nextLocation: viewTransitionOpts.nextLocation,
			});
		}
	}, [
		router.window,
		reactDomFlushSyncImpl,
		transition,
		renderDfd,
		useTransitions,
		setOptimisticState,
		onError,
	]);

	// Need to use a layout effect here so we are subscribed early enough to
	// pick up on any render-driven redirects/navigations (useEffect/<Navigate>).
	// If the router finished initializing (and emitted errors) before this
	// subscriber was attached, `subscribe()` replays that notification so
	// `onError` still fires for initial data load errors.
	useLayoutEffect(() => router.subscribe(setState), [router, setState]);

	// When we start a view transition, create a Deferred we can use for the
	// eventual "completed" render
	useEffect(() => {
		if (vtContext.isTransitioning && !vtContext.flushSync) {
			setRenderDfd(new Deferred());
		}
	}, [vtContext]);

	// Once the deferred is created, kick off startViewTransition() to update the
	// DOM and then wait on the Deferred to resolve (indicating the DOM update has
	// happened)
	useEffect(() => {
		if (renderDfd && pendingState && router.window) {
			const newState = pendingState;
			const renderPromise = renderDfd.promise;
			const t = router.window.document.startViewTransition(async () => {
				if (useTransitions === false) {
					setStateImpl(newState);
				} else {
					startTransition(() => {
						if (useTransitions === true) {
							setOptimisticState((s) => getOptimisticRouterState(s, newState));
						}
						setStateImpl(newState);
					});
				}
				await renderPromise;
			});
			t.finished.finally(() => {
				setRenderDfd(undefined);
				setTransition(undefined);
				setPendingState(undefined);
				setVtContext({ isTransitioning: false });
			});
			setTransition(t);
		}
	}, [pendingState, renderDfd, router.window, useTransitions, setOptimisticState]);

	// When the new location finally renders and is committed to the DOM, this
	// effect will run to resolve the transition
	useEffect(() => {
		if (renderDfd && pendingState && state.location.key === pendingState.location.key) {
			renderDfd.resolve();
		}
	}, [renderDfd, transition, state.location, pendingState]);

	// If we get interrupted with a new navigation during a transition, we skip
	// the active transition, let it cleanup, then kick it off again here
	useEffect(() => {
		if (!vtContext.isTransitioning && interruption) {
			setPendingState(interruption.state);
			setVtContext({
				isTransitioning: true,
				flushSync: false,
				currentLocation: interruption.currentLocation,
				nextLocation: interruption.nextLocation,
			});
			setInterruption(undefined);
		}
	}, [vtContext.isTransitioning, interruption]);

	const navigator = useMemo(() => {
		return {
			createHref: router.createHref,
			encodeLocation: router.encodeLocation,
			go: (n) => router.navigate(n),
			push: (to, state2, opts) => router.navigate(to, {
				state: state2,
				preventScrollReset: opts?.preventScrollReset,
			}),
			replace: (to, state2, opts) => router.navigate(to, {
				replace: true,
				state: state2,
				preventScrollReset: opts?.preventScrollReset,
			}),
		};
	}, [router]);

	const basename = router.basename || '/';

	const dataRouterContext = useMemo(
		() => ({
			router,
			navigator,
			static: false,
			basename,
			onError,
		}),
		[router, navigator, basename, onError],
	);

	// The fragment shape mirrors upstream (kept for useId stability parity with
	// the server-rendered StaticRouterProvider in a later phase).
	<>
		<DataRouterContext.Provider value={dataRouterContext}>
			<DataRouterStateContext.Provider value={state}>
				<FetchersContext.Provider value={fetcherData.current}>
					<ViewTransitionContext.Provider value={vtContext}>
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
					</ViewTransitionContext.Provider>
				</FetchersContext.Provider>
			</DataRouterStateContext.Provider>
		</DataRouterContext.Provider>
	</>
}

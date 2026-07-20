// `createRouter` — the only piece of `RouterCore` setup that's framework-specific.
// `RouterCore`'s constructor takes `(options, getStoreFactory)`; react-router
// passes a factory that, on the client, builds REACTIVE atoms (`createAtom`/`batch`
// from `@tanstack/store`) and, on the server, non-reactive snapshot stores. Those
// atoms are framework-agnostic — `createAtom` lives in `@tanstack/store`, not in
// `@tanstack/react-store` — so octane reuses the exact same factory. The reactive
// atoms expose `.subscribe(cb) → { unsubscribe }` + `.get()`, which `useStore` binds
// to octane's `useSyncExternalStore`.
import {
	RouterCore,
	createNonReactiveMutableStore,
	createNonReactiveReadonlyStore,
} from '@tanstack/router-core';
import { createAtom, batch } from '@tanstack/store';
import { startTransition } from 'octane';
import type { RouterHistory } from '@tanstack/history';
import type {
	AnyRoute,
	CreateRouterFn,
	RouterConstructorOptions,
	TrailingSlashOption,
} from '@tanstack/router-core';

const isServerEnv = typeof document === 'undefined';

// Every reactive router commit funnels through the store factory's `batch`:
// `beforeLoad` (location + pending matches), the resolved `onReady` commit
// (active matches + search), `setMatches`/`setPending`/`setCached`, and
// `invalidate`. Wrap it in octane's `startTransition` so the resulting
// `__store`/per-match notifications schedule TRANSITION-priority renders.
//
// Why this is needed: router-core already wraps navigation in
// `router.startTransition` (Transitioner.tsrx), but the RESOLVED commit is run
// inside `startViewTransition(fn)`, and a real browser defers `fn` to a later
// task. By then octane's transition window (TRANSITION_DEPTH / the async
// `startTransition` window) has closed, so the commit would schedule an URGENT
// re-render. For a same-route `?page` change that urgent re-render lands on a
// suspending descendant (the route component reading `useSearch`), and an urgent
// suspend does NOT hold — the route's pending fallback flashes. Re-asserting the
// transition AT COMMIT TIME makes that re-render ride the concurrent-navigation
// transition, so octane keeps the current page on screen until the new one is
// ready (matching cross-route navigation). `startTransition` is re-entrant, so
// nesting (router-core's own startTransition → this batch) is a no-op extra
// level; non-navigation router commits ride a transition too, which is harmless
// (router stores are only ever mutated by router internals, never by urgent user
// state). SSR uses the non-reactive factory below and is unaffected.
const octaneStoreFactory = (opts: { isServer?: boolean }) => {
	if (opts?.isServer ?? isServerEnv) {
		return {
			createMutableStore: createNonReactiveMutableStore,
			createReadonlyStore: createNonReactiveReadonlyStore,
			batch: (fn: () => void) => fn(),
		};
	}
	return {
		createMutableStore: createAtom,
		createReadonlyStore: createAtom,
		batch: (fn: () => void) => startTransition(() => batch(fn)),
	};
};

export class Router<
	in out TRouteTree extends AnyRoute,
	in out TTrailingSlashOption extends TrailingSlashOption = 'never',
	in out TDefaultStructuralSharingOption extends boolean = false,
	in out TRouterHistory extends RouterHistory = RouterHistory,
	in out TDehydrated extends Record<string, any> = Record<string, any>,
> extends RouterCore<
	TRouteTree,
	TTrailingSlashOption,
	TDefaultStructuralSharingOption,
	TRouterHistory,
	TDehydrated
> {
	constructor(
		options: RouterConstructorOptions<
			TRouteTree,
			TTrailingSlashOption,
			TDefaultStructuralSharingOption,
			TRouterHistory,
			TDehydrated
		>,
	) {
		super(options, octaneStoreFactory);

		// router-core starts the resolved-match commit through startViewTransition,
		// whose browser callback may run after router-core's load promise resolves.
		// Track those callbacks so `await router.load()` is a real render-readiness
		// boundary: the active match tree is committed before a consumer's first
		// render or hydration pass.
		const coreLoad = this.load.bind(this);
		const coreStartViewTransition = this.startViewTransition.bind(this);
		const pendingViewCommits = new Set<Promise<void>>();
		const activeLoadScopes = new Set<Set<Promise<void>>>();

		this.startViewTransition = (fn: () => Promise<void>) => {
			let resolveCommit!: () => void;
			let rejectCommit!: (error: unknown) => void;
			const commit = new Promise<void>((resolve, reject) => {
				resolveCommit = resolve;
				rejectCommit = reject;
			});
			pendingViewCommits.add(commit);
			for (const scope of activeLoadScopes) scope.add(commit);
			// Keep only unsettled callbacks globally. A later load waits for a prior
			// callback so no mutation can land after its readiness boundary, but only
			// the active scopes above own (and therefore propagate) this failure.
			void commit.then(
				() => pendingViewCommits.delete(commit),
				() => pendingViewCommits.delete(commit),
			);

			const runCommit = async () => {
				try {
					await fn();
					resolveCommit();
				} catch (error) {
					rejectCommit(error);
				}
			};

			try {
				coreStartViewTransition(runCommit);
			} catch (error) {
				rejectCommit(error);
				throw error;
			}
		};

		this.load = async (...args: any[]) => {
			const prerequisiteCommits = new Set(pendingViewCommits);
			const viewCommits = new Set<Promise<void>>();
			activeLoadScopes.add(viewCommits);
			let hasLoadError = false;
			let loadError: unknown;
			let result: void;
			try {
				result = await coreLoad(...args);
			} catch (error) {
				hasLoadError = true;
				loadError = error;
			} finally {
				// All commits started by this core load are now registered. Stop
				// accepting commits from later navigations before awaiting this scope.
				activeLoadScopes.delete(viewCommits);
			}

			let hasCommitError = false;
			let commitError: unknown;
			const [, outcomes] = await Promise.all([
				Promise.allSettled(prerequisiteCommits),
				Promise.allSettled(viewCommits),
			]);
			const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
			if (rejected?.status === 'rejected') {
				hasCommitError = true;
				commitError = rejected.reason;
			}
			if (hasLoadError) throw loadError;
			if (hasCommitError) throw commitError;

			// RouterCore derives the final HTTP status immediately after its internal
			// load promise resolves. A platform-deferred View Transition can commit the
			// new tree only after that point, so finalize every branch once the
			// render-ready tree is present. RouterCore has already committed a
			// redirect and its HTTP status together, so preserve that authoritative
			// status; otherwise a successful tree must also clear a stale 404/500.
			const state = this.state;
			const statusCode =
				state.redirect != null
					? state.statusCode
					: this.hasNotFoundMatch()
						? 404
						: state.matches.some((match: any) => match.status === 'error')
							? 500
							: 200;
			this.stores.statusCode.set(statusCode);
			return result;
		};
	}
}

export const createRouter: CreateRouterFn = (options) => new Router(options);

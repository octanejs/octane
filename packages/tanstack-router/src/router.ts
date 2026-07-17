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

export class Router extends (RouterCore as any) {
	constructor(options: any) {
		super(options, octaneStoreFactory);

		// router-core starts the resolved-match commit through startViewTransition,
		// whose browser callback may run after router-core's load promise resolves.
		// Track those callbacks so `await router.load()` is a real render-readiness
		// boundary: the active match tree is committed before a consumer's first
		// render or hydration pass.
		const coreLoad = this.load.bind(this);
		const coreStartViewTransition = this.startViewTransition.bind(this);
		const pendingViewCommits = new Set<Promise<void>>();

		this.startViewTransition = (fn: () => Promise<void>) => {
			let resolveCommit!: () => void;
			let rejectCommit!: (error: unknown) => void;
			const commit = new Promise<void>((resolve, reject) => {
				resolveCommit = resolve;
				rejectCommit = reject;
			});
			pendingViewCommits.add(commit);
			// Observe rejection immediately, but keep the original promise until
			// load() drains it. Removing a fast-settling promise here would let a
			// commit error disappear before coreLoad reaches its final await.
			void commit.catch(() => {});

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
			const result = await coreLoad(...args);
			let hasCommitError = false;
			let commitError: unknown;
			while (pendingViewCommits.size > 0) {
				const commits = [...pendingViewCommits];
				const outcomes = await Promise.allSettled(commits);
				for (const commit of commits) pendingViewCommits.delete(commit);
				const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
				if (!hasCommitError && rejected?.status === 'rejected') {
					hasCommitError = true;
					commitError = rejected.reason;
				}
			}
			if (hasCommitError) throw commitError;

			// RouterCore derives the final HTTP status immediately after its internal
			// load promise resolves. A platform-deferred View Transition can commit the
			// error/not-found matches only after that point, so repeat the same public
			// finalization once the render-ready match tree is actually present.
			let statusCode: number | undefined;
			if (this.hasNotFoundMatch()) statusCode = 404;
			else if (this.state.matches.some((match: any) => match.status === 'error')) statusCode = 500;
			if (statusCode !== undefined) this.stores.statusCode.set(statusCode);
			return result;
		};
	}
}

export function createRouter(options: any): any {
	return new Router(options);
}

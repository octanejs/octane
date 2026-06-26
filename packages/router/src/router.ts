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
	}
}

export function createRouter(options: any): any {
	return new Router(options);
}

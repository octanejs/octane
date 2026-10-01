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
import type { RouterHistory } from '@tanstack/history';
import type {
	AnyRoute,
	CreateRouterFn,
	RouterConstructorOptions,
	TrailingSlashOption,
} from '@tanstack/router-core';

const isServerEnv = typeof document === 'undefined';

// Store factory for RouterCore — the only framework-specific wiring. Client
// stores are reactive @tanstack/store atoms (framework-agnostic; `createAtom`
// lives in @tanstack/store, not @tanstack/react-store); server snapshots use the
// non-reactive factory. router-core 1.171.34 drives concurrent navigation through
// `router.startTransition` (see Transitioner), so `batch` is a plain atomic batch
// rather than one wrapped in an octane transition.
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
		batch,
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
		// router-core 1.171.34 owns the navigation lifecycle end to end: it drives
		// `startViewTransition` → `startTransition(commit, matches)` and awaits the
		// render acknowledgement (supplied by `useTransitioner`), then emits
		// onLoad/onBeforeRouteMount/onResolved/onRendered and commits
		// `status`/`resolvedLocation` itself. So `await router.load()` is already a
		// render-readiness boundary and the previous view-transition/load wrapper is
		// no longer needed. HTTP status is derived on demand by the SSR layer
		// (`getSsrStatus`), not stored on the router.
		super(options, octaneStoreFactory);
	}
}

export const createRouter: CreateRouterFn = (options) => new Router(options);

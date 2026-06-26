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

const isServerEnv = typeof document === 'undefined';

const octaneStoreFactory = (opts: { isServer?: boolean }) => {
	if (opts?.isServer ?? isServerEnv) {
		return {
			createMutableStore: createNonReactiveMutableStore,
			createReadonlyStore: createNonReactiveReadonlyStore,
			batch: (fn: () => void) => fn(),
		};
	}
	return { createMutableStore: createAtom, createReadonlyStore: createAtom, batch };
};

export class Router extends (RouterCore as any) {
	constructor(options: any) {
		super(options, octaneStoreFactory);
	}
}

export function createRouter(options: any): any {
	return new Router(options);
}

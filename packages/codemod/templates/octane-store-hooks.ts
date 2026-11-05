'use no memo';

import { storeHooks } from './octane-store-context.tsrx';

let ordinal: number | undefined;

function nextSlot() {
	if (ordinal === undefined) throw new Error('A store hook must run inside its bound entry.');
	return ordinal++;
}

/** The compiled caller supplies the outer slot. React orders the base hooks within it. */
export function bindStoreHook<F extends (...args: any[]) => any>(hook: F): F {
	return function (this: unknown, ...args: Parameters<F>) {
		const previous = ordinal;
		ordinal = 0;
		try {
			return hook.apply(this, args);
		} finally {
			ordinal = previous;
		}
	} as F;
}

type Deps = readonly unknown[];

export function useMemo<T>(create: () => T, deps?: Deps): T {
	return storeHooks.useMemo(() => create(), deps ?? null, nextSlot());
}

export function useCallback<F extends (...args: any[]) => any>(fn: F, deps?: Deps): F {
	return storeHooks.useCallback(fn, deps ?? null, nextSlot());
}

export function useRef<T>(value: T): { current: T };
export function useRef<T>(value: T | null): { current: T | null };
export function useRef<T>(value: T | undefined): { current: T | undefined };
export function useRef<T>(value: T) {
	return storeHooks.useRef(value, nextSlot());
}

export function useLayoutEffect(setup: () => void | (() => void), deps?: Deps): void {
	storeHooks.useLayoutEffect(() => setup(), deps ?? null, nextSlot());
}

function missingServerSnapshot(): never {
	throw new Error('Missing getServerSnapshot, which is required for server-rendered content.');
}

export function useSyncExternalStore<T>(
	subscribe: (notify: () => void) => () => void,
	getSnapshot: () => T,
	getServerSnapshot?: () => T,
): T {
	return storeHooks.useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot ?? missingServerSnapshot,
		nextSlot(),
	);
}

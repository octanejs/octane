'use strong';

import {
	createContext,
	useContext,
	useMemo,
	useCallback,
	useRef,
	useLayoutEffect,
	useSyncExternalStore,
	type Context,
	type OctaneNode,
} from 'octane';
import type { ChildrenBlock } from 'octane/tsrx-boundary';
import type { Context as ReactContext } from 'react';

// The consuming compiler selects the client or server hooks for this module.
export const storeHooks = { useMemo, useCallback, useRef, useLayoutEffect, useSyncExternalStore };

const absent = Symbol('no native store provider');
const stores = new WeakMap<object, Context<unknown>>();

function nativeFor(context: object): Context<unknown> {
	let native = stores.get(context);
	if (!native) {
		native = createContext<unknown>(absent);
		stores.set(context, native);
	}
	return native;
}

export function useStoreContext<T>(context: ReactContext<T>): T {
	const value = useContext(nativeFor(context));
	// The matching provider stores a T for this exact React context.
	return value === absent ? useContext(context) : (value as T);
}

export function NativeStoreProvider<T>({
	context,
	value,
	children,
}: {
	context: ReactContext<T>;
	value: NoInfer<T>;
	children?: OctaneNode | ChildrenBlock;
}) @{
	const Provider = nativeFor(context);
	<Provider value={value}>{children}</Provider>
}

'use client';

/**
 * React bindings for scoped signals. A React component reads a handle the way
 * an Octane binding does: it re-renders when the presented value changes, and
 * once the handle's scope retires its next read throws `ScopeDisposedError` to
 * the nearest error boundary instead of showing the retired value.
 */
import { createContext, createElement, use, useCallback, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { formatClientError } from '../error-codes.client.generated.js';
import { SIGNAL_BINDING_READ, SIGNAL_BINDING_SUBSCRIBE } from './types.js';
import type { Scope, SignalHandle } from './types.js';

const ScopeContext = createContext<Scope | null>(null);

/**
 * Make `scope` the one `useSignalScope` returns below. The provider borrows the
 * scope and never disposes it: whoever created it, one per root or server
 * request, disposes it after unmounting the tree that reads it.
 */
export function SignalScopeProvider(props: { scope: Scope; children?: ReactNode }) {
	return createElement(ScopeContext, { value: props.scope }, props.children);
}

export function useSignalScope(): Scope {
	const scope = use(ScopeContext);
	if (!scope) throw new Error(formatClientError(365));
	return scope;
}

/**
 * The handle's value, kept current while the component is mounted. Writes go
 * through the handle itself, `handle.set(next)`. By default the server snapshot
 * is the same read. If live state can advance before hydration, supply a stable
 * historical `getServerSnapshot` for the server and initial hydration reads.
 * A read that throws, such as a pending or failed async handle, throws from the
 * component.
 */
export function useSignalValue<T>(handle$: SignalHandle<T>, getServerSnapshot?: () => T): T {
	const subscribe = useCallback(
		(notify: () => void) => handle$[SIGNAL_BINDING_SUBSCRIBE](notify),
		[handle$],
	);
	const read = useCallback(() => handle$[SIGNAL_BINDING_READ](), [handle$]);
	return useSyncExternalStore(subscribe, read, getServerSnapshot ?? read);
}

'use client';

/**
 * React bindings for scoped signals. A React component reads a handle the way
 * an Octane binding does: it re-renders when the presented value changes, and
 * once the handle's scope retires its next read throws `ScopeDisposedError` to
 * the nearest error boundary instead of showing the retired value.
 */
import {
	createContext,
	createElement,
	use,
	useCallback,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useSyncExternalStore,
} from 'react';
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

/**
 * Reads a handle with the same snapshot contract as useSignalValue. Once
 * subscribed, the reader keeps its observation while React Activity hides it.
 * Pass false when the surrounding view should disconnect on hide.
 */
export function useRetainedSignalValue<T>(
	handle$: SignalHandle<T>,
	getServerSnapshot?: () => T,
	retainOnHide = true,
): T {
	const binding = useMemo(() => activityBinding(handle$), [handle$]);
	useInsertionEffect(() => {
		if (retainOnHide) return binding.retain();
	}, [binding, retainOnHide]);
	useLayoutEffect(binding.prepare, [binding]);
	return useSyncExternalStore(binding.subscribe, binding.read, getServerSnapshot ?? binding.read);
}

function activityBinding<T>(handle$: SignalHandle<T>) {
	let release: (() => void) | undefined;
	let notify: (() => void) | undefined;
	let retained = false;
	let needsSnapshotCheck = false;
	const invalidate = () => {
		if (notify) notify();
		else needsSnapshotCheck = true;
	};
	const releaseIfIdle = () => {
		if (release && !notify && !retained) {
			const stop = release;
			release = undefined;
			needsSnapshotCheck = true;
			stop();
		}
	};
	return {
		read: () => handle$[SIGNAL_BINDING_READ](),
		// Insertion effects survive an Activity hide.
		retain() {
			retained = true;
			return () => {
				retained = false;
				// A watched cleanup can update React. Finish the insertion phase first.
				if (release && !notify) queueMicrotask(releaseIfIdle);
			};
		},
		prepare() {
			// On reveal, connect before React disconnects outgoing passive readers.
			// Initial observation still starts in the passive subscription.
			if (needsSnapshotCheck && !release) {
				release = handle$[SIGNAL_BINDING_SUBSCRIBE](invalidate);
				return releaseIfIdle;
			}
		},
		subscribe(listener: () => void) {
			notify = listener;
			release ??= handle$[SIGNAL_BINDING_SUBSCRIBE](invalidate);
			if (needsSnapshotCheck) {
				needsSnapshotCheck = false;
				listener();
			}
			return () => {
				notify = undefined;
				releaseIfIdle();
			};
		},
	};
}

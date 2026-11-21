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
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import { formatClientError } from '../error-codes.client.generated.js';
import { isSignalHandle } from './handle-protocol.js';
import { SIGNAL_BINDING_READ, SIGNAL_BINDING_SUBSCRIBE } from './types.js';
import type { Scope, SignalHandle } from './types.js';

const ScopeContext = createContext<Scope | null>(null);

type Handoff = {
	parent: Handoff | undefined;
	phase: 'idle' | 'incoming' | 'mounted';
	incoming: number;
	releases: (() => void)[] | undefined;
};

// React removes passive subscriptions before mounting their replacements. When
// sibling providers trade places, overlap their physical observations until the
// incoming providers finish their passive mounts. Never hold up a final unmount.
function finishHandoff(handoff: Handoff, phase: 'idle' | 'mounted') {
	const incoming = handoff.phase === 'incoming';
	handoff.phase = phase;
	const parent = handoff.parent;
	if (!incoming || !parent || --parent.incoming || !parent.releases) return;
	const releases = parent.releases;
	parent.releases = undefined;
	let errors: unknown[] | undefined;
	for (const release of releases) {
		try {
			release();
		} catch (error) {
			(errors ??= []).push(error);
		}
	}
	if (errors) throw errors.length === 1 ? errors[0] : new AggregateError(errors);
}

function releaseAfterHandoff(handoff: Handoff | undefined, release: () => void) {
	// Deleted providers run passive cleanup before their descendants. Walk only
	// through departing providers, up to the first surviving common parent.
	while (handoff?.phase === 'idle') {
		handoff = handoff.parent;
		if (handoff?.incoming) {
			(handoff.releases ??= []).push(release);
			return;
		}
	}
	release();
}

type RetainedSignalDefaults = {
	handoff: Handoff | undefined;
	getServerSnapshot: (<T>(handle: SignalHandle<T>) => T) | undefined;
	retainOnHide: boolean;
};
const RetainedSignalContext = createContext<RetainedSignalDefaults>({
	handoff: undefined,
	getServerSnapshot: undefined,
	retainOnHide: true,
});

/** Defaults for retained signal readers below this provider. Omitted fields inherit. */
export function RetainedSignalProvider(props: {
	getServerSnapshot?: (<T>(handle: SignalHandle<T>) => T) | undefined;
	retainOnHide?: boolean | undefined;
	children?: ReactNode;
}) {
	const outer = use(RetainedSignalContext);
	const handoff = useMemo<Handoff>(
		() => ({
			parent: outer.handoff,
			phase: 'idle',
			incoming: 0,
			releases: undefined,
		}),
		[outer.handoff],
	);

	useLayoutEffect(() => {
		// Suspense can reconnect layout alone. Only arm a handoff for a passive mount.
		if (!handoff.parent || handoff.phase === 'mounted') return;
		handoff.phase = 'incoming';
		handoff.parent.incoming++;
		return () => {
			if (handoff.phase === 'incoming') finishHandoff(handoff, 'idle');
		};
	}, [handoff]);
	useEffect(() => {
		// Descendant store subscriptions have attached by this point.
		finishHandoff(handoff, 'mounted');
		return () => {
			handoff.phase = 'idle';
		};
	}, [handoff]);
	const value = useMemo(
		() => ({
			handoff,
			getServerSnapshot: props.getServerSnapshot ?? outer.getServerSnapshot,
			retainOnHide: props.retainOnHide ?? outer.retainOnHide,
		}),
		[outer, handoff, props.getServerSnapshot, props.retainOnHide],
	);
	return createElement(RetainedSignalContext, { value }, props.children);
}

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
	retainOnHide?: boolean,
): T {
	const defaults = use(RetainedSignalContext);
	const subscribe = useActivitySubscription(handle$, defaults, retainOnHide);
	const read = useCallback(() => handle$[SIGNAL_BINDING_READ](), [handle$]);
	const resolve = defaults.getServerSnapshot;
	return useSyncExternalStore(
		subscribe,
		read,
		getServerSnapshot ?? (resolve ? () => resolve(handle$) : read),
	);
}

export type SignalFallback = string | number | boolean | bigint | symbol | null | undefined;
type OptionalSignalValue<Source> = Source extends SignalHandle<infer T> ? T : Source;

/** Read a retained handle, or return an inactive primitive without subscribing. */
export function useOptionalRetainedSignalValue<
	Source extends SignalHandle<unknown> | SignalFallback,
>(source: Source): OptionalSignalValue<Source> {
	const defaults = use(RetainedSignalContext);
	const handle = isSignalHandle(source) ? source : null;
	const subscribe = useActivitySubscription(handle, defaults);
	const read = useCallback(
		() => (handle ? handle[SIGNAL_BINDING_READ]() : source) as OptionalSignalValue<Source>,
		[handle, source],
	);
	const resolve = defaults.getServerSnapshot;
	return useSyncExternalStore(
		subscribe,
		read,
		handle && resolve ? () => resolve(handle) as OptionalSignalValue<Source> : read,
	);
}

type Subscribe = (notify: () => void) => () => void;
const noop = () => {};
const subscribeToNothing: Subscribe = () => noop;

/**
 * The Activity-aware subscription for a useSyncExternalStore reader that
 * supplies its own snapshot. Pass a native handle, a stable subscribe
 * function, or null for a reader with no current source. The returned
 * subscription belongs to one useSyncExternalStore call in this component.
 */
export function useSignalSubscription<T>(
	source: SignalHandle<T> | Subscribe | null,
	retainOnHide?: boolean,
): Subscribe {
	const defaults = use(RetainedSignalContext);
	return useActivitySubscription(source, defaults, retainOnHide);
}

function useActivitySubscription<T>(
	source: SignalHandle<T> | Subscribe | null,
	defaults: RetainedSignalDefaults,
	retainOnHide = defaults.retainOnHide,
): Subscribe {
	const binding = useMemo(() => {
		if (source === null) return null;
		return activityBinding(
			typeof source === 'function' ? source : (notify) => source[SIGNAL_BINDING_SUBSCRIBE](notify),
		);
	}, [source]);
	useInsertionEffect(() => {
		return binding?.retain(retainOnHide, defaults.handoff);
	}, [binding, retainOnHide, defaults.handoff]);
	useLayoutEffect(binding?.prepare ?? noop, [binding]);
	return binding?.subscribe ?? subscribeToNothing;
}

function activityBinding(subscribe: Subscribe) {
	let handoff: Handoff | undefined;
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
		// Insertion effects survive an Activity hide.
		retain(enabled: boolean, provider: Handoff | undefined) {
			handoff = enabled ? provider : undefined;
			if (!enabled) return;
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
				release = subscribe(invalidate);
				return releaseIfIdle;
			}
		},
		subscribe(listener: () => void) {
			notify = listener;
			release ??= subscribe(invalidate);
			if (needsSnapshotCheck) {
				needsSnapshotCheck = false;
				listener();
			}
			return () => {
				notify = undefined;
				if (!retained) releaseAfterHandoff(handoff, releaseIfIdle);
			};
		},
	};
}

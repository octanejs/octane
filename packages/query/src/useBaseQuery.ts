// `useBaseQuery` — the shared core of `useQuery` (and friends), reimplemented on
// octane's hooks. Mirrors @tanstack/react-query's useBaseQuery: it creates a
// query Observer, subscribes to it via useSyncExternalStore, and pushes option
// changes through useEffect. The single compiler-injected slot is split into
// distinct sub-slots for each internal base hook (observer state, subscribe
// callback, the store hook, the options effect), the same way the zustand
// `traditional` binding does.
//
// octane has no QueryErrorResetBoundary / IsRestoring providers, so the
// reset-boundary and restore machinery collapses to its no-boundary defaults
// (`isReset()` is always false, `isRestoring` is always false) — but the parts
// that affect a plain query (the suspense timer clamp, the prevent-retry-on-mount
// for throwOnError/suspense, and the `subscribed` option) ARE ported.
import { useState, useCallback, useSyncExternalStore, useEffect, use } from 'octane-ts';
import { noop, notifyManager, shouldThrowError } from '@tanstack/query-core';
import { resolveClient } from './context';

function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':oq:' + tag) : undefined;
}

// react-query's ensureSuspenseTimers: a suspense query gets a >=1s staleTime/gcTime
// floor so it can't immediately refetch and re-trigger the @pending fallback in a
// loop.
function ensureSuspenseTimers(defaultedOptions: any): void {
	if (defaultedOptions.suspense) {
		const MIN = 1000;
		const clamp = (value: any) => (value === 'static' ? value : Math.max(value ?? MIN, MIN));
		const orig = defaultedOptions.staleTime;
		defaultedOptions.staleTime =
			typeof orig === 'function' ? (...args: any[]) => clamp(orig(...args)) : clamp(orig);
		if (typeof defaultedOptions.gcTime === 'number') {
			defaultedOptions.gcTime = Math.max(defaultedOptions.gcTime, MIN);
		}
	}
}

export function useBaseQuery(
	options: any,
	Observer: any,
	queryClient: any,
	slot: symbol | undefined,
): any {
	const client = resolveClient(queryClient);
	const defaultedOptions = client.defaultQueryOptions(options);

	// `subscribed: false` makes a passive query — read the cache but don't subscribe
	// or compute optimistic results (so it never drives re-renders).
	const subscribed = options.subscribed !== false;
	defaultedOptions._optimisticResults = subscribed ? 'optimistic' : undefined;

	ensureSuspenseTimers(defaultedOptions);

	const query = client.getQueryCache().get(defaultedOptions.queryHash);
	// prevent-error-boundary-retry: when the query opts into throwing, don't
	// retry-on-mount, so an already-errored cached query re-throws immediately
	// (octane ships no reset boundary, so isReset() is treated as false).
	const computedThrowOnError =
		query?.state.error && typeof defaultedOptions.throwOnError === 'function'
			? shouldThrowError(defaultedOptions.throwOnError, [query.state.error, query])
			: defaultedOptions.throwOnError;
	if (defaultedOptions.suspense || computedThrowOnError) {
		defaultedOptions.retryOnMount = false;
	}

	const [observer] = useState(() => new Observer(client, defaultedOptions), subSlot(slot, 'obs'));

	const result = observer.getOptimisticResult(defaultedOptions);

	useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => {
				const unsubscribe = subscribed
					? observer.subscribe(notifyManager.batchCalls(onStoreChange))
					: noop;
				// Update result in case the store changed between the optimistic read and
				// the subscription (react-query does the same).
				observer.updateResult();
				return unsubscribe;
			},
			[observer, subscribed],
			subSlot(slot, 'cb'),
		),
		() => observer.getCurrentResult(),
		() => observer.getCurrentResult(),
		subSlot(slot, 'uses'),
	);

	useEffect(
		() => {
			observer.setOptions(defaultedOptions);
		},
		[defaultedOptions, observer],
		subSlot(slot, 'eff'),
	);

	// Suspense: suspend on the in-flight promise so the nearest @try/@pending shows
	// the fallback. octane suspends via `use(thenable)` (which throws the internal
	// SuspenseException the tryBlock recognises) — NOT a raw `throw promise`, which
	// it wouldn't catch. The `.catch(noop)` makes the suspended promise RESOLVE even
	// on error (mirroring react-query), so the replay surfaces an error through the
	// error-boundary throw below rather than rejecting the suspended thenable. On
	// replay the query is no longer pending, so this branch is skipped.
	if (defaultedOptions.suspense && result.isPending) {
		use(observer.fetchOptimistic(defaultedOptions).catch(noop));
	}

	// Error boundary: throw so the nearest @try/@catch handles it, when the query
	// errored and the options opt into throwing (throwOnError / suspense).
	if (
		result.isError &&
		!result.isFetching &&
		query &&
		((defaultedOptions.suspense && result.data === undefined) ||
			shouldThrowError(defaultedOptions.throwOnError, [result.error, query]))
	) {
		throw result.error;
	}

	return !defaultedOptions.notifyOnChangeProps ? observer.trackResult(result) : result;
}

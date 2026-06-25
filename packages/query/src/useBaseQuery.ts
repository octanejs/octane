// `useBaseQuery` — the shared core of `useQuery` (and friends), reimplemented on
// octane's hooks. Mirrors @tanstack/react-query's useBaseQuery: it creates a
// query Observer, subscribes to it via useSyncExternalStore, and pushes option
// changes through useEffect. The single compiler-injected slot is split into
// distinct sub-slots for each internal base hook, the same way the zustand
// `traditional` binding does.
import { useState, useCallback, useSyncExternalStore, useEffect, use } from 'octane';
import { noop, notifyManager } from '@tanstack/query-core';
import { resolveClient } from './context';
import { useIsRestoring } from './isRestoring';
import { useQueryErrorResetBoundary } from './errorResetBoundary';
import {
	ensurePreventErrorBoundaryRetry,
	ensureSuspenseTimers,
	getHasError,
	subSlot,
} from './internal';

export function useBaseQuery(
	options: any,
	Observer: any,
	queryClient: any,
	slot: symbol | undefined,
): any {
	const oq = (tag: string) => subSlot(slot, 'oq:' + tag);
	const client = resolveClient(queryClient);
	const isRestoring = useIsRestoring();
	const errorResetBoundary = useQueryErrorResetBoundary();
	const defaultedOptions = client.defaultQueryOptions(options);

	// `subscribed: false` makes a passive query (read the cache, never subscribe).
	// While restoring a persisted client, queries also stay passive.
	const subscribed = options.subscribed !== false;
	defaultedOptions._optimisticResults = isRestoring
		? 'isRestoring'
		: subscribed
			? 'optimistic'
			: undefined;

	ensureSuspenseTimers(defaultedOptions);

	const query = client.getQueryCache().get(defaultedOptions.queryHash);
	ensurePreventErrorBoundaryRetry(defaultedOptions, errorResetBoundary, query);
	// Clear the reset boundary on mount (so a fresh mount can throw again).
	useEffect(
		() => {
			errorResetBoundary.clearReset();
		},
		[errorResetBoundary],
		oq('clr'),
	);

	const [observer] = useState(() => new Observer(client, defaultedOptions), oq('obs'));

	const result = observer.getOptimisticResult(defaultedOptions);

	const shouldSubscribe = !isRestoring && subscribed;
	useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) => {
				const unsubscribe = shouldSubscribe
					? observer.subscribe(notifyManager.batchCalls(onStoreChange))
					: noop;
				observer.updateResult();
				return unsubscribe;
			},
			[observer, shouldSubscribe],
			oq('cb'),
		),
		() => observer.getCurrentResult(),
		() => observer.getCurrentResult(),
		oq('uses'),
	);

	useEffect(
		() => {
			observer.setOptions(defaultedOptions);
		},
		[defaultedOptions, observer],
		oq('eff'),
	);

	// Suspense: suspend on the in-flight promise via `use(thenable)` (octane's
	// suspend primitive — NOT a raw `throw promise`). `.catch(noop)` makes it
	// resolve even on error, so the replay surfaces the error through the
	// error-boundary throw below. On replay the query isn't pending, so this is
	// skipped.
	if (defaultedOptions.suspense && result.isPending) {
		use(observer.fetchOptimistic(defaultedOptions).catch(noop));
	}

	// Error boundary: throw so the nearest @try/@catch (or <ErrorBoundary>) handles
	// it, when the query errored and the options opt into throwing.
	if (
		getHasError({
			result,
			errorResetBoundary,
			throwOnError: defaultedOptions.throwOnError,
			query,
			suspense: defaultedOptions.suspense,
		})
	) {
		throw result.error;
	}

	return !defaultedOptions.notifyOnChangeProps ? observer.trackResult(result) : result;
}

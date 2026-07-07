import { QueriesObserver, QueryObserver, noop, notifyManager } from '@tanstack/query-core';
import type { QueryClient } from '@tanstack/query-core';
import { useState, useMemo, useSyncExternalStore, useCallback, useEffect, use } from 'octane';
import { resolveClient } from './context';
import { useIsRestoring } from './isRestoring';
import { useQueryErrorResetBoundary } from './errorResetBoundary';
import {
	ensurePreventErrorBoundaryRetry,
	ensureSuspenseTimers,
	fetchOptimistic,
	getHasError,
	shouldSuspend,
	splitSlot,
	subSlot,
} from './internal';
import type { QueriesOptions, QueriesResults } from './queries-types';

// Signature matches @tanstack/react-query's useQueries.ts — per-entry tuple
// inference via QueriesOptions/QueriesResults, with `combine` re-typing the
// aggregate result. The untyped implementation signature also accepts the
// compiler-injected trailing slot symbol.
export function useQueries<T extends Array<any>, TCombinedResult = QueriesResults<T>>(
	options: {
		queries: readonly [...QueriesOptions<T>];
		combine?: (result: QueriesResults<T>) => TCombinedResult;
		subscribed?: boolean;
	},
	queryClient?: QueryClient,
): TCombinedResult;

export function useQueries(options: any, ...rest: any[]): any {
	const [user, slot] = splitSlot(rest);
	const client = resolveClient(user[0]);
	const isRestoring = useIsRestoring();
	const errorResetBoundary = useQueryErrorResetBoundary();
	const { queries, ...restOptions } = options;
	const qs = (tag: string) => subSlot(slot, 'qs:' + tag);

	const defaultedQueries = useMemo(
		() =>
			queries.map((opts: any) => {
				const defaulted = client.defaultQueryOptions(opts);
				defaulted._optimisticResults = isRestoring ? 'isRestoring' : 'optimistic';
				return defaulted;
			}),
		[queries, client, isRestoring],
		qs('memo'),
	);
	defaultedQueries.forEach((queryOptions: any) => {
		ensureSuspenseTimers(queryOptions);
		ensurePreventErrorBoundaryRetry(
			queryOptions,
			errorResetBoundary,
			client.getQueryCache().get(queryOptions.queryHash),
		);
	});
	useEffect(
		() => {
			errorResetBoundary.clearReset();
		},
		[errorResetBoundary],
		qs('clr'),
	);

	const [observer] = useState(
		() => new QueriesObserver(client, defaultedQueries, restOptions),
		qs('obs'),
	);

	const [optimisticResult, getCombinedResult, trackResult] = observer.getOptimisticResult(
		defaultedQueries,
		restOptions.combine,
	);

	const shouldSubscribe = !isRestoring && restOptions.subscribed !== false;
	useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) =>
				shouldSubscribe ? observer.subscribe(notifyManager.batchCalls(onStoreChange)) : noop,
			[observer, shouldSubscribe],
			qs('cb'),
		),
		() => observer.getCurrentResult(),
		() => observer.getCurrentResult(),
		qs('uses'),
	);

	useEffect(
		() => {
			observer.setQueries(defaultedQueries, restOptions);
		},
		[defaultedQueries, restOptions, observer],
		qs('eff'),
	);

	// Suspense: if any query should suspend, suspend on Promise.all of their
	// optimistic fetches. octane suspends via use(thenable), not `throw promise`.
	const shouldAtLeastOneSuspend = optimisticResult.some((result: any, index: number) =>
		shouldSuspend(defaultedQueries[index], result),
	);
	if (shouldAtLeastOneSuspend) {
		const suspensePromises = optimisticResult.flatMap((result: any, index: number) => {
			const opts = defaultedQueries[index];
			if (opts && shouldSuspend(opts, result)) {
				// fetchOptimistic clears the reset boundary on error (upstream
				// suspense.ts) so a reset→retry→fail-again re-throws to the boundary.
				return fetchOptimistic(opts, new QueryObserver(client, opts), errorResetBoundary);
			}
			return [];
		});
		if (suspensePromises.length > 0) {
			use(Promise.all(suspensePromises));
		}
	}

	const firstError = optimisticResult.find((result: any, index: number) => {
		const query = defaultedQueries[index];
		return (
			query &&
			getHasError({
				result,
				errorResetBoundary,
				throwOnError: query.throwOnError,
				query: client.getQueryCache().get(query.queryHash),
				suspense: query.suspense,
			})
		);
	});
	if (firstError?.error) {
		throw firstError.error;
	}

	return getCombinedResult(trackResult());
}

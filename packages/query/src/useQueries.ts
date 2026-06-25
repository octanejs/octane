import { QueriesObserver, QueryObserver, noop, notifyManager } from '@tanstack/query-core';
import { useState, useMemo, useSyncExternalStore, useCallback, useEffect, use } from 'octane-ts';
import { resolveClient } from './context';
import {
	ensurePreventErrorBoundaryRetry,
	ensureSuspenseTimers,
	getHasError,
	shouldSuspend,
	splitSlot,
	subSlot,
} from './internal';

export function useQueries(options: any, ...rest: any[]): any {
	const [user, slot] = splitSlot(rest);
	const client = resolveClient(user[0]);
	const { queries, ...restOptions } = options;
	const qs = (tag: string) => subSlot(slot, 'qs:' + tag);

	const defaultedQueries = useMemo(
		() =>
			queries.map((opts: any) => {
				const defaulted = client.defaultQueryOptions(opts);
				defaulted._optimisticResults = 'optimistic';
				return defaulted;
			}),
		[queries, client],
		qs('memo'),
	);
	defaultedQueries.forEach((queryOptions: any) => {
		ensureSuspenseTimers(queryOptions);
		ensurePreventErrorBoundaryRetry(
			queryOptions,
			client.getQueryCache().get(queryOptions.queryHash),
		);
	});

	const [observer] = useState(
		() => new QueriesObserver(client, defaultedQueries, restOptions),
		qs('obs'),
	);

	const [optimisticResult, getCombinedResult, trackResult] = observer.getOptimisticResult(
		defaultedQueries,
		restOptions.combine,
	);

	const subscribed = restOptions.subscribed !== false;
	useSyncExternalStore(
		useCallback(
			(onStoreChange: () => void) =>
				subscribed ? observer.subscribe(notifyManager.batchCalls(onStoreChange)) : noop,
			[observer, subscribed],
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
				return new QueryObserver(client, opts).fetchOptimistic(opts).catch(noop);
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
			getHasError(
				result,
				query.throwOnError,
				client.getQueryCache().get(query.queryHash),
				query.suspense,
			)
		);
	});
	if (firstError?.error) {
		throw firstError.error;
	}

	return getCombinedResult(trackResult());
}

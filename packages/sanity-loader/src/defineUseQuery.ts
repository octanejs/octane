import type { QueryParams } from '@sanity/client';
import type { QueryStore, QueryStoreState } from '@sanity/core-loader';
import type { EncodeDataAttributeFunction } from '@sanity/core-loader/encode-data-attribute';
import isEqual from 'fast-deep-equal';
import { useEffect, useLinkedState, useMemo, useSyncExternalStore } from 'octane';

import { defineStudioUrlStore } from './defineStudioUrlStore';
import type { UseQueryOptions } from './types';
import { useEncodeDataAttribute } from './useEncodeDataAttribute';

export function defineUseQuery({
	createFetcherStore,
	studioUrlStore,
}: Pick<QueryStore, 'createFetcherStore'> & {
	studioUrlStore: ReturnType<typeof defineStudioUrlStore>;
}): <QueryResponseResult, QueryResponseError>(
	query: string,
	params?: QueryParams,
	options?: UseQueryOptions<QueryResponseResult>,
) => QueryStoreState<QueryResponseResult, QueryResponseError> & {
	encodeDataAttribute: EncodeDataAttributeFunction;
} {
	const DEFAULT_PARAMS = {};
	type UseQueryArguments<QueryResponseResult> = [
		params?: QueryParams,
		options?: UseQueryOptions<QueryResponseResult>,
	];

	return <QueryResponseResult, QueryResponseError>(
		query: string,
		...args: [...UseQueryArguments<QueryResponseResult>, slot?: symbol]
	) => {
		const userArgs = typeof args[args.length - 1] === 'symbol' ? args.slice(0, -1) : args;
		const [params = DEFAULT_PARAMS, options = {}] =
			userArgs as UseQueryArguments<QueryResponseResult>;
		const initial = useMemo(
			() =>
				options.initial
					? { perspective: 'published' as const, variant: undefined, ...options.initial }
					: undefined,
			[options.initial],
		);
		const serializedParams = useMemo(() => JSON.stringify(params), [params]);

		const fetcher = useMemo(
			() =>
				createFetcherStore<QueryResponseResult, QueryResponseError>(
					query,
					JSON.parse(serializedParams),
					initial,
				),
			[serializedParams, initial, query],
		);
		const [snapshot, setSnapshot] = useLinkedState<
			typeof fetcher,
			QueryStoreState<QueryResponseResult, QueryResponseError>
		>(fetcher, (currentFetcher) => currentFetcher.value!);

		useEffect(() => {
			return fetcher.subscribe((nextSnapshot) => {
				setSnapshot((previous) => {
					if (!isEqual(previous.sourceMap, nextSnapshot.sourceMap)) return nextSnapshot;
					if (!isEqual(previous.data, nextSnapshot.data)) return nextSnapshot;
					if (previous.error !== nextSnapshot.error) return nextSnapshot;
					if (previous.loading !== nextSnapshot.loading) return nextSnapshot;
					if (previous.perspective !== nextSnapshot.perspective) return nextSnapshot;
					if (previous.variant !== nextSnapshot.variant) return nextSnapshot;
					return previous;
				});
			});
		}, [fetcher]);

		const studioUrl = useSyncExternalStore(
			studioUrlStore.subscribe,
			studioUrlStore.getSnapshot,
			studioUrlStore.getServerSnapshot,
		);
		const encodeDataAttribute = useEncodeDataAttribute(
			snapshot.data,
			snapshot.sourceMap,
			studioUrl,
		);

		return useMemo(() => ({ ...snapshot, encodeDataAttribute }), [snapshot, encodeDataAttribute]);
	};
}

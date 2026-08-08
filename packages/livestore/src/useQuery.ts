import type * as otel from '@opentelemetry/api';
import {
	captureStackInfo,
	computeRcRefKey,
	createQueryResource,
	type NormalizedQueryable,
	normalizeQueryable,
	runInitialQuery,
} from '@livestore/framework-toolkit';
import type { LiveQuery, Queryable, Store } from '@livestore/livestore';
import type { LiveQueries } from '@livestore/livestore/internal';
import { deepEqual, shouldNeverHappen } from '@livestore/utils';
import { useDebugValue, useEffect, useMemo } from 'octane';
import { splitSlot, subSlot } from './internal';
import { useRcResource } from './useRcResource';
import { useStateRefWithReactiveInput } from './utils/useStateRefWithReactiveInput';

type ValueRef<T> = { current: T };
type QueryOptions = {
	store?: Store;
	otelContext?: otel.Context;
	otelSpanName?: string;
};

export function useQuery<TQueryable extends Queryable<any>>(
	queryable: TQueryable,
	options?: { store?: Store },
): Queryable.Result<TQueryable>;
export function useQuery<TQueryable extends Queryable<any>>(
	queryable: TQueryable,
	...rest: [options?: { store?: Store }, slot?: symbol]
): Queryable.Result<TQueryable> {
	const [args, slot] = splitSlot(rest);
	return useQueryRef(queryable, args[0] as QueryOptions | undefined, subSlot(slot, 'query:ref'))
		.valueRef.current;
}

export function useQueryRef<TQueryable extends Queryable<any>>(
	queryable: TQueryable,
	options?: QueryOptions,
): {
	valueRef: ValueRef<Queryable.Result<TQueryable>>;
	queryRcRef: LiveQueries.RcRef<LiveQuery<Queryable.Result<TQueryable>>>;
};
export function useQueryRef<TQueryable extends Queryable<any>>(
	queryable: TQueryable,
	options: QueryOptions | undefined,
	slot: symbol,
): {
	valueRef: ValueRef<Queryable.Result<TQueryable>>;
	queryRcRef: LiveQueries.RcRef<LiveQuery<Queryable.Result<TQueryable>>>;
};
export function useQueryRef<TQueryable extends Queryable<any>>(
	queryable: TQueryable,
	...rest: [options?: QueryOptions, slot?: symbol]
): {
	valueRef: ValueRef<Queryable.Result<TQueryable>>;
	queryRcRef: LiveQueries.RcRef<LiveQuery<Queryable.Result<TQueryable>>>;
} {
	const [args, slot] = splitSlot(rest);
	const options = args[0] as QueryOptions | undefined;
	const store = options?.store ?? shouldNeverHappen('No store provided to useQuery');
	type TResult = Queryable.Result<TQueryable>;

	const normalized = useMemo<NormalizedQueryable<TResult>>(
		() => normalizeQueryable(queryable as Queryable<TResult>),
		[queryable],
		subSlot(slot, 'query:normalized'),
	);
	const rcRefKey = useMemo(
		() => computeRcRefKey(store, normalized),
		[normalized, store],
		subSlot(slot, 'query:key'),
	);
	const stackInfo = useMemo(() => captureStackInfo(), [], subSlot(slot, 'query:stack'));

	const { queryRcRef, span, otelContext } = useRcResource(
		store,
		rcRefKey,
		() =>
			createQueryResource(store, normalized, stackInfo, {
				otelSpanName: options?.otelSpanName,
				otelContext: options?.otelContext,
			}),
		() => {},
		undefined,
		subSlot(slot, 'query:resource'),
	);
	const query$ = queryRcRef.value;
	useDebugValue(
		`LiveStore:useQuery:${query$.id}:${query$.label}`,
		undefined,
		subSlot(slot, 'query:debug'),
	);

	const initialResult = useMemo(
		() => runInitialQuery(query$, otelContext, stackInfo, 'octane'),
		[otelContext, query$, stackInfo],
		subSlot(slot, 'query:initial'),
	);
	const [valueRef, setValue] = useStateRefWithReactiveInput(
		initialResult,
		subSlot(slot, 'query:state'),
	);

	useEffect(
		() => {
			query$.activeSubscriptions.add(stackInfo);
			span.updateName(options?.otelSpanName ?? `LiveStore:useQuery:${query$.label}`);
			return store.subscribe(
				query$,
				(newValue) => {
					if (deepEqual(newValue, valueRef.current) === false) setValue(newValue);
				},
				{
					onUnsubsubscribe: () => query$.activeSubscriptions.delete(stackInfo),
					label: query$.label,
					otelContext,
				},
			);
		},
		[stackInfo, query$, setValue, store, valueRef, otelContext, span, options?.otelSpanName],
		subSlot(slot, 'query:subscribe'),
	);

	useRcResource(
		store,
		rcRefKey,
		() => ({ queryRcRef, span }),
		(resource) => {
			resource.queryRcRef.deref();
			resource.span.end();
		},
		undefined,
		subSlot(slot, 'query:lifetime'),
	);

	return { valueRef, queryRcRef };
}

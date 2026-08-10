import { useQuery } from '@octanejs/tanstack-query';
import type { UseQueryOptions, UseQueryResult } from '@octanejs/tanstack-query';
import type { ReactiveActionSource } from '@solana/kit';
import { skipToken, type QueryKey } from '@tanstack/query-core';
import { useCallback, useRef } from 'octane';

const subCache = new Map<symbol, Map<string, symbol>>();
function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subCache.get(slot);
	if (byTag === undefined) subCache.set(slot, (byTag = new Map()));
	let symbol = byTag.get(tag);
	if (symbol === undefined) {
		symbol = Symbol.for(`${slot.description ?? ''}:request-query:${tag}`);
		byTag.set(tag, symbol);
	}
	return symbol;
}

export type UseRequestOptions = {
	getAbortSignal?: () => AbortSignal;
};

export type SendSource<T> = {
	send(options?: { abortSignal?: AbortSignal }): Promise<T>;
};

export type RequestSource<T> =
	((signal: AbortSignal) => Promise<T>) | ReactiveActionSource<T> | SendSource<T>;

export type UseRequestQueryOptions<T, TError = unknown, TData = T> = Omit<
	UseQueryOptions<T, TError, TData, QueryKey>,
	'queryFn' | 'queryKey'
> &
	UseRequestOptions;

function isSendSource<T>(source: object): source is SendSource<T> {
	return 'send' in source && typeof (source as SendSource<T>).send === 'function';
}

function isReactiveSource<T>(source: object): source is ReactiveActionSource<T> {
	return (
		'reactiveStore' in source &&
		typeof (source as ReactiveActionSource<T>).reactiveStore === 'function'
	);
}

async function dispatchSource<T>(source: RequestSource<T>, signal: AbortSignal): Promise<T> {
	if (typeof source === 'function') return source(signal);
	// Kit PendingRpcRequest exposes both reactiveStore() and send(); prefer the
	// ReactiveActionSource path so getAbortSignal/withSignal composition matches upstream.
	if (isReactiveSource<T>(source)) {
		return source.reactiveStore().withSignal(signal).dispatchAsync();
	}
	if (isSendSource<T>(source)) return source.send({ abortSignal: signal });
	throw new Error('useRequestQuery: unsupported request source');
}

export function useRequestQuery<T, TError = unknown, TData = T>(
	key: QueryKey,
	source: RequestSource<T> | null,
	options?: UseRequestQueryOptions<T, TError, TData>,
): UseQueryResult<TData, TError>;
export function useRequestQuery(
	key: QueryKey,
	source: RequestSource<unknown> | null,
	optionsOrSlot?: UseRequestQueryOptions<unknown, unknown, unknown> | symbol,
	slot?: symbol,
) {
	const options = typeof optionsOrSlot === 'symbol' ? undefined : optionsOrSlot;
	const resolvedSlot = typeof optionsOrSlot === 'symbol' ? optionsOrSlot : slot;
	const { getAbortSignal, ...queryOptions } = options ?? {};

	const sourceRef = useRef(source, sub(resolvedSlot, 'source'));
	sourceRef.current = source;
	const getAbortSignalRef = useRef(getAbortSignal, sub(resolvedSlot, 'get-abort-signal'));
	getAbortSignalRef.current = getAbortSignal;

	const result = (useQuery as (...args: unknown[]) => UseQueryResult<unknown, unknown>)(
		{
			...queryOptions,
			enabled: source != null && (queryOptions.enabled ?? true),
			queryKey: key,
			queryFn:
				source === null
					? skipToken
					: ({ signal }: { signal: AbortSignal }) => {
							const current = sourceRef.current;
							if (current == null) {
								throw new Error('useRequestQuery: the queryFn ran with a null source');
							}
							const userSignal = getAbortSignalRef.current?.();
							const combinedSignal = userSignal ? AbortSignal.any([signal, userSignal]) : signal;
							return dispatchSource(current, combinedSignal);
						},
		},
		undefined,
		resolvedSlot,
	);
	const resultRef = useRef(result, sub(resolvedSlot, 'result'));
	resultRef.current = result;
	const idleRefetch = useCallback(
		async () => resultRef.current,
		[],
		sub(resolvedSlot, 'idle-refetch'),
	);
	const idleResultRef = useRef<UseQueryResult<unknown, unknown> | undefined>(
		undefined,
		sub(resolvedSlot, 'idle-result'),
	);
	const trackedResultRef = useRef(result, sub(resolvedSlot, 'tracked-result'));
	if (source === null) {
		let idle = idleResultRef.current;
		if (idle === undefined) {
			idleResultRef.current = idle = {
				...result,
				refetch: idleRefetch,
			};
			trackedResultRef.current = result;
		} else if (trackedResultRef.current !== result) {
			Object.assign(idle, result);
			idle.refetch = idleRefetch;
			trackedResultRef.current = result;
		}
		return idle;
	}
	return result;
}

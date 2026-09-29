import type { LiveStoreSchema } from '@livestore/common/schema';
import { SessionIdSymbol } from '@livestore/common';
import type { RegistryStoreOptions, Store, SyncStatus } from '@livestore/livestore';
import type { Schema } from '@livestore/utils/effect';
import { use, useEffect, useMemo } from 'octane';
import { useStoreRegistry } from './StoreRegistryContext.tsrx';
import { splitSlot, subSlot } from './internal';
import { useClientDocument } from './useClientDocument';
import { useQuery } from './useQuery';
import { useSyncStatus } from './useSyncStatus';

export type ReactApi = {
	useQuery: typeof useQuery;
	useClientDocument: typeof useClientDocument;
	useSyncStatus: () => SyncStatus;
};

export function useStore<
	TSchema extends LiveStoreSchema,
	TContext = {},
	TSyncPayloadSchema extends Schema.Schema<any> = typeof Schema.JsonValue,
>(
	options: RegistryStoreOptions<TSchema, TContext, TSyncPayloadSchema>,
): Store<TSchema, TContext> & ReactApi;
export function useStore<
	TSchema extends LiveStoreSchema,
	TContext = {},
	TSyncPayloadSchema extends Schema.Schema<any> = typeof Schema.JsonValue,
>(
	options: RegistryStoreOptions<TSchema, TContext, TSyncPayloadSchema>,
	...rest: [slot?: symbol]
): Store<TSchema, TContext> & ReactApi {
	const [, slot] = splitSlot(rest);
	const storeRegistry = useStoreRegistry();
	// Called on every render, as upstream does: a loaded store returns synchronously.
	const storeOrPromise = storeRegistry.getOrLoadPromise(options);
	const loading = useMemo<{ promise: PromiseLike<unknown> | undefined }>(
		() => ({ promise: undefined }),
		[storeRegistry, options.storeId],
		subSlot(slot, 'store:loading'),
	);
	let store: Store<TSchema, TContext>;
	if (storeOrPromise instanceof Promise) {
		loading.promise = storeOrPromise;
		store = use(storeOrPromise);
	} else {
		// use() is positional. Once this call site has suspended, keep reading the
		// promise it suspended on after the store loads, so the call keeps its
		// position when the boundary replays. Skipping use() here would hand this
		// call's position to the next useStore() in the component, and the replay
		// would return this store to that call instead of suspending on its own.
		if (loading.promise !== undefined) use(loading.promise);
		store = storeOrPromise;
	}
	useEffect(
		() => storeRegistry.retain(options),
		[storeRegistry, options],
		subSlot(slot, 'store:retain'),
	);
	return withReactApi(store);
}

export const withReactApi = <TSchema extends LiveStoreSchema, TContext = {}>(
	store: Store<TSchema, TContext>,
): Store<TSchema, TContext> & ReactApi => {
	const augmented = store as any;
	augmented.useQuery = (queryable: unknown, ...rest: unknown[]) =>
		(useQuery as (...args: unknown[]) => unknown)(queryable, { store }, ...rest);
	augmented.useClientDocument = (table: unknown, ...rest: unknown[]) => {
		const [args, slot] = splitSlot(rest, (value) => value === SessionIdSymbol);
		return (useClientDocument as (...args: unknown[]) => unknown)(
			table,
			args[0],
			args[1],
			{ store },
			slot,
		);
	};
	augmented.useSyncStatus = (...rest: unknown[]) =>
		(useSyncStatus as (...args: unknown[]) => SyncStatus)({ store }, ...rest);
	return augmented;
};

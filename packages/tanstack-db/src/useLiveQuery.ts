import { useRef, useSyncExternalStore } from 'octane';
import {
	BaseQueryBuilder,
	createLiveQueryCollection,
	createLiveQueryObserver,
	isCollection,
} from '@tanstack/db';
import { splitTrailingSlot, subSlot } from './slot';
import type {
	Collection,
	CollectionStatus,
	Context,
	GetResult,
	InferResultType,
	InitialQueryBuilder,
	LiveQueryCollectionConfig,
	LiveQueryObserver,
	NonSingleResult,
	QueryBuilder,
	SingleResult,
} from '@tanstack/db';

const DEFAULT_GC_TIME_MS = 1; // Live queries created by useLiveQuery are cleaned up immediately (0 disables GC)

export type UseLiveQueryStatus = CollectionStatus | `disabled`;

/**
 * Create a live query using a query function
 * @param queryFn - Query function that defines what data to fetch
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with reactive data, state, and status information
 * @example
 * // Basic query with object syntax
 * const { data, isLoading } = useLiveQuery((q) =>
 *   q.from({ todos: todosCollection })
 *    .where(({ todos }) => eq(todos.completed, false))
 *    .select(({ todos }) => ({ id: todos.id, text: todos.text }))
 * )
 *
 *  @example
 * // Single result query
 * const { data } = useLiveQuery(
 *   (q) => q.from({ todos: todosCollection })
 *          .where(({ todos }) => eq(todos.id, 1))
 *          .findOne()
 * )
 *
 * @example
 * // With dependencies that trigger re-execution
 * const { data, state } = useLiveQuery(
 *   (q) => q.from({ todos: todosCollection })
 *          .where(({ todos }) => gt(todos.priority, minPriority)),
 *   [minPriority] // Re-run when minPriority changes
 * )
 *
 * @example
 * // Join pattern
 * const { data } = useLiveQuery((q) =>
 *   q.from({ issues: issueCollection })
 *    .join({ persons: personCollection }, ({ issues, persons }) =>
 *      eq(issues.userId, persons.id)
 *    )
 *    .select(({ issues, persons }) => ({
 *      id: issues.id,
 *      title: issues.title,
 *      userName: persons.name
 *    }))
 * )
 *
 * @example
 * // Handle loading and error states
 * const { data, isLoading, isError, status } = useLiveQuery((q) =>
 *   q.from({ todos: todoCollection })
 * )
 *
 * if (isLoading) return <div>Loading...</div>
 * if (isError) return <div>Error: {status}</div>
 *
 * return (
 *   <ul>
 *     {data.map(todo => <li key={todo.id}>{todo.text}</li>)}
 *   </ul>
 * )
 */
// Overload 1: Accept query function that always returns QueryBuilder
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
	deps?: Array<unknown>,
): {
	state: Map<string | number, GetResult<TContext>>;
	data: InferResultType<TContext>;
	collection: Collection<GetResult<TContext>, string | number, {}>;
	status: CollectionStatus; // Can't be disabled if always returns QueryBuilder
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: true; // Always true if always returns QueryBuilder
};

// Overload 2: Accept query function that can return undefined/null
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext> | undefined | null,
	deps?: Array<unknown>,
): {
	state: Map<string | number, GetResult<TContext>> | undefined;
	data: InferResultType<TContext> | undefined;
	collection: Collection<GetResult<TContext>, string | number, {}> | undefined;
	status: UseLiveQueryStatus;
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: boolean;
};

// Overload 3: Accept query function that can return LiveQueryCollectionConfig
export function useLiveQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => LiveQueryCollectionConfig<TContext> | undefined | null,
	deps?: Array<unknown>,
): {
	state: Map<string | number, GetResult<TContext>> | undefined;
	data: InferResultType<TContext> | undefined;
	collection: Collection<GetResult<TContext>, string | number, {}> | undefined;
	status: UseLiveQueryStatus;
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: boolean;
};

// Overload 4: Accept query function that can return Collection
export function useLiveQuery<
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>,
>(
	queryFn: (q: InitialQueryBuilder) => Collection<TResult, TKey, TUtils> | undefined | null,
	deps?: Array<unknown>,
): {
	state: Map<TKey, TResult> | undefined;
	data: Array<TResult> | undefined;
	collection: Collection<TResult, TKey, TUtils> | undefined;
	status: UseLiveQueryStatus;
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: boolean;
};

// Overload 5: Accept query function that can return all types
export function useLiveQuery<
	TContext extends Context,
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>,
>(
	queryFn: (
		q: InitialQueryBuilder,
	) =>
		| QueryBuilder<TContext>
		| LiveQueryCollectionConfig<TContext>
		| Collection<TResult, TKey, TUtils>
		| undefined
		| null,
	deps?: Array<unknown>,
): {
	state: Map<string | number, GetResult<TContext>> | Map<TKey, TResult> | undefined;
	data: InferResultType<TContext> | Array<TResult> | undefined;
	collection:
		| Collection<GetResult<TContext>, string | number, {}>
		| Collection<TResult, TKey, TUtils>
		| undefined;
	status: UseLiveQueryStatus;
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: boolean;
};

/**
 * Create a live query using configuration object
 * @param config - Configuration object with query and options
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with reactive data, state, and status information
 * @example
 * // Basic config object usage
 * const { data, status } = useLiveQuery({
 *   query: (q) => q.from({ todos: todosCollection }),
 *   gcTime: 60000
 * })
 *
 * @example
 * // With query builder and options
 * const queryBuilder = new Query()
 *   .from({ persons: collection })
 *   .where(({ persons }) => gt(persons.age, 30))
 *   .select(({ persons }) => ({ id: persons.id, name: persons.name }))
 *
 * const { data, isReady } = useLiveQuery({ query: queryBuilder })
 *
 * @example
 * // Handle all states uniformly
 * const { data, isLoading, isReady, isError } = useLiveQuery({
 *   query: (q) => q.from({ items: itemCollection })
 * })
 *
 * if (isLoading) return <div>Loading...</div>
 * if (isError) return <div>Something went wrong</div>
 * if (!isReady) return <div>Preparing...</div>
 *
 * return <div>{data.length} items loaded</div>
 */
// Overload 6: Accept config object
export function useLiveQuery<TContext extends Context>(
	config: LiveQueryCollectionConfig<TContext>,
	deps?: Array<unknown>,
): {
	state: Map<string | number, GetResult<TContext>>;
	data: InferResultType<TContext>;
	collection: Collection<GetResult<TContext>, string | number, {}>;
	status: CollectionStatus; // Can't be disabled for config objects
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: true; // Always true for config objects
};

/**
 * Subscribe to an existing live query collection
 * @param liveQueryCollection - Pre-created live query collection to subscribe to
 * @returns Object with reactive data, state, and status information
 * @example
 * // Using pre-created live query collection
 * const myLiveQuery = createLiveQueryCollection((q) =>
 *   q.from({ todos: todosCollection }).where(({ todos }) => eq(todos.active, true))
 * )
 * const { data, collection } = useLiveQuery(myLiveQuery)
 *
 * @example
 * // Access collection methods directly
 * const { data, collection, isReady } = useLiveQuery(existingCollection)
 *
 * // Use collection for mutations
 * const handleToggle = (id) => {
 *   collection.update(id, draft => { draft.completed = !draft.completed })
 * }
 *
 * @example
 * // Handle states consistently
 * const { data, isLoading, isError } = useLiveQuery(sharedCollection)
 *
 * if (isLoading) return <div>Loading...</div>
 * if (isError) return <div>Error loading data</div>
 *
 * return <div>{data.map(item => <Item key={item.id} {...item} />)}</div>
 */
// Overload 7: Accept pre-created live query collection
export function useLiveQuery<
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>,
>(
	liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult,
): {
	state: Map<TKey, TResult>;
	data: Array<TResult>;
	collection: Collection<TResult, TKey, TUtils>;
	status: CollectionStatus; // Can't be disabled for pre-created live query collections
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: true; // Always true for pre-created live query collections
};

// Overload 8: Accept pre-created live query collection with singleResult: true
export function useLiveQuery<
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>,
>(
	liveQueryCollection: Collection<TResult, TKey, TUtils> & SingleResult,
): {
	state: Map<TKey, TResult>;
	data: TResult | undefined;
	collection: Collection<TResult, TKey, TUtils> & SingleResult;
	status: CollectionStatus; // Can't be disabled for pre-created live query collections
	isLoading: boolean;
	isReady: boolean;
	isIdle: boolean;
	isError: boolean;
	isCleanedUp: boolean;
	isEnabled: true; // Always true for pre-created live query collections
};

// Implementation - use function overloads to infer the actual collection type
export function useLiveQuery(configOrQueryOrCollection: any, ...rest: Array<unknown>) {
	const [args, slot] = splitTrailingSlot(rest);
	const deps = (args[0] as Array<unknown> | undefined) ?? [];
	// Check if it's already a collection
	const inputIsCollection = isCollection(configOrQueryOrCollection);

	// Use refs to cache collection and track dependencies
	const collectionRef = useRef<Collection<object, string | number, {}> | null>(
		null,
		subSlot(slot, `coll-ref`),
	);
	const depsRef = useRef<Array<unknown> | null>(null, subSlot(slot, `deps-ref`));
	const configRef = useRef<unknown>(null, subSlot(slot, `cfg-ref`));

	// The shared observer owns the collection subscription, the ready-race, the
	// status-transition notifications, and the stable per-revision snapshot. It
	// replaces the previous hand-rolled `subscribeChanges` + version-counter,
	// which only fired on row changes and therefore missed status-only
	// transitions (a collection going to `error` or `cleaned-up` without any row
	// delta left `status`/`isError`/`isCleanedUp` stale). See TanStack DB #1642.
	const observerRef = useRef<LiveQueryObserver<object, string | number> | null>(
		null,
		subSlot(slot, `obs-ref`),
	);

	// Check if we need to create/recreate the collection
	const needsNewCollection =
		!collectionRef.current ||
		(inputIsCollection && configRef.current !== configOrQueryOrCollection) ||
		(!inputIsCollection &&
			(depsRef.current === null ||
				depsRef.current.length !== deps.length ||
				depsRef.current.some((dep, i) => dep !== deps[i])));

	if (needsNewCollection) {
		if (inputIsCollection) {
			// Warn when passing a collection directly with on-demand sync mode
			// In on-demand mode, data is only loaded when queries with predicates request it
			// Passing the collection directly doesn't provide any predicates, so no data loads
			const syncMode = (configOrQueryOrCollection as { config?: { syncMode?: string } }).config
				?.syncMode;
			if (syncMode === `on-demand`) {
				console.warn(
					`[useLiveQuery] Warning: Passing a collection with syncMode "on-demand" directly to useLiveQuery ` +
						`will not load any data. In on-demand mode, data is only loaded when queries with predicates request it.\n\n` +
						`Instead, use a query builder function:\n` +
						`  const { data } = useLiveQuery((q) => q.from({ c: myCollection }).select(({ c }) => c))\n\n` +
						`Or switch to syncMode "eager" if you want all data to sync automatically.`,
				);
			}
			// It's already a collection, ensure sync is started for Octane hooks
			configOrQueryOrCollection.startSyncImmediate();
			collectionRef.current = configOrQueryOrCollection;
			configRef.current = configOrQueryOrCollection;
		} else {
			// Handle different callback return types
			if (typeof configOrQueryOrCollection === `function`) {
				// Call the function with a query builder to see what it returns
				const queryBuilder = new BaseQueryBuilder() as InitialQueryBuilder;
				const result = configOrQueryOrCollection(queryBuilder);

				if (result === undefined || result === null) {
					// Callback returned undefined/null - disabled query
					collectionRef.current = null;
				} else if (isCollection(result)) {
					// Callback returned a Collection instance - use it directly
					result.startSyncImmediate();
					collectionRef.current = result;
				} else if (result instanceof BaseQueryBuilder) {
					// Callback returned QueryBuilder - create live query collection using the original callback
					// (not the result, since the result might be from a different query builder instance)
					collectionRef.current = createLiveQueryCollection({
						query: configOrQueryOrCollection,
						startSync: true,
						gcTime: DEFAULT_GC_TIME_MS,
					});
				} else if (result && typeof result === `object`) {
					// Assume it's a LiveQueryCollectionConfig
					collectionRef.current = createLiveQueryCollection({
						startSync: true,
						gcTime: DEFAULT_GC_TIME_MS,
						...result,
					});
				} else {
					// Unexpected return type
					throw new Error(
						`useLiveQuery callback must return a QueryBuilder, LiveQueryCollectionConfig, Collection, undefined, or null. Got: ${typeof result}`,
					);
				}
				depsRef.current = [...deps];
			} else {
				// Original logic for config objects
				collectionRef.current = createLiveQueryCollection({
					startSync: true,
					gcTime: DEFAULT_GC_TIME_MS,
					...configOrQueryOrCollection,
				});
				depsRef.current = [...deps];
			}
		}
	}

	// Recreate the observer when the underlying collection changes (including to
	// `null` for a disabled query, which yields a stable disabled snapshot). The
	// observer is not disposed explicitly here or on unmount: useSyncExternalStore
	// unsubscribes it when the subscribe function changes or the component
	// unmounts, which detaches the collection subscription and lets the observer
	// be GC'd. An unmount effect that disposed it would misfire under effect
	// replay, leaving a disposed observer in the ref.
	if (needsNewCollection) {
		// Wholesale mode: Octane re-reads getSnapshot() on notify (matching
		// useSyncExternalStore), preserves the hook's loading policy, and delivers
		// nothing synchronously during subscribe — so subscribe never notifies the
		// store from inside its own call.
		observerRef.current = createLiveQueryObserver(collectionRef.current, {
			mode: `wholesale`,
		});
	}
	const observer = observerRef.current!;

	// Stable subscribe/getSnapshot bound to the current observer. The observer
	// returns a stable per-revision snapshot whose shape (state, data, collection,
	// status + flags, isEnabled) is exactly what this hook exposes, so no
	// post-processing is needed.
	const subscribeRef = useRef<((onStoreChange: () => void) => () => void) | null>(
		null,
		subSlot(slot, `sub-ref`),
	);
	if (!subscribeRef.current || needsNewCollection) {
		subscribeRef.current = (onStoreChange: () => void) => {
			let unsubscribed = false;
			const unsub = observer.subscribe(() => {
				if (!unsubscribed) onStoreChange();
			});
			// Nudge Octane to re-read the snapshot on the next microtask. Octane's
			// useSyncExternalStore runs its commit-time tear-check BEFORE this passive
			// subscribe effect calls us (React re-checks AFTER subscribe), so a
			// collection that is already `ready` — or that starts sync synchronously
			// during subscribe — publishes no change the observer can forward and the
			// first committed value would stay stale. Deferring to a microtask keeps
			// the notify outside the render→commit window. See the
			// `eager-onstorechange` regression test.
			queueMicrotask(() => {
				if (!unsubscribed) onStoreChange();
			});
			return () => {
				unsubscribed = true;
				unsub();
			};
		};
	}

	const getSnapshotRef = useRef<(() => unknown) | null>(null, subSlot(slot, `gs-ref`));
	if (!getSnapshotRef.current || needsNewCollection) {
		getSnapshotRef.current = () => observer.getSnapshot();
	}

	// Keep implementation return loose to satisfy the overload signatures.
	return useSyncExternalStore(
		subscribeRef.current,
		getSnapshotRef.current,
		getSnapshotRef.current,
		subSlot(slot, `uses`),
	) as any;
}

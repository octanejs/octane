import { useRef, useSyncExternalStore } from 'octane';
import {
	CollectionImpl,
	createLiveQueryCollection,
	createLiveQueryWindowController,
	deepEquals,
} from '@tanstack/db';
import { splitTrailingSlot, subSlot } from './slot';
// Type-only: used in `ReturnType<typeof useLiveQuery>` in UseLiveInfiniteQueryReturn.
import type { useLiveQuery } from './useLiveQuery';
import type {
	Collection,
	Context,
	InferResultType,
	InitialQueryBuilder,
	LiveQueryWindowController,
	NonSingleResult,
	QueryBuilder,
} from '@tanstack/db';

// Live queries created here are cleaned up immediately (0 disables GC).
const DEFAULT_GC_TIME_MS = 1;

type WindowedCollection = Collection<any, any, any> & {
	utils: {
		setWindow: (options: { offset: number; limit: number }) => true | Promise<void>;
		getWindow: () => { offset: number; limit: number | null } | undefined;
	};
};

/**
 * Does this pre-created collection support windowing (i.e. has an ORDER BY)?
 *
 * In TanStack DB 0.7.0 every live-query collection exposes `setWindow`/`getWindow`
 * on `utils`, so a bare `typeof setWindow === 'function'` check is always true and
 * cannot detect a missing ORDER BY — calling `setWindow` without one throws
 * `SetWindowRequiresOrderByError` later, inside the controller's subscribe (a
 * passive effect Octane swallows), never reaching the caller. `getWindow()`
 * instead returns the current window only for an ordered query and `undefined`
 * otherwise, independent of preload/sync state, so it is the reliable render-time
 * signal that lets the hook reject a non-orderBy collection synchronously.
 */
function supportsWindowing(
	collection: Collection<any, any, any>,
): collection is WindowedCollection {
	const utils = collection.utils as WindowedCollection[`utils`] | undefined;
	return typeof utils?.setWindow === `function` && utils.getWindow?.() !== undefined;
}

export type UseLiveInfiniteQueryConfig<TContext extends Context> = {
	pageSize?: number;
	initialPageParam?: number;
	/**
	 * @deprecated This callback is not used by the current implementation.
	 * Pagination is determined internally via a peek-ahead strategy.
	 * Provided for API compatibility with TanStack Query conventions.
	 */
	getNextPageParam?: (
		lastPage: Array<InferResultType<TContext>[number]>,
		allPages: Array<Array<InferResultType<TContext>[number]>>,
		lastPageParam: number,
		allPageParams: Array<number>,
	) => number | undefined;
};

export type UseLiveInfiniteQueryReturn<TContext extends Context> = Omit<
	ReturnType<typeof useLiveQuery<TContext>>,
	`data`
> & {
	data: InferResultType<TContext>;
	pages: Array<Array<InferResultType<TContext>[number]>>;
	pageParams: Array<number>;
	fetchNextPage: () => void;
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	/** The last pagination failure, cleared when a retry begins. */
	error: unknown;
};

/**
 * Create an infinite query using a query function with live updates
 *
 * Uses `utils.setWindow()` to dynamically adjust the limit/offset window
 * without recreating the live query collection on each page change.
 *
 * @param queryFn - Query function that defines what data to fetch. Must include `.orderBy()` for setWindow to work.
 * @param config - Configuration including pageSize and getNextPageParam
 * @param deps - Array of dependencies that trigger query re-execution when changed
 * @returns Object with pages, data, and pagination controls
 *
 * @example
 * // Basic infinite query
 * const { data, pages, fetchNextPage, hasNextPage } = useLiveInfiniteQuery(
 *   (q) => q
 *     .from({ posts: postsCollection })
 *     .orderBy(({ posts }) => posts.createdAt, 'desc')
 *     .select(({ posts }) => ({
 *       id: posts.id,
 *       title: posts.title
 *     })),
 *   {
 *     pageSize: 20,
 *     getNextPageParam: (lastPage, allPages) =>
 *       lastPage.length === 20 ? allPages.length : undefined
 *   }
 * )
 *
 * @example
 * // With dependencies
 * const { pages, fetchNextPage } = useLiveInfiniteQuery(
 *   (q) => q
 *     .from({ posts: postsCollection })
 *     .where(({ posts }) => eq(posts.category, category))
 *     .orderBy(({ posts }) => posts.createdAt, 'desc'),
 *   {
 *     pageSize: 10,
 *     getNextPageParam: (lastPage) =>
 *       lastPage.length === 10 ? lastPage.length : undefined
 *   },
 *   [category]
 * )
 *
 * @example
 * // Router loader pattern with pre-created collection
 * // In loader:
 * const postsQuery = createLiveQueryCollection({
 *   query: (q) => q
 *     .from({ posts: postsCollection })
 *     .orderBy(({ posts }) => posts.createdAt, 'desc')
 *     .limit(20)
 * })
 * await postsQuery.preload()
 * return { postsQuery }
 *
 * // In component:
 * const { postsQuery } = useLoaderData()
 * const { data, fetchNextPage, hasNextPage } = useLiveInfiniteQuery(
 *   postsQuery,
 *   {
 *     pageSize: 20,
 *     getNextPageParam: (lastPage) => lastPage.length === 20 ? lastPage.length : undefined
 *   }
 * )
 */

// Overload for pre-created collection (non-single result)
export function useLiveInfiniteQuery<
	TResult extends object,
	TKey extends string | number,
	TUtils extends Record<string, any>,
>(
	liveQueryCollection: Collection<TResult, TKey, TUtils> & NonSingleResult,
	config: UseLiveInfiniteQueryConfig<any>,
): UseLiveInfiniteQueryReturn<any>;

// Overload for query function
export function useLiveInfiniteQuery<TContext extends Context>(
	queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
	config: UseLiveInfiniteQueryConfig<TContext>,
	deps?: Array<unknown>,
): UseLiveInfiniteQueryReturn<TContext>;

// Implementation
export function useLiveInfiniteQuery<TContext extends Context>(
	queryFnOrCollection: any,
	config: UseLiveInfiniteQueryConfig<TContext>,
	...rest: Array<unknown>
): UseLiveInfiniteQueryReturn<TContext> {
	const [args, slot] = splitTrailingSlot(rest);
	const deps = (args[0] as Array<unknown> | undefined) ?? [];

	const pageSize = config.pageSize ?? 20;
	if (pageSize <= 0) {
		throw new Error(
			`useLiveInfiniteQuery: pageSize must be a positive integer. Received: ${pageSize}`,
		);
	}
	const initialPageParam = config.initialPageParam ?? 0;

	// Detect if input is a collection or query function
	const isCollection = queryFnOrCollection instanceof CollectionImpl;

	// Validate input type
	if (!isCollection && typeof queryFnOrCollection !== `function`) {
		throw new Error(
			`useLiveInfiniteQuery: First argument must be either a pre-created live query collection (CollectionImpl) ` +
				`or a query function. Received: ${typeof queryFnOrCollection}`,
		);
	}

	// The shared window controller (TanStack DB #1675) owns the physical window,
	// committed pages, pagination error, and the fetch/reset lifecycle. It
	// coordinates a per-consumer window lease over the underlying collection, so
	// two hooks pointed at one pre-created collection no longer truncate each
	// other's window and an unmount restores the surviving consumer's window.
	// It also rolls back a failed page load and exposes it on `snapshot.error`
	// with a clean retry, replacing the old fire-and-forget `setWindow` that
	// merely logged and permanently consumed the page.
	const collectionRef = useRef<Collection<any, any, any> | null>(null, subSlot(slot, `coll-ref`));
	const controllerRef = useRef<LiveQueryWindowController<any, any> | null>(
		null,
		subSlot(slot, `ctrl-ref`),
	);
	const configRef = useRef<unknown>(null, subSlot(slot, `cfg-ref`));
	const depsRef = useRef<Array<unknown> | null>(null, subSlot(slot, `deps-ref`));
	const pageSizeRef = useRef(pageSize, subSlot(slot, `page-size-ref`));
	const initialPageParamRef = useRef(initialPageParam, subSlot(slot, `page-param-ref`));
	const validatedCollectionRef = useRef<unknown>(null, subSlot(slot, `validated-ref`));
	const inputKind = isCollection ? `collection` : `query`;
	const inputKindRef = useRef<`collection` | `query` | null>(null, subSlot(slot, `kind-ref`));
	const previousInputKind = inputKindRef.current;

	const dependenciesChanged =
		!isCollection &&
		(depsRef.current === null ||
			depsRef.current.length !== deps.length ||
			depsRef.current.some((dep, index) => dep !== deps[index]));
	const dependenciesStructurallyEqual =
		!isCollection && depsRef.current !== null && deepEquals(depsRef.current, deps);
	const needsNewCollection =
		!collectionRef.current ||
		inputKindRef.current !== inputKind ||
		(isCollection && configRef.current !== queryFnOrCollection) ||
		dependenciesChanged;
	const pageShapeChanged =
		pageSizeRef.current !== pageSize || initialPageParamRef.current !== initialPageParam;
	const needsNewController = !controllerRef.current || needsNewCollection || pageShapeChanged;

	if (needsNewCollection) {
		inputKindRef.current = inputKind;
		if (isCollection) {
			const collection = queryFnOrCollection as Collection<any, any, any>;
			if (!supportsWindowing(collection)) {
				// Surfaced synchronously during render (not from a passive effect), so
				// a caller — and a test's expect().toThrow — observes it directly.
				throw new Error(
					`useLiveInfiniteQuery: Pre-created live query collection must have an orderBy clause for infinite pagination to work (setWindow() is unavailable without one). ` +
						`Please add .orderBy() to your createLiveQueryCollection query.`,
				);
			}
			// Warn once per collection instance if its current window doesn't match
			// the first page the hook is about to enforce.
			if (validatedCollectionRef.current !== collection) {
				validatedCollectionRef.current = collection;
				const currentWindow = collection.utils.getWindow?.();
				if (currentWindow && (currentWindow.offset !== 0 || currentWindow.limit !== pageSize + 1)) {
					console.warn(
						`useLiveInfiniteQuery: Pre-created collection has window {offset: ${currentWindow.offset}, limit: ${currentWindow.limit}} ` +
							`but the hook expects {offset: 0, limit: ${pageSize + 1}}. Adjusting window now.`,
					);
				}
			}
			collectionRef.current = collection;
			configRef.current = queryFnOrCollection;
		} else {
			// Wrap the query with the first page's peek-ahead window; the controller
			// grows the limit from here. Construction happens during render, so keep
			// synchronization idle until the committed controller subscription first
			// acquires the matching window lease.
			collectionRef.current = createLiveQueryCollection({
				query: (q: InitialQueryBuilder) =>
					queryFnOrCollection(q)
						.limit(pageSize + 1)
						.offset(0),
				startSync: false,
				gcTime: DEFAULT_GC_TIME_MS,
			});
			depsRef.current = [...deps];
		}
	}

	if (needsNewController) {
		const previousController = controllerRef.current;
		// Preserve the committed page count across a controller swap when the
		// underlying data window is unchanged (same collection, or same query with
		// structurally-equal deps). A genuine deps change resets to the first page.
		const canPreservePageCount =
			previousController !== null &&
			(!needsNewCollection || (previousInputKind === `query` && dependenciesStructurallyEqual));
		const initialPageCount = canPreservePageCount
			? Math.max(1, previousController.getSnapshot().pages.length)
			: 1;
		pageSizeRef.current = pageSize;
		initialPageParamRef.current = initialPageParam;
		controllerRef.current = createLiveQueryWindowController(collectionRef.current, {
			pageSize,
			initialPageParam,
			initialPageCount,
		});
	}
	const controller = controllerRef.current!;

	// Stable subscribe / getSnapshot / fetchNextPage bound to the current
	// controller; recreated only when the controller is swapped.
	const subscribeRef = useRef<((onStoreChange: () => void) => () => void) | null>(
		null,
		subSlot(slot, `sub-ref`),
	);
	const getSnapshotRef = useRef<(() => ReturnType<typeof controller.getSnapshot>) | null>(
		null,
		subSlot(slot, `gs-ref`),
	);
	const fetchNextPageRef = useRef<(() => void) | null>(null, subSlot(slot, `fetch-ref`));
	if (needsNewController || !subscribeRef.current) {
		subscribeRef.current = (onStoreChange: () => void) => {
			let unsubscribed = false;
			const unsub = controller.subscribe(() => {
				if (!unsubscribed) onStoreChange();
			});
			// The controller starts sync and, for a pre-created collection whose
			// window differs from the hook's page shape, grows the window via
			// setWindow synchronously during subscribe. That growth publishes no
			// change the observer can forward, and Octane's useSyncExternalStore
			// tear-check already ran before this passive subscribe effect. Nudge
			// Octane to re-read the freshly-grown snapshot on the next microtask.
			// See useLiveQuery's matching note and the eager-onstorechange test.
			queueMicrotask(() => {
				if (!unsubscribed) onStoreChange();
			});
			return () => {
				unsubscribed = true;
				unsub();
			};
		};
		getSnapshotRef.current = () => controller.getSnapshot();
		fetchNextPageRef.current = () => {
			// Pagination errors surface on the controller snapshot's `error`; the void
			// callback has no promise channel, so consume the rejection here.
			void controller.fetchNextPage().catch(() => {});
		};
	}

	const snapshot = useSyncExternalStore(
		subscribeRef.current,
		getSnapshotRef.current!,
		getSnapshotRef.current!,
		subSlot(slot, `uses`),
	);

	return {
		data: snapshot.data,
		state: snapshot.state,
		status: snapshot.status,
		isLoading: snapshot.isLoading,
		isReady: snapshot.isReady,
		isIdle: snapshot.isIdle,
		isError: snapshot.isError,
		isCleanedUp: snapshot.isCleanedUp,
		collection: snapshot.collection,
		isEnabled: snapshot.isEnabled,
		pages: snapshot.pages,
		pageParams: snapshot.pageParams,
		fetchNextPage: fetchNextPageRef.current!,
		hasNextPage: snapshot.hasNextPage,
		isFetchingNextPage: snapshot.isFetchingNextPage,
		error: snapshot.error,
	} as unknown as UseLiveInfiniteQueryReturn<TContext>;
}

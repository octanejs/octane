import React from 'react';

type CacheEntry<T> =
    | Readonly<{ promise: PromiseLike<unknown>; status: 'pending' }>
    | Readonly<{ reason: unknown; status: 'rejected' }>
    | Readonly<{ status: 'fulfilled'; value: T }>;

const cache = new WeakMap<PromiseLike<unknown>, CacheEntry<unknown>>();

function trackedPromise<T>(promise: PromiseLike<T>): PromiseLike<void> {
    // Returns the *chained* promise (not the original). React subscribes to the thrown value to
    // know when to retry; throwing the chained one means retry runs strictly after our
    // cache-update handler, so the next render is guaranteed to see the settled entry.
    return promise.then(
        value => {
            cache.set(promise, { status: 'fulfilled', value });
        },
        reason => {
            cache.set(promise, { reason, status: 'rejected' });
        },
    );
}

/**
 * React 18 fallback for `React.use(promise)` — suspends by throwing the promise on first render,
 * returns the resolved value on subsequent renders, and re-throws the rejection if the promise
 * settles with an error.
 *
 * The promise identity must be stable across renders so the cache keyed off it can find the
 * settled entry on the second render. The {@link ClientProvider}'s consumer-facing contract
 * documents this — pass a memoised or module-scope promise.
 */
function usePromiseShim<T>(promise: PromiseLike<T>): T {
    let entry = cache.get(promise) as CacheEntry<T> | undefined;
    if (entry == null) {
        const tracked = trackedPromise(promise);
        entry = { promise: tracked, status: 'pending' };
        cache.set(promise, entry);
    }
    if (entry.status === 'pending') throw entry.promise;
    if (entry.status === 'rejected') throw entry.reason;
    return entry.value;
}

type ReactWithUse = typeof React & {
    use?: <T>(promise: PromiseLike<T>) => T;
};

function isPromiseLike<T>(value: PromiseLike<T> | T): value is PromiseLike<T> {
    return (
        !!value &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof (value as PromiseLike<T>).then === 'function'
    );
}

/**
 * Returns `value` directly if it is a plain value, or unwraps it (suspending the subtree until
 * it settles) if it is a {@link PromiseLike}. Designed to be invoked unconditionally so consumers
 * don't have to gate on the runtime shape of the input — that keeps the call site
 * rules-of-hooks-friendly even when the same provider sees both sync and async clients.
 *
 * The `React.use` lookup is deferred to call time so the module has no top-level side effects
 * (agadoo's tree-shake check fails otherwise on the property-access expression).
 */
export function usePromise<T>(value: PromiseLike<T> | T): T {
    if (!isPromiseLike(value)) return value;
    return ((React as ReactWithUse).use ?? usePromiseShim)(value);
}

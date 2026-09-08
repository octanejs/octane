import { createReactiveActionStore, type ReactiveActionSource, type ReactiveActionStore } from '@solana/kit';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SWRConfig } from 'swr';

import { renderHook } from '../../__test-utils__/render';
import { useRequestSWR } from '../useRequestSWR';

// Wrap every render in an SWRConfig that:
// - Uses a fresh provider Map so cache state never leaks between tests.
// - Disables retries so a rejected fetch surfaces as `error` immediately instead of triggering
//   SWR's exponential backoff.
// - Disables window-focus / network-reconnect revalidation so the test environment doesn't
//   accidentally re-fire fetches during assertions.
function wrapper({ children }: { children: React.ReactNode }) {
    return (
        <SWRConfig
            value={{
                errorRetryCount: 0,
                provider: () => new Map(),
                revalidateOnFocus: false,
                revalidateOnReconnect: false,
            }}
        >
            {children}
        </SWRConfig>
    );
}

// Recursive `Partial` that also descends into function return types — needed so a stubbed
// `withSignal: () => ({ dispatchAsync })` type-checks against `withSignal`'s actual return shape
// (the full `ReactiveActionStore`).
type DeepPartial<T> = T extends (...args: infer A) => infer R
    ? (...args: A) => DeepPartial<R>
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

// Wraps a partial `ReactiveActionStore` stub into a `ReactiveActionSource`, isolating the
// type-narrowing cast to one place so spy-on-store tests stay legible. The `DeepPartial`
// parameter gives the test author keyname autocomplete and catches typos, while leaving them
// free to stub only the fields the code path under exercise actually reads.
function stubActionSource<T>(store: DeepPartial<ReactiveActionStore<[], T>>): ReactiveActionSource<T> {
    return {
        reactiveStore: () => store as ReactiveActionStore<[], T>,
    };
}

function makeFakeSource<T>(): {
    fn: jest.Mock<Promise<T>, [AbortSignal]>;
    rejectLatest: (err: unknown) => void;
    resolveLatest: (value: T) => void;
    source: ReactiveActionSource<T>;
} {
    let latest: PromiseWithResolvers<T> | null = null;
    const fn = jest.fn<Promise<T>, [AbortSignal]>(() => {
        latest = Promise.withResolvers<T>();
        return latest.promise;
    });
    return {
        fn,
        rejectLatest(err) {
            latest!.reject(err);
        },
        resolveLatest(value) {
            latest!.resolve(value);
        },
        source: {
            reactiveStore() {
                return createReactiveActionStore<[], T>(fn);
            },
        },
    };
}

describe('useRequestSWR', () => {
    describe('with a function source', () => {
        it('auto-fires the fetcher on mount and transitions to data on success', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const { result } = renderHook(() => useRequestSWR(['fn-success'], fn), { wrapper });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            // Sync point — under SWR + jsdom, the cache entry needs to settle between the
            // fetcher being invoked and the deferred promise being resolved. Accessing
            // `result.current` here lets React commit the loading state before we trigger the
            // resolution.
            expect(result.current.data).toBeUndefined();

            await act(async () => resolve('hi'));
            await waitFor(() => expect(result.current.data).toBe('hi'));
            expect(result.current.error).toBeUndefined();
        });

        it('surfaces the rejection as `error`', async () => {
            const boom = new Error('boom');
            const { promise, reject } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const { result } = renderHook(() => useRequestSWR(['fn-error'], fn), { wrapper });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeUndefined();

            await act(async () => reject(boom));
            await waitFor(() => expect(result.current.error).toBe(boom));
        });

        it('threads an `AbortSignal` into the function', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            renderHook(() => useRequestSWR(['signal-threaded'], fn), { wrapper });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            const signal = fn.mock.calls[0][0];
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
            await act(async () => resolve('ok'));
        });

        it('passes the user-supplied `getAbortSignal` signal through to the function', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const ctrl = new AbortController();
            const getAbortSignal = jest.fn(() => ctrl.signal);
            renderHook(() => useRequestSWR(['user-signal'], fn, { getAbortSignal }), { wrapper });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(getAbortSignal).toHaveBeenCalledTimes(1);
            expect(fn.mock.calls[0][0]).toBe(ctrl.signal);
            await act(async () => resolve('ok'));
        });

        it('surfaces a `getAbortSignal`-driven abort as `result.error`', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(
                signal =>
                    new Promise((_, reject) => {
                        signal.addEventListener('abort', () => reject(signal.reason));
                    }),
            );
            const ctrl = new AbortController();
            const { result } = renderHook(
                () => useRequestSWR(['user-signal-abort'], fn, { getAbortSignal: () => ctrl.signal }),
                { wrapper },
            );
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeUndefined();

            const reason = new Error('timeout');
            await act(async () => ctrl.abort(reason));
            await waitFor(() => expect(result.current.error).toBe(reason));
        });

        it('skips the fetch when the key is null', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('never'));
            const { result } = renderHook(() => useRequestSWR(null, fn), { wrapper });
            // Wait a tick to be sure SWR hasn't queued a fetch.
            await act(async () => {
                await Promise.resolve();
            });
            expect(fn).not.toHaveBeenCalled();
            expect(result.current.data).toBeUndefined();
        });

        it('skips the fetch when the source is null (even if the key is non-null)', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('never'));
            const initialProps: { source: ((signal: AbortSignal) => Promise<string>) | null } = { source: null };
            const { result, rerender } = renderHook(({ source }) => useRequestSWR(['key-set'], source), {
                initialProps,
                wrapper,
            });
            await act(async () => {
                await Promise.resolve();
            });
            expect(fn).not.toHaveBeenCalled();
            expect(result.current.data).toBeUndefined();

            // Transition to a real source — fetch fires.
            rerender({ source: fn });
            await waitFor(() => expect(result.current.data).toBe('never'));
        });

        it('starts firing once the key transitions from null to non-null', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('value'));
            const initialProps: { key: string | null } = { key: null };
            const { result, rerender } = renderHook(({ key }) => useRequestSWR(key, fn), { initialProps, wrapper });
            expect(fn).not.toHaveBeenCalled();

            rerender({ key: 'now-enabled' });
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('uses the latest source closure when `mutate()` is called', async () => {
            // SWR keys cache lookup — if the key is stable, a source-identity change alone won't
            // refetch. But the next fetch (e.g. via `mutate()`) should run the latest source. This
            // mirrors how SWR users normally encode source-dependent inputs in the key.
            const { result, rerender } = renderHook(
                ({ value }: { value: string }) => useRequestSWR(['latest-closure'], () => Promise.resolve(value)),
                { initialProps: { value: 'a' }, wrapper },
            );
            await waitFor(() => expect(result.current.data).toBe('a'));

            rerender({ value: 'b' });
            await act(async () => {
                await result.current.mutate();
            });
            await waitFor(() => expect(result.current.data).toBe('b'));
        });
    });

    describe('with a ReactiveActionSource (PendingRpc-like)', () => {
        it('builds a store per fetch and resolves through `dispatchAsync()`', async () => {
            const req = makeFakeSource<string>();
            const { result } = renderHook(() => useRequestSWR(['source-success'], req.source), { wrapper });
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            expect(result.current.data).toBeUndefined();

            await act(async () => req.resolveLatest('value'));
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('surfaces the rejection as `error`', async () => {
            const boom = new Error('boom');
            const req = makeFakeSource<string>();
            const { result } = renderHook(() => useRequestSWR(['source-error'], req.source), { wrapper });
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeUndefined();

            await act(async () => req.rejectLatest(boom));
            await waitFor(() => expect(result.current.error).toBe(boom));
        });

        it('dispatches without `withSignal` when no `getAbortSignal` is configured', async () => {
            // Parallel to the function-source "threads an AbortSignal into the function" — for the
            // reactive path, the absence of a user signal means the implementation should call
            // `store.dispatchAsync()` directly, not route through `withSignal`.
            const dispatchAsync = jest.fn(() => Promise.resolve('value'));
            const withSignal = jest.fn();
            const source = stubActionSource<string>({ dispatchAsync, withSignal });
            const { result } = renderHook(() => useRequestSWR(['source-no-signal'], source), { wrapper });
            await waitFor(() => expect(result.current.data).toBe('value'));
            expect(dispatchAsync).toHaveBeenCalled();
            expect(withSignal).not.toHaveBeenCalled();
        });

        it('passes the user-supplied `getAbortSignal` signal through to `withSignal`', async () => {
            // Parallel to the function-source identity check — verifies the signal handed to the
            // store is the exact one returned by `getAbortSignal`, not a wrapped or copied signal.
            const dispatchAsync = jest.fn(() => Promise.resolve('value'));
            const withSignal = jest.fn(() => ({ dispatchAsync }));
            const source = stubActionSource<string>({ dispatchAsync, withSignal });
            const ctrl = new AbortController();
            renderHook(
                () => useRequestSWR(['source-signal-identity'], source, { getAbortSignal: () => ctrl.signal }),
                { wrapper },
            );
            await waitFor(() => expect(withSignal).toHaveBeenCalledWith(ctrl.signal));
        });

        it('surfaces a `getAbortSignal`-driven abort as `result.error`', async () => {
            const req = makeFakeSource<string>();
            const ctrl = new AbortController();
            const { result } = renderHook(
                () => useRequestSWR(['source-user-signal'], req.source, { getAbortSignal: () => ctrl.signal }),
                { wrapper },
            );
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeUndefined();

            const reason = new Error('timeout');
            await act(async () => ctrl.abort(reason));
            await waitFor(() => expect(result.current.error).toBe(reason));
        });

        it('skips the fetch when the key is null', async () => {
            const req = makeFakeSource<string>();
            const { result } = renderHook(() => useRequestSWR(null, req.source), { wrapper });
            await act(async () => {
                await Promise.resolve();
            });
            expect(req.fn).not.toHaveBeenCalled();
            expect(result.current.data).toBeUndefined();
        });

        it('skips the fetch when the source is null (even if the key is non-null)', async () => {
            const req = makeFakeSource<string>();
            const initialProps: { source: ReactiveActionSource<string> | null } = { source: null };
            const { result, rerender } = renderHook(({ source }) => useRequestSWR(['source-key-set'], source), {
                initialProps,
                wrapper,
            });
            await act(async () => {
                await Promise.resolve();
            });
            expect(req.fn).not.toHaveBeenCalled();
            expect(result.current.data).toBeUndefined();

            // Transition to a real source — fetch fires.
            rerender({ source: req.source });
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            await act(async () => req.resolveLatest('value'));
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('starts firing once the key transitions from null to non-null', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('value'));
            const source: ReactiveActionSource<string> = {
                reactiveStore: () => createReactiveActionStore<[], string>(fn),
            };
            const initialProps: { key: string | null } = { key: null };
            const { result, rerender } = renderHook(({ key }) => useRequestSWR(key, source), {
                initialProps,
                wrapper,
            });
            expect(fn).not.toHaveBeenCalled();

            rerender({ key: 'source-now-enabled' });
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('uses the latest source when `mutate()` is called', async () => {
            // SWR keys cache lookup — if the key is stable, a source-identity change alone won't
            // refetch. But the next fetch (e.g. via `mutate()`) should run the latest source.
            const sourceFor = (value: string): ReactiveActionSource<string> => ({
                reactiveStore: () => createReactiveActionStore<[], string>(() => Promise.resolve(value)),
            });
            const { result, rerender } = renderHook(
                ({ source }: { source: ReactiveActionSource<string> }) =>
                    useRequestSWR(['source-latest'], source),
                { initialProps: { source: sourceFor('a') }, wrapper },
            );
            await waitFor(() => expect(result.current.data).toBe('a'));

            // Source identity changes but the key is stable — SWR doesn't auto-refetch.
            rerender({ source: sourceFor('b') });

            // `mutate()` re-fires; the ref-sync picks up the latest source.
            await act(async () => {
                await result.current.mutate();
            });
            await waitFor(() => expect(result.current.data).toBe('b'));
        });
    });

    describe('SSR', () => {
        it('renders without firing the fetcher', () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('never'));
            function Component() {
                const { data } = useRequestSWR(['ssr'], fn);
                return <p>{data ?? 'no-data'}</p>;
            }
            const html = renderToString(
                <SWRConfig value={{ provider: () => new Map() }}>
                    <Component />
                </SWRConfig>,
            );
            expect(html).toBe('<p>no-data</p>');
            // SWR fires the fetcher inside an effect — on the server, effects don't run.
            expect(fn).not.toHaveBeenCalled();
        });
    });
});

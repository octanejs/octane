import { createReactiveActionStore, type ReactiveActionSource, type ReactiveActionStore } from '@solana/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { renderHook } from '../../__test-utils__/render';
import { useRequestQuery } from '../useRequestQuery';

// A fresh `QueryClient` per render so cache state never leaks between tests. Retries are disabled
// so a rejected fetch surfaces as `error` immediately instead of triggering TanStack's backoff, and
// the focus/reconnect refetch triggers are off so the test environment doesn't accidentally re-fire
// queries during assertions.
function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                gcTime: 0,
                refetchOnReconnect: false,
                refetchOnWindowFocus: false,
                retry: false,
                staleTime: 0,
            },
        },
    });
    return function wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
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
// type-narrowing cast to one place so spy-on-store tests stay legible.
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

describe('useRequestQuery', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    describe('with a function source', () => {
        it('auto-fires the queryFn on mount and transitions to data on success', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const { result } = renderHook(() => useRequestQuery(['fn-success'], fn), { wrapper: createWrapper() });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(result.current.data).toBeUndefined();

            await act(async () => resolve('hi'));
            await waitFor(() => expect(result.current.data).toBe('hi'));
            expect(result.current.error).toBeNull();
        });

        it('surfaces the rejection as `error`', async () => {
            const boom = new Error('boom');
            const { promise, reject } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const { result } = renderHook(() => useRequestQuery(['fn-error'], fn), { wrapper: createWrapper() });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeNull();

            await act(async () => reject(boom));
            await waitFor(() => expect(result.current.error).toBe(boom));
        });

        it('threads an `AbortSignal` into the function', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            renderHook(() => useRequestQuery(['signal-threaded'], fn), { wrapper: createWrapper() });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            const signal = fn.mock.calls[0][0];
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
            await act(async () => resolve('ok'));
        });

        it('invokes the user-supplied `getAbortSignal` factory', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const ctrl = new AbortController();
            const getAbortSignal = jest.fn(() => ctrl.signal);
            renderHook(() => useRequestQuery(['user-signal'], fn, { getAbortSignal }), { wrapper: createWrapper() });
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(getAbortSignal).toHaveBeenCalledTimes(1);
            const signal = fn.mock.calls[0][0];
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal.aborted).toBe(false);
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
                () => useRequestQuery(['user-signal-abort'], fn, { getAbortSignal: () => ctrl.signal }),
                { wrapper: createWrapper() },
            );
            await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeNull();

            const reason = new Error('timeout');
            await act(async () => ctrl.abort(reason));
            await waitFor(() => expect(result.current.error).toBe(reason));
        });

        it('does not fire the queryFn while disabled via `enabled: false`', async () => {
            jest.useFakeTimers();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('never'));
            const { result } = renderHook(() => useRequestQuery(['disabled'], fn, { enabled: false }), {
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(fn).not.toHaveBeenCalled();
            expect(result.current.fetchStatus).toBe('idle');
        });

        it('starts firing once `enabled` transitions from false to true', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('value'));
            const initialProps: { enabled: boolean } = { enabled: false };
            const { result, rerender } = renderHook(({ enabled }) => useRequestQuery(['toggle'], fn, { enabled }), {
                initialProps,
                wrapper: createWrapper(),
            });
            expect(fn).not.toHaveBeenCalled();

            rerender({ enabled: true });
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('does not fire the queryFn when the source is null', async () => {
            // A null source maps to `enabled: false`, so the query stays idle (it never schedules a
            // queryFn to fire). The "fires once the source is set" path is covered by the next test.
            jest.useFakeTimers();
            const initialProps: { source: ((signal: AbortSignal) => Promise<string>) | null } = { source: null };
            const { result } = renderHook(({ source }) => useRequestQuery(['null-source'], source), {
                initialProps,
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(result.current.fetchStatus).toBe('idle');
            expect(result.current.data).toBeUndefined();
        });

        it('starts firing once the source transitions from null to non-null', async () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('value'));
            const initialProps: { source: ((signal: AbortSignal) => Promise<string>) | null } = { source: null };
            const { result, rerender } = renderHook(({ source }) => useRequestQuery(['null-to-source'], source), {
                initialProps,
                wrapper: createWrapper(),
            });
            expect(fn).not.toHaveBeenCalled();

            rerender({ source: fn });
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('respects `enabled: false` even when the source is non-null', async () => {
            jest.useFakeTimers();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('never'));
            const { result } = renderHook(() => useRequestQuery(['both-channels'], fn, { enabled: false }), {
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(fn).not.toHaveBeenCalled();
            expect(result.current.fetchStatus).toBe('idle');
        });

        it('uses the latest source closure when `refetch()` is called', async () => {
            // TanStack keys cache lookup on `queryKey` — if the key is stable, a source-identity
            // change alone won't refetch. But the next fetch (e.g. via `refetch()`) should run the
            // latest source.
            const { result, rerender } = renderHook(
                ({ value }: { value: string }) => useRequestQuery(['latest-closure'], () => Promise.resolve(value)),
                { initialProps: { value: 'a' }, wrapper: createWrapper() },
            );
            await waitFor(() => expect(result.current.data).toBe('a'));

            rerender({ value: 'b' });
            await act(async () => {
                await result.current.refetch();
            });
            await waitFor(() => expect(result.current.data).toBe('b'));
        });
    });

    describe('with a ReactiveActionSource (PendingRpc-like)', () => {
        it('builds a store per fetch and resolves through `dispatchAsync()`', async () => {
            const req = makeFakeSource<string>();
            const { result } = renderHook(() => useRequestQuery(['source-success'], req.source), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            expect(result.current.data).toBeUndefined();

            await act(async () => req.resolveLatest('value'));
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('surfaces the rejection as `error`', async () => {
            const boom = new Error('boom');
            const req = makeFakeSource<string>();
            const { result } = renderHook(() => useRequestQuery(['source-error'], req.source), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeNull();

            await act(async () => req.rejectLatest(boom));
            await waitFor(() => expect(result.current.error).toBe(boom));
        });

        it('dispatches through `withSignal` so the threaded signal reaches the store', async () => {
            const dispatchAsync = jest.fn(() => Promise.resolve('value'));
            const withSignal = jest.fn((_signal: AbortSignal) => ({ dispatchAsync }));
            const source = stubActionSource<string>({ dispatchAsync, withSignal });
            const { result } = renderHook(() => useRequestQuery(['source-signal'], source), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(result.current.data).toBe('value'));
            expect(withSignal).toHaveBeenCalledTimes(1);
            expect(withSignal.mock.calls[0][0]).toBeInstanceOf(AbortSignal);
        });

        it('surfaces a `getAbortSignal`-driven abort as `result.error`', async () => {
            const req = makeFakeSource<string>();
            const ctrl = new AbortController();
            const { result } = renderHook(
                () => useRequestQuery(['source-user-signal'], req.source, { getAbortSignal: () => ctrl.signal }),
                { wrapper: createWrapper() },
            );
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            expect(result.current.error).toBeNull();

            const reason = new Error('timeout');
            await act(async () => ctrl.abort(reason));
            await waitFor(() => expect(result.current.error).toBe(reason));
        });

        it('does not fire the queryFn while disabled via `enabled: false`', async () => {
            jest.useFakeTimers();
            const req = makeFakeSource<string>();
            const { result } = renderHook(() => useRequestQuery(['source-disabled'], req.source, { enabled: false }), {
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(req.fn).not.toHaveBeenCalled();
            expect(result.current.fetchStatus).toBe('idle');
        });

        it('does not fire the queryFn when the source is null', async () => {
            // A null source maps to `enabled: false`, so the query stays idle. The "fires once the
            // source is set" path is covered by the next test.
            jest.useFakeTimers();
            const initialProps: { source: ReactiveActionSource<string> | null } = { source: null };
            const { result } = renderHook(({ source }) => useRequestQuery(['source-null'], source), {
                initialProps,
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(result.current.fetchStatus).toBe('idle');
            expect(result.current.data).toBeUndefined();
        });

        it('starts firing once the source transitions from null to non-null', async () => {
            const req = makeFakeSource<string>();
            const initialProps: { source: ReactiveActionSource<string> | null } = { source: null };
            const { result, rerender } = renderHook(({ source }) => useRequestQuery(['source-null-to-set'], source), {
                initialProps,
                wrapper: createWrapper(),
            });
            expect(req.fn).not.toHaveBeenCalled();

            rerender({ source: req.source });
            await waitFor(() => expect(req.fn).toHaveBeenCalledTimes(1));
            await act(async () => req.resolveLatest('value'));
            await waitFor(() => expect(result.current.data).toBe('value'));
        });

        it('uses the latest source when `refetch()` is called', async () => {
            const sourceFor = (value: string): ReactiveActionSource<string> => ({
                reactiveStore: () => createReactiveActionStore<[], string>(() => Promise.resolve(value)),
            });
            const { result, rerender } = renderHook(
                ({ source }: { source: ReactiveActionSource<string> }) => useRequestQuery(['source-latest'], source),
                { initialProps: { source: sourceFor('a') }, wrapper: createWrapper() },
            );
            await waitFor(() => expect(result.current.data).toBe('a'));

            // Source identity changes but the key is stable — TanStack doesn't auto-refetch.
            rerender({ source: sourceFor('b') });

            // `refetch()` re-fires; the ref-sync picks up the latest source.
            await act(async () => {
                await result.current.refetch();
            });
            await waitFor(() => expect(result.current.data).toBe('b'));
        });
    });

    describe('SSR', () => {
        it('renders without firing the queryFn', () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => Promise.resolve('never'));
            function Component() {
                const { data } = useRequestQuery(['ssr'], fn);
                return <p>{data ?? 'no-data'}</p>;
            }
            const html = renderToString(
                <QueryClientProvider client={new QueryClient()}>
                    <Component />
                </QueryClientProvider>,
            );
            expect(html).toBe('<p>no-data</p>');
            // TanStack fires the queryFn inside an effect — on the server, effects don't run.
            expect(fn).not.toHaveBeenCalled();
        });
    });
});

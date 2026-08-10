import { type ReactiveState, type ReactiveStreamSource, type ReactiveStreamStore } from '@solana/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { render, renderHook } from '../../__test-utils__/render';
import { useSubscriptionQuery } from '../useSubscriptionQuery';

// A fresh `QueryClient` per render so cache state never leaks between tests. `gcTime` defaults to 0
// so an unmounted query is collected immediately; the focus/reconnect refetch triggers are off so
// the test environment doesn't accidentally re-fire queries during assertions.
function createWrapper(gcTime = 0) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                gcTime,
                refetchOnReconnect: false,
                refetchOnWindowFocus: false,
                retry: false,
            },
        },
    });
    return function wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

// A controllable push-based async iterable: values pushed before a pull are buffered, and `fail`
// makes the iterator throw. Used to stand in for an arbitrary `(signal) => AsyncIterable<T>` source.
function makePushStream<T>() {
    const buffer: T[] = [];
    let failure: { readonly error: unknown } | undefined;
    let ended = false;
    let waiter: PromiseWithResolvers<void> | undefined;
    const wake = () => waiter?.resolve();
    return {
        end() {
            ended = true;
            wake();
        },
        fail(error: unknown) {
            failure = { error };
            wake();
        },
        iterable: {
            async *[Symbol.asyncIterator]() {
                while (true) {
                    while (buffer.length) yield buffer.shift()!;
                    if (failure) throw failure.error;
                    if (ended) return;
                    waiter = Promise.withResolvers<void>();
                    await waiter.promise;
                }
            },
        } as AsyncIterable<T>,
        push(value: T) {
            buffer.push(value);
            wake();
        },
    };
}

// Wraps `makePushStream` in a `jest.fn` factory that mints a fresh stream per invocation (so a
// StrictMode double-mount's discarded stream never steals values from the live one) and records the
// latest stream + signal for the test to drive.
function makeStreamFactory<T>() {
    let latest: ReturnType<typeof makePushStream<T>> | undefined;
    let latestSignal: AbortSignal | undefined;
    const factory = jest.fn((signal: AbortSignal): AsyncIterable<T> => {
        const stream = makePushStream<T>();
        latest = stream;
        latestSignal = signal;
        // End the stream when its signal aborts so a discarded iterator tears down cleanly.
        signal.addEventListener('abort', () => stream.end(), { once: true });
        return stream.iterable;
    });
    return {
        factory,
        fail: (error: unknown) => latest!.fail(error),
        push: (value: T) => latest!.push(value),
        signal: () => latestSignal,
    };
}

function createFakeStore<T>(): {
    connectCount: () => number;
    emit: (state: ReactiveState<T>) => void;
    resetCount: () => number;
    store: ReactiveStreamStore<T>;
    withSignalArg: () => AbortSignal | undefined;
} {
    let state: ReactiveState<T> = { data: undefined, error: undefined, status: 'idle' };
    const listeners = new Set<() => void>();
    let connects = 0;
    let resets = 0;
    let withSignalArg: AbortSignal | undefined;
    const store: ReactiveStreamStore<T> = {
        connect: jest.fn().mockImplementation(() => {
            throw new Error('not implemented');
        }),
        getState: () => state,
        reset: () => {
            resets++;
        },
        subscribe: (callback: () => void) => {
            listeners.add(callback);
            return () => {
                listeners.delete(callback);
            };
        },
        withSignal: (signal: AbortSignal) => {
            withSignalArg = signal;
            return {
                connect: () => {
                    connects++;
                },
            };
        },
    };
    return {
        connectCount: () => connects,
        emit: (next: ReactiveState<T>) => {
            state = next;
            listeners.forEach(l => l());
        },
        resetCount: () => resets,
        store,
        withSignalArg: () => withSignalArg,
    };
}

// Mints a fresh fake store per `reactiveStore()` call (mirroring the real one-store-per-connect
// model) and exposes the latest store so the test can emit into the live subscription.
function makeStoreSource<T>() {
    let latest: ReturnType<typeof createFakeStore<T>> | undefined;
    const source: ReactiveStreamSource<T> = {
        reactiveStore() {
            latest = createFakeStore<T>();
            return latest.store;
        },
    };
    return {
        emit: (state: ReactiveState<T>) => latest!.emit(state),
        resetCount: () => latest!.resetCount(),
        source,
        withSignalArg: () => latest!.withSignalArg(),
    };
}

describe('useSubscriptionQuery', () => {
    // The "never fires" tests opt into fake timers so the negative assertion can flush async
    // scheduling exhaustively via `jest.runAllTimersAsync()` rather than relying on a fixed number
    // of microtask ticks. Reset to real timers after each test so the `waitFor`-driven tests in the
    // sibling describes aren't left on fake timers.
    afterEach(() => {
        jest.useRealTimers();
    });

    describe('with a function (AsyncIterable) source', () => {
        it('flows each notification through to `data`', async () => {
            const f = makeStreamFactory<number>();
            const { result } = renderHook(() => useSubscriptionQuery(['fn-flow'], f.factory), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());

            await act(async () => f.push(1));
            await waitFor(() => expect(result.current.data).toBe(1));

            await act(async () => f.push(2));
            await waitFor(() => expect(result.current.data).toBe(2));
            expect(result.current.error).toBeNull();
        });

        it('surfaces the notification verbatim without unwrapping the envelope', async () => {
            const notification = { context: { slot: 7n }, value: { lamports: 5n } };
            const f = makeStreamFactory<typeof notification>();
            const { result } = renderHook(() => useSubscriptionQuery(['fn-raw'], f.factory), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());

            await act(async () => f.push(notification));
            // `data` is the raw notification object (identity), not `notification.value`.
            await waitFor(() => expect(result.current.data).toBe(notification));
        });

        it('surfaces an error thrown by the iterable', async () => {
            const boom = new Error('boom');
            const f = makeStreamFactory<number>();
            const { result } = renderHook(() => useSubscriptionQuery(['fn-error'], f.factory), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());

            await act(async () => f.fail(boom));
            await waitFor(() => expect(result.current.error).toBe(boom));
        });

        it('threads an `AbortSignal` into the factory', async () => {
            const f = makeStreamFactory<number>();
            renderHook(() => useSubscriptionQuery(['fn-signal'], f.factory), { wrapper: createWrapper() });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());
            const signal = f.signal();
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal!.aborted).toBe(false);
        });

        it('combines a `getAbortSignal`-supplied signal so aborting it aborts the threaded signal', async () => {
            const f = makeStreamFactory<number>();
            const ctrl = new AbortController();
            const getAbortSignal = jest.fn(() => ctrl.signal);
            renderHook(() => useSubscriptionQuery(['fn-user-signal'], f.factory, { getAbortSignal }), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());
            expect(getAbortSignal).toHaveBeenCalled();
            const signal = f.signal()!;
            expect(signal.aborted).toBe(false);

            await act(async () => ctrl.abort());
            await waitFor(() => expect(signal.aborted).toBe(true));
        });

        it('does not fire when the source is null', async () => {
            // A null source maps to `enabled: false`, so the query stays idle and never opens a
            // stream. The "fires once a non-null source is supplied" path is covered by the tests
            // above that pass a factory directly.
            jest.useFakeTimers();
            const initialProps: { source: ((signal: AbortSignal) => AsyncIterable<number>) | null } = {
                source: null,
            };
            const { result } = renderHook(({ source }) => useSubscriptionQuery(['fn-null'], source), {
                initialProps,
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(result.current.fetchStatus).toBe('idle');
            expect(result.current.data).toBeUndefined();
        });

        it('reconnects via `refetch()`, re-invoking the factory', async () => {
            const f = makeStreamFactory<number>();
            const { result } = renderHook(() => useSubscriptionQuery(['fn-refetch'], f.factory), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());
            await act(async () => f.push(1));
            await waitFor(() => expect(result.current.data).toBe(1));

            const callsBefore = f.factory.mock.calls.length;
            // Don't await `refetch()`: a streamedQuery never settles, so its promise never resolves.
            // Firing it cancels the running stream (aborting the old signal) and opens a fresh one.
            await act(async () => {
                void result.current.refetch();
                await Promise.resolve();
            });
            await waitFor(() => expect(f.factory.mock.calls.length).toBeGreaterThan(callsBefore));

            // The fresh connection keeps flowing notifications.
            await act(async () => f.push(2));
            await waitFor(() => expect(result.current.data).toBe(2));
        });

        // Rendered through a component (not `renderHook`) and asserted against the DOM. On the
        // error → refetch → reconnect path the final success render commits via the streamedQuery's
        // async generator, outside the triggering `act`; `renderHook`'s `result.current` is set in a
        // passive effect that doesn't flush there, so it reads stale even though the query state is
        // correct. A DOM assertion reflects the actual committed render — the consumer-facing value —
        // and `findByText` polling drives the commit deterministically.
        it('reconnects via `refetch()` after an error, clearing the error on the next notification', async () => {
            const boom = new Error('boom');
            const f = makeStreamFactory<number>();
            // Trigger `refetch` from a button rather than capturing it during render (which the
            // react-hooks lint forbids). Don't await the click handler: a streamedQuery never
            // settles, so `refetch()`'s promise never resolves.
            function Probe() {
                const query = useSubscriptionQuery(['fn-refetch-after-error'], f.factory);
                return (
                    <div>
                        <button
                            onClick={() => {
                                void query.refetch();
                            }}
                        >
                            refetch
                        </button>
                        data:{query.data ?? 'none'} err:{(query.error as Error | null)?.message ?? 'none'}
                    </div>
                );
            }
            render(<Probe />, { wrapper: createWrapper() });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());

            // Error the stream; the query surfaces the error and the old store is torn down.
            await act(async () => f.fail(boom));
            await screen.findByText('data:none err:boom');

            // Refetch reconnects from the error state, re-invoking the factory on a fresh stream.
            const callsBefore = f.factory.mock.calls.length;
            await act(async () => {
                screen.getByRole('button').click();
                await Promise.resolve();
            });
            await waitFor(() => expect(f.factory.mock.calls.length).toBeGreaterThan(callsBefore));

            // The first notification on the reconnected stream populates `data` and clears `error`.
            await act(async () => f.push(1));
            await screen.findByText('data:1 err:none');
        });
    });

    describe('with a ReactiveStreamSource', () => {
        it('connects the store bound to a signal and flows notifications through to `data`', async () => {
            const src = makeStoreSource<number>();
            const { result } = renderHook(() => useSubscriptionQuery(['store-flow'], src.source), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(src.withSignalArg()).toBeInstanceOf(AbortSignal));

            await act(async () => src.emit({ data: 9, error: undefined, status: 'loaded' }));
            await waitFor(() => expect(result.current.data).toBe(9));
        });

        it('surfaces a store error', async () => {
            const boom = new Error('store-boom');
            const src = makeStoreSource<number>();
            const { result } = renderHook(() => useSubscriptionQuery(['store-error'], src.source), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(src.withSignalArg()).toBeInstanceOf(AbortSignal));

            await act(async () => src.emit({ data: undefined, error: boom, status: 'error' }));
            await waitFor(() => expect(result.current.error).toBe(boom));
        });

        it('resets the store on unmount', async () => {
            const src = makeStoreSource<number>();
            const { unmount } = renderHook(() => useSubscriptionQuery(['store-teardown'], src.source), {
                wrapper: createWrapper(),
            });
            await waitFor(() => expect(src.withSignalArg()).toBeInstanceOf(AbortSignal));

            unmount();
            await waitFor(() => expect(src.resetCount()).toBeGreaterThan(0));
        });

        it('does not connect when the source is null', async () => {
            // A null source maps to `enabled: false`, so the query stays idle and never connects a
            // store.
            jest.useFakeTimers();
            const initialProps: { source: ReactiveStreamSource<number> | null } = { source: null };
            const { result } = renderHook(({ source }) => useSubscriptionQuery(['store-null'], source), {
                initialProps,
                wrapper: createWrapper(),
            });
            await act(async () => {
                await jest.runAllTimersAsync();
            });
            expect(result.current.fetchStatus).toBe('idle');
            expect(result.current.data).toBeUndefined();
        });
    });

    describe('teardown timing', () => {
        it('aborts the stream signal on unmount even when gcTime has not elapsed', async () => {
            // Regression pin for `experimental_streamedQuery`'s teardown: TanStack cancels the
            // in-flight stream the instant the last observer unmounts — independent of `gcTime`
            // (which governs cache eviction, not fetch cancellation). With `gcTime: Infinity` the
            // cache entry is never collected, yet the signal must still abort promptly so the socket
            // closes. This behavior backs the `experimental_` API; pin it so a TanStack bump can't
            // regress it silently.
            const f = makeStreamFactory<number>();
            const { unmount } = renderHook(() => useSubscriptionQuery(['teardown-timing'], f.factory), {
                wrapper: createWrapper(Infinity),
            });
            await waitFor(() => expect(f.factory).toHaveBeenCalled());
            const signal = f.signal()!;
            expect(signal.aborted).toBe(false);

            unmount();
            await waitFor(() => expect(signal.aborted).toBe(true));
        });
    });

    describe('SSR', () => {
        it('renders without firing the stream', () => {
            const f = makeStreamFactory<number>();
            function Component() {
                const { data } = useSubscriptionQuery(['ssr'], f.factory);
                return <p>{data ?? 'no-data'}</p>;
            }
            const html = renderToString(
                <QueryClientProvider client={new QueryClient()}>
                    <Component />
                </QueryClientProvider>,
            );
            expect(html).toBe('<p>no-data</p>');
            // On the server, no observer subscribes during renderToString, so TanStack never
            // schedules the queryFn.
            expect(f.factory).not.toHaveBeenCalled();
        });
    });
});

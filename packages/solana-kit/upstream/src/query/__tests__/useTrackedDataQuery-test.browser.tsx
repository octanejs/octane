import {
    createReactiveActionStore,
    createReactiveStoreFromDataPublisherFactory,
    isSolanaError,
    ReactiveActionSource,
    ReactiveStreamSource,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
    SolanaRpcResponse,
} from '@solana/kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { renderHook } from '../../__test-utils__/render';
import { TrackedDataSpec } from '../../useTrackedData';
import { useTrackedDataQuery } from '../useTrackedDataQuery';

// A fresh `QueryClient` per wrapper so cache state never leaks between tests, with the focus /
// reconnect refetch triggers off so the test environment never re-fires queries mid-assertion.
function makeWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { gcTime: 0, refetchOnReconnect: false, refetchOnWindowFocus: false, retry: false },
        },
    });
    return function wrapper({ children }: { children: React.ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    };
}

type TestValue = { count: number };

function rpcResponse(slot: number, value: TestValue): SolanaRpcResponse<TestValue> {
    return { context: { slot: BigInt(slot) }, value };
}

// Backs `initialValueSource` with a real `ReactiveActionStore`. `resolve`/`reject` latch their
// outcome and apply it to every dispatch — past and future — so value delivery is independent of
// StrictMode's mount → cleanup → mount cycle (which re-dispatches against a fresh store).
function createMockInitialValueSource(): {
    fn: jest.Mock;
    reject(error: unknown): void;
    resolve(response: SolanaRpcResponse<TestValue>): void;
    source: ReactiveActionSource<SolanaRpcResponse<TestValue>>;
} {
    type Settled = { error: unknown; type: 'reject' } | { response: SolanaRpcResponse<TestValue>; type: 'resolve' };
    let settled: Settled | undefined;
    const pending: { reject(error: unknown): void; resolve(response: SolanaRpcResponse<TestValue>): void }[] = [];
    const fn = jest.fn().mockImplementation(() => {
        const { promise, resolve, reject } = Promise.withResolvers<SolanaRpcResponse<TestValue>>();
        if (settled?.type === 'resolve') resolve(settled.response);
        else if (settled?.type === 'reject') reject(settled.error);
        else pending.push({ reject, resolve });
        return promise;
    });
    return {
        fn,
        reject(error) {
            settled = { error, type: 'reject' };
            pending.splice(0).forEach(p => p.reject(error));
        },
        resolve(response) {
            settled = { response, type: 'resolve' };
            pending.splice(0).forEach(p => p.resolve(response));
        },
        source: { reactiveStore: () => createReactiveActionStore(fn) },
    };
}

// Backs `streamSource` with a real `ReactiveStreamStore` built from a mock `DataPublisher` factory.
// Delivered notifications are logged and replayed to any publisher that subscribes later, so values
// reach whichever connection survives StrictMode's remount. Tracks the net number of active
// (non-aborted) connections.
function createMockStreamSource(): {
    activeConnections: () => number;
    createDataPublisher: jest.Mock;
    error(err: unknown): void;
    pushNotification(notification: SolanaRpcResponse<TestValue>): void;
    source: ReactiveStreamSource<SolanaRpcResponse<TestValue>>;
} {
    let activeCount = 0;
    const listeners: { channel: string; listener: (payload: unknown) => void; options?: { signal?: AbortSignal } }[] =
        [];
    const log: { channel: string; payload: unknown }[] = [];
    const createDataPublisher = jest.fn().mockImplementation(() => {
        activeCount++;
        let cleanedUp = false;
        const cleanup = () => {
            if (!cleanedUp) {
                cleanedUp = true;
                activeCount--;
            }
        };
        return Promise.resolve({
            on(channel: string, listener: (payload: unknown) => void, options?: { signal?: AbortSignal }) {
                const entry = { channel, listener, options };
                listeners.push(entry);
                options?.signal?.addEventListener('abort', cleanup, { once: true });
                log.filter(e => e.channel === channel).forEach(e => {
                    if (!options?.signal?.aborted) listener(e.payload);
                });
                return () => {
                    const idx = listeners.indexOf(entry);
                    if (idx !== -1) listeners.splice(idx, 1);
                };
            },
        });
    });
    const deliver = (channel: string, payload: unknown) => {
        log.push({ channel, payload });
        listeners.filter(l => l.channel === channel && !l.options?.signal?.aborted).forEach(l => l.listener(payload));
    };
    return {
        activeConnections: () => activeCount,
        createDataPublisher,
        error: err => deliver('error', err),
        pushNotification: notification => deliver('data', notification),
        source: {
            reactiveStore: () =>
                createReactiveStoreFromDataPublisherFactory<SolanaRpcResponse<TestValue>>({
                    createDataPublisher,
                    dataChannelName: 'data',
                    errorChannelName: 'error',
                }),
        },
    };
}

type Spec = TrackedDataSpec<TestValue, TestValue, number>;
function makeSpec(): {
    activeConnections: () => number;
    error: (err: unknown) => void;
    pushNotification: (notification: SolanaRpcResponse<TestValue>) => void;
    rejectRpc: (error: unknown) => void;
    resolveRpc: (response: SolanaRpcResponse<TestValue>) => void;
    rpcSendCalls: () => number;
    spec: Spec;
    subscribeCalls: () => number;
} {
    const initialValue = createMockInitialValueSource();
    const stream = createMockStreamSource();
    return {
        activeConnections: stream.activeConnections,
        error: stream.error,
        pushNotification: stream.pushNotification,
        rejectRpc: initialValue.reject,
        resolveRpc: initialValue.resolve,
        rpcSendCalls: () => initialValue.fn.mock.calls.length,
        spec: {
            initialValueMapper: v => v.count,
            initialValueSource: initialValue.source,
            streamSource: stream.source,
            streamValueMapper: v => v.count,
        },
        subscribeCalls: () => stream.createDataPublisher.mock.calls.length,
    };
}

describe('useTrackedDataQuery', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    it('surfaces the initial RPC value as the `SolanaRpcResponse` envelope', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery(['balance'], fake.spec), { wrapper: makeWrapper() });
        expect(result.current.data).toBeUndefined();

        await act(async () => fake.resolveRpc(rpcResponse(100, { count: 42 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 42 }));
    });

    it('promotes a newer subscription notification over the initial RPC', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery(['promote'], fake.spec), { wrapper: makeWrapper() });

        await act(async () => fake.resolveRpc(rpcResponse(100, { count: 1 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }));

        await act(async () => fake.pushNotification(rpcResponse(200, { count: 2 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 2 }));
        expect(result.current.error).toBeNull();
    });

    it('surfaces a rejected initial RPC as result.error', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery(['rpc-error'], fake.spec), { wrapper: makeWrapper() });

        const boom = new Error('rpc failed');
        await act(async () => fake.rejectRpc(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
    });

    it('surfaces a subscription error as result.error', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery(['sub-error'], fake.spec), { wrapper: makeWrapper() });

        const boom = new Error('subscription failed');
        await act(async () => fake.error(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
    });

    it('surfaces a nullish subscription error as a sentinel error', async () => {
        // A store can reach `status: 'error'` with a nullish error (e.g. `controller.abort(null)` or
        // a publisher emitting `undefined` on its error channel). The bridge substitutes a sentinel
        // so the failure surfaces as `error` rather than being read as a value-less success.
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery(['nullish-error'], fake.spec), {
            wrapper: makeWrapper(),
        });

        await act(async () => fake.error(undefined));
        await waitFor(() =>
            expect(isSolanaError(result.current.error, SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR)).toBe(
                true,
            ),
        );
    });

    it('drops a stale subscription notification with a slot older than the current value', async () => {
        // Fake timers so the negative ("the stale value did not displace the current one") can be
        // asserted after `runAllTimersAsync()` has drained every scheduled microtask and timer — if
        // the stale value were going to land, it would have by then.
        jest.useFakeTimers();
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery(['stale-slot'], fake.spec), {
            wrapper: makeWrapper(),
        });

        await act(async () => {
            fake.resolveRpc(rpcResponse(200, { count: 99 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 99 });

        // Older slot — the store drops it in its slot-floor gate (no value is yielded), so even after
        // the delivery fully settles the UI must still hold the newer value.
        await act(async () => {
            fake.pushNotification(rpcResponse(150, { count: 7 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 99 });
    });

    it('does not fire when the spec is null', async () => {
        // A null spec maps to `enabled: false`, so the query stays idle and never fires the RPC.
        // Fake timers let the negative assertion flush async scheduling exhaustively before checking
        // that nothing was scheduled.
        jest.useFakeTimers();
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataQuery<TestValue, TestValue, number>(['no-spec'], null), {
            wrapper: makeWrapper(),
        });
        await act(async () => {
            await jest.runAllTimersAsync();
        });
        expect(result.current.fetchStatus).toBe('idle');
        expect(result.current.data).toBeUndefined();
        expect(fake.rpcSendCalls()).toBe(0);
    });

    it('starts when the spec transitions from null to a real spec', async () => {
        // Fake timers so the head assertion ("disabled while null, the RPC never fires") can flush
        // exhaustively; the same exhaustive flush then drives the post-transition value to the cache.
        jest.useFakeTimers();
        const fake = makeSpec();
        const initialProps: { spec: Spec | null } = { spec: null };
        const { result, rerender } = renderHook(({ spec }) => useTrackedDataQuery(['spec-set'], spec), {
            initialProps,
            wrapper: makeWrapper(),
        });
        // Disabled while the spec is null, so the RPC never fires.
        await act(async () => {
            await jest.runAllTimersAsync();
        });
        expect(fake.rpcSendCalls()).toBe(0);

        rerender({ spec: fake.spec });
        await act(async () => {
            fake.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 });
    });

    it('shares one active underlying store across components with the same key', async () => {
        const fake = makeSpec();
        renderHook(
            () => [useTrackedDataQuery(['shared'], fake.spec), useTrackedDataQuery(['shared'], fake.spec)] as const,
            { wrapper: makeWrapper() },
        );
        await waitFor(() => expect(fake.activeConnections()).toBe(1));
    });

    it('resets the store and aborts the connection on unmount', async () => {
        const fake = makeSpec();
        const { unmount } = renderHook(() => useTrackedDataQuery(['teardown'], fake.spec), { wrapper: makeWrapper() });
        await waitFor(() => expect(fake.activeConnections()).toBe(1));

        unmount();
        await waitFor(() => expect(fake.activeConnections()).toBe(0));
    });

    it('combines a `getAbortSignal`-supplied signal so aborting it tears down the connection', async () => {
        const fake = makeSpec();
        const ctrl = new AbortController();
        const getAbortSignal = jest.fn(() => ctrl.signal);
        renderHook(() => useTrackedDataQuery(['user-signal'], fake.spec, { getAbortSignal }), {
            wrapper: makeWrapper(),
        });
        await waitFor(() => expect(fake.activeConnections()).toBe(1));
        expect(getAbortSignal).toHaveBeenCalled();

        await act(async () => ctrl.abort());
        await waitFor(() => expect(fake.activeConnections()).toBe(0));
    });

    it('does not let an older-slot fetch on reconnect regress the warmer cached value', async () => {
        // The TanStack cache outlives the per-attempt store, but the store's slot high-water mark
        // does not — a fresh store (minted on every `refetch()`) starts its window at -1. With
        // `refetchMode: 'append'` the prior envelope stays cached across the reconnect, so a lagging
        // RPC node resolving the new store's initial fetch at an older slot must be refused by the
        // bridge's slot-floor gate (which reads the cached envelope) rather than regressing the value.
        //
        // Fake timers throughout: each step drains to completion via `runAllTimersAsync()`, so the
        // mid-test negative ("the older-slot fetch did not regress the value") is asserted only after
        // everything it could have scheduled has run.
        jest.useFakeTimers();
        const first = makeSpec();
        // A second spec whose RPC node lags behind; the reconnect rebinds the streamFn to it.
        const lagging = makeSpec();
        const initialProps: { spec: Spec } = { spec: first.spec };
        const { result, rerender } = renderHook(({ spec }) => useTrackedDataQuery(['reconnect'], spec), {
            initialProps,
            wrapper: makeWrapper(),
        });
        await act(async () => {
            first.resolveRpc(rpcResponse(200, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 1 });

        // Swapping the spec under a stable key does not itself reconnect (the streamFn reads the spec
        // from a ref); the next `refetch()` picks up the lagging spec.
        rerender({ spec: lagging.spec });
        // Don't await `refetch()`: a streamedQuery never settles, so its promise never resolves.
        await act(async () => {
            void result.current.refetch();
            await jest.runAllTimersAsync();
        });
        expect(lagging.rpcSendCalls()).toBeGreaterThan(0);

        // The older-slot fetch is suppressed; even after it settles the newer cached value stands.
        await act(async () => {
            lagging.resolveRpc(rpcResponse(150, { count: 2 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 1 });

        // A genuinely newer notification on the reconnected stream still flows through.
        await act(async () => {
            lagging.pushNotification(rpcResponse(300, { count: 3 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 300n }, value: 3 });
    });

    describe('SSR', () => {
        it('renders without firing the RPC or subscription', () => {
            const fake = makeSpec();
            function Component() {
                const { data } = useTrackedDataQuery(['ssr'], fake.spec);
                return <p>{data ? 'has-data' : 'no-data'}</p>;
            }
            const html = renderToString(
                <QueryClientProvider client={new QueryClient()}>
                    <Component />
                </QueryClientProvider>,
            );
            expect(html).toBe('<p>no-data</p>');
            // On the server, no observer subscribes during renderToString, so TanStack never
            // schedules the queryFn.
            expect(fake.rpcSendCalls()).toBe(0);
            expect(fake.subscribeCalls()).toBe(0);
        });
    });
});

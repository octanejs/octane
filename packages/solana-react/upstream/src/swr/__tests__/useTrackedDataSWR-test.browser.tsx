import {
    createReactiveActionStore,
    createReactiveStoreFromDataPublisherFactory,
    isSolanaError,
    ReactiveActionSource,
    ReactiveStreamSource,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
    SolanaRpcResponse,
} from '@solana/kit';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SWRConfig } from 'swr';

import { renderHook } from '../../__test-utils__/render';
import { TrackedDataSpec } from '../../useTrackedData';
import { useTrackedDataSWR } from '../useTrackedDataSWR';

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

// A wrapper whose SWR cache provider is a single shared `Map`, so cache entries survive an
// unmount and are visible to a later remount under the same key.
function makePersistentWrapper() {
    const cache = new Map();
    return function PersistentWrapper({ children }: { children: React.ReactNode }) {
        return (
            <SWRConfig
                value={{
                    errorRetryCount: 0,
                    provider: () => cache,
                    revalidateOnFocus: false,
                    revalidateOnReconnect: false,
                }}
            >
                {children}
            </SWRConfig>
        );
    };
}

type TestValue = { count: number };

function rpcResponse(slot: number, value: TestValue): SolanaRpcResponse<TestValue> {
    return { context: { slot: BigInt(slot) }, value };
}

// Backs `initialValueSource` with a real `ReactiveActionStore`. `resolve`/`reject` latch their
// outcome and apply it to every dispatch — past and future. That makes value delivery independent
// of StrictMode's mount → cleanup → mount cycle (which re-dispatches against a fresh store): no
// matter which dispatch SWR ends up bound to, it settles to the latched outcome.
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
// Delivered notifications are logged and replayed to any publisher that subscribes later, so — like
// the initial-value mock — values reach whichever connection survives StrictMode's remount. Tracks
// the net number of active (non-aborted) connections.
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

async function waitToSettle() {
    await act(async () => {
        await Promise.resolve();
    });
}

// Run a synchronous mock trigger inside `act` and flush the microtask on which the store schedules
// its resulting state update, so the `next()` call lands while wrapped in `act`.
async function drive(trigger: () => void) {
    await act(async () => {
        trigger();
        await Promise.resolve();
    });
}

describe('useTrackedDataSWR', () => {
    it('surfaces the initial RPC value as the `SolanaRpcResponse` envelope', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['balance'], fake.spec), { wrapper });
        expect(result.current.data).toBeUndefined();

        await drive(() => fake.resolveRpc(rpcResponse(100, { count: 42 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 42 }));
    });

    it('promotes a newer subscription notification over the initial RPC', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['promote'], fake.spec), { wrapper });
        expect(result.current.data).toBeUndefined();

        await drive(() => fake.resolveRpc(rpcResponse(100, { count: 1 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }));

        await drive(() => fake.pushNotification(rpcResponse(200, { count: 2 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 2 }));
    });

    it('surfaces a rejected initial RPC as result.error', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['rpc-error'], fake.spec), { wrapper });
        expect(result.current.error).toBeUndefined();

        const boom = new Error('rpc failed');
        await drive(() => fake.rejectRpc(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
    });

    it('surfaces a subscription error as result.error', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['sub-error'], fake.spec), { wrapper });
        expect(result.current.error).toBeUndefined();

        const boom = new Error('subscription failed');
        await drive(() => fake.error(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
    });

    it('surfaces a nullish subscription error as a sentinel error instead of clearing data', async () => {
        // SWR's `next` treats a nullish error as a *success* update (it clears the error and mutates
        // `data` to `undefined`). A store can reach `status: 'error'` with a nullish error — e.g. a
        // third-party publisher emitting `undefined` on its error channel, or `controller.abort(null)`.
        // The hook must substitute a sentinel so the failure surfaces and the retained data survives.
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['nullish-sub-error'], fake.spec), { wrapper });
        // Read both fields up front so SWR's `stateDependencies` tracking subscribes the component
        // to subsequent `data` and `error` changes.
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();

        await drive(() => fake.resolveRpc(rpcResponse(100, { count: 42 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 42 }));

        await drive(() => fake.error(undefined));
        await waitFor(() =>
            expect(isSolanaError(result.current.error, SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR)).toBe(
                true,
            ),
        );
        // The retained envelope is preserved rather than wiped to `undefined`.
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 42 });
    });

    it('skips when the key is null', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(null, fake.spec), { wrapper });
        await waitToSettle();
        expect(result.current.data).toBeUndefined();
        expect(fake.rpcSendCalls()).toBe(0);
    });

    it('skips when the spec is null (even if the key is non-null)', async () => {
        const { result } = renderHook(() => useTrackedDataSWR<TestValue, TestValue, number>(['no-spec'], null), {
            wrapper,
        });
        await waitToSettle();
        expect(result.current.data).toBeUndefined();
    });

    it('starts when the spec transitions from null to a real spec', async () => {
        const fake = makeSpec();
        const initialProps: { spec: Spec | null } = { spec: null };
        const { result, rerender } = renderHook(({ spec }) => useTrackedDataSWR(['spec-set'], spec), {
            initialProps,
            wrapper,
        });
        await waitToSettle();
        expect(fake.rpcSendCalls()).toBe(0);
        expect(result.current.data).toBeUndefined();

        rerender({ spec: fake.spec });
        await drive(() => fake.resolveRpc(rpcResponse(100, { count: 1 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }));
    });

    it('tears down the subscription when the spec transitions to null', async () => {
        const fake = makeSpec();
        let spec: Spec | null = fake.spec;
        const { rerender } = renderHook(() => useTrackedDataSWR(['spec-null'], spec), { wrapper });
        await waitFor(() => expect(fake.activeConnections()).toBe(1));

        spec = null;
        rerender();
        await waitFor(() => expect(fake.activeConnections()).toBe(0));
    });

    it('tears down the old store and opens a new one when the key changes', async () => {
        const fake = makeSpec();
        let key = 'a';
        const { rerender } = renderHook(() => useTrackedDataSWR([key], fake.spec), { wrapper });
        await waitFor(() => expect(fake.activeConnections()).toBe(1));
        const sendsBeforeKeyChange = fake.rpcSendCalls();

        key = 'b';
        rerender();
        await waitFor(() => expect(fake.rpcSendCalls()).toBeGreaterThan(sendsBeforeKeyChange));
        await waitFor(() => expect(fake.activeConnections()).toBe(1));
    });

    it('shares one active underlying store across components with the same key', async () => {
        const fake = makeSpec();
        renderHook(
            () => [useTrackedDataSWR(['shared'], fake.spec), useTrackedDataSWR(['shared'], fake.spec)] as const,
            { wrapper },
        );
        await waitFor(() => expect(fake.activeConnections()).toBe(1));
    });

    it('drops a stale subscription notification with a slot older than the current value', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['stale-slot'], fake.spec), { wrapper });
        expect(result.current.data).toBeUndefined();

        await drive(() => fake.resolveRpc(rpcResponse(200, { count: 99 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 99 }));

        // Older slot — the underlying store ignores it; the UI keeps the newer value.
        await drive(() => fake.pushNotification(rpcResponse(150, { count: 7 })));
        await waitToSettle();
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 99 });
    });

    it('surfaces a later subscription error while retaining the loaded value', async () => {
        const fake = makeSpec();
        const { result } = renderHook(() => useTrackedDataSWR(['data-on-error'], fake.spec), { wrapper });
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();

        await drive(() => fake.resolveRpc(rpcResponse(100, { count: 7 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 7 }));

        const boom = new Error('subscription failed after load');
        await drive(() => fake.error(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
        // The prior value is retained alongside the surfaced error.
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 7 });
    });

    it('opens the store when the key transitions from null to non-null', async () => {
        const fake = makeSpec();
        const initialProps: { key: string | null } = { key: null };
        const { result, rerender } = renderHook(
            ({ key }) => useTrackedDataSWR(key == null ? null : ['key-set', key], fake.spec),
            { initialProps, wrapper },
        );
        await waitToSettle();
        expect(fake.rpcSendCalls()).toBe(0);
        expect(result.current.data).toBeUndefined();

        rerender({ key: 'ready' });
        await drive(() => fake.resolveRpc(rpcResponse(100, { count: 1 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }));
    });

    it('keeps the current store when the spec identity changes but the key is stable', async () => {
        // SWR keys the cache on the SWR key, and `subscribe` reads the latest spec from a ref — so a
        // new spec object under a stable key must NOT rebuild the store or re-fire the sources. This
        // mirrors `useSubscriptionSWR`'s "source changes but key is stable" guarantee.
        const a = makeSpec();
        const b = makeSpec();
        let spec = a.spec;
        const { result, rerender } = renderHook(() => useTrackedDataSWR(['stable-key'], spec), { wrapper });
        expect(result.current.data).toBeUndefined();
        await drive(() => a.resolveRpc(rpcResponse(100, { count: 1 })));
        await waitFor(() => expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }));

        spec = b.spec;
        rerender();
        await waitToSettle();
        // The new spec's sources never fire, and the original connection stays live.
        expect(b.rpcSendCalls()).toBe(0);
        expect(b.subscribeCalls()).toBe(0);
        expect(a.activeConnections()).toBe(1);
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 });
    });

    it('does not let an older-slot fetch on remount regress the warmer cached value', async () => {
        // SWR's cache outlives the per-subscription store, but the store's slot high-water mark
        // does not — a fresh store starts its window at -1. On a remount with a warm cache, a
        // lagging RPC node can resolve the initial fetch at an older slot than the one already
        // cached; that must not overwrite the newer cached envelope.
        const PersistentWrapper = makePersistentWrapper();

        const first = makeSpec();
        const mountA = renderHook(() => useTrackedDataSWR(['remount'], first.spec), { wrapper: PersistentWrapper });
        expect(mountA.result.current.data).toBeUndefined();
        await drive(() => first.resolveRpc(rpcResponse(200, { count: 1 })));
        await waitFor(() => expect(mountA.result.current.data).toStrictEqual({ context: { slot: 200n }, value: 1 }));
        mountA.unmount();

        // Remount under the same key with a fresh spec whose RPC node lags behind.
        const second = makeSpec();
        const mountB = renderHook(() => useTrackedDataSWR(['remount'], second.spec), { wrapper: PersistentWrapper });
        // The remount paints immediately from the warm cache.
        expect(mountB.result.current.data).toStrictEqual({ context: { slot: 200n }, value: 1 });

        await drive(() => second.resolveRpc(rpcResponse(150, { count: 2 })));
        await waitToSettle();
        // The older-slot fetch is suppressed; the newer cached value stands.
        expect(mountB.result.current.data).toStrictEqual({ context: { slot: 200n }, value: 1 });

        // A genuinely newer notification still flows through.
        await drive(() => second.pushNotification(rpcResponse(300, { count: 3 })));
        await waitFor(() => expect(mountB.result.current.data).toStrictEqual({ context: { slot: 300n }, value: 3 }));
    });

    describe('SSR', () => {
        it('renders without firing the RPC or subscription', () => {
            const fake = makeSpec();
            function Component() {
                const { data } = useTrackedDataSWR(['ssr'], fake.spec);
                return <p>{data ? 'has-data' : 'no-data'}</p>;
            }
            const html = renderToString(
                <SWRConfig value={{ provider: () => new Map() }}>
                    <Component />
                </SWRConfig>,
            );
            expect(html).toBe('<p>no-data</p>');
            expect(fake.rpcSendCalls()).toBe(0);
            expect(fake.subscribeCalls()).toBe(0);
        });
    });
});

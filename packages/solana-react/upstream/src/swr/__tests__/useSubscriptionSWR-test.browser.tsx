import {
    createReactiveStoreFromDataPublisherFactory,
    DataPublisher,
    isSolanaError,
    ReactiveStreamSource,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
    SolanaRpcResponse,
} from '@solana/kit';
import { act, waitFor } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SWRConfig } from 'swr';

import { renderHook } from '../../__test-utils__/render';
import { useSubscriptionSWR } from '../useSubscriptionSWR';

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

function makeFakeSubscription<T>(): {
    activeConnections: () => number;
    dataListenerCount: () => number;
    publish: (notification: T) => Promise<void>;
    publishError: (err: unknown) => Promise<void>;
    publishersCreated: () => number;
    source: ReactiveStreamSource<T>;
} {
    type Listener = (payload: unknown) => void;
    let dataListeners: Listener[] = [];
    let errorListeners: Listener[] = [];
    let activeCount = 0;
    let createdCount = 0;
    let publisherReady = Promise.withResolvers<void>();
    return {
        activeConnections: () => activeCount,
        dataListenerCount: () => dataListeners.length,
        async publish(notification) {
            await publisherReady.promise;
            dataListeners.forEach(fn => fn(notification));
        },
        async publishError(err) {
            await publisherReady.promise;
            errorListeners.forEach(fn => fn(err));
        },
        publishersCreated: () => createdCount,
        source: {
            reactiveStore() {
                return createReactiveStoreFromDataPublisherFactory<T>({
                    createDataPublisher() {
                        createdCount++;
                        activeCount++;
                        dataListeners = [];
                        errorListeners = [];
                        publisherReady = Promise.withResolvers<void>();
                        let onCallCount = 0;
                        let cleanedUp = false;
                        const cleanup = () => {
                            if (!cleanedUp) {
                                cleanedUp = true;
                                activeCount--;
                            }
                        };
                        const publisher: DataPublisher = {
                            on(channel, listener, options) {
                                const list = channel === 'data' ? dataListeners : errorListeners;
                                list.push(listener);
                                options?.signal.addEventListener(
                                    'abort',
                                    () => {
                                        const idx = list.indexOf(listener);
                                        if (idx !== -1) list.splice(idx, 1);
                                        cleanup();
                                    },
                                    { once: true },
                                );
                                if (++onCallCount === 2) publisherReady.resolve();
                                return () => {
                                    const idx = list.indexOf(listener);
                                    if (idx !== -1) list.splice(idx, 1);
                                };
                            },
                        };
                        return Promise.resolve(publisher);
                    },
                    dataChannelName: 'data',
                    errorChannelName: 'error',
                });
            },
        },
    };
}

async function waitForSubscriptionToSettle() {
    await act(async () => {
        await Promise.resolve();
    });
}

async function waitForActiveSubscription(sub: { activeConnections: () => number; dataListenerCount: () => number }) {
    await waitFor(() => {
        expect(sub.activeConnections()).toBe(1);
        expect(sub.dataListenerCount()).toBeGreaterThan(0);
    });
}

describe('useSubscriptionSWR', () => {
    it('surfaces SolanaRpcResponse envelopes as-is so callers read .value and .context.slot', async () => {
        const sub = makeFakeSubscription<SolanaRpcResponse<{ lamports: bigint }>>();
        const { result } = renderHook(() => useSubscriptionSWR(['account'], sub.source), { wrapper });
        await waitForActiveSubscription(sub);
        expect(result.current.data).toBeUndefined();

        await act(async () => await sub.publish({ context: { slot: 99n }, value: { lamports: 5n } }));
        await waitFor(() =>
            expect(result.current.data).toStrictEqual({ context: { slot: 99n }, value: { lamports: 5n } }),
        );
    });

    it('passes raw notifications through unchanged', async () => {
        const sub = makeFakeSubscription<{ slot: bigint }>();
        const { result } = renderHook(() => useSubscriptionSWR(['slot'], sub.source), { wrapper });
        await waitForActiveSubscription(sub);
        expect(result.current.data).toBeUndefined();

        await act(async () => await sub.publish({ slot: 10n }));
        await waitFor(() => expect(result.current.data).toStrictEqual({ slot: 10n }));
    });

    it('surfaces error-channel publishes as result.error', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const { result } = renderHook(() => useSubscriptionSWR(['err'], sub.source), { wrapper });
        await waitForActiveSubscription(sub);
        expect(result.current.error).toBeUndefined();

        const boom = new Error('boom');
        await act(async () => await sub.publishError(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
    });

    it('surfaces a later error while retaining the last notification', async () => {
        // SWR's `useSWRSubscription` tracks `data` and `error` independently: an error published
        // after a notification surfaces `error` without clearing the retained `data`.
        //
        // The `expect(result.current.error)` read before the failure is load-bearing: SWR only
        // re-renders for fields read during render (its `stateDependencies` tracking), so the `error`
        // field must be observed before the failure for the update to propagate. A component that
        // reads `error` (as the hook's JSDoc example does) gets this for free.
        const sub = makeFakeSubscription<{ value: number }>();
        const { result } = renderHook(() => useSubscriptionSWR(['err-after-data'], sub.source), { wrapper });
        await waitForActiveSubscription(sub);
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();

        await act(async () => await sub.publish({ value: 1 }));
        await waitFor(() => expect(result.current.data).toStrictEqual({ value: 1 }));

        const boom = new Error('boom after load');
        await act(async () => await sub.publishError(boom));
        await waitFor(() => expect(result.current.error).toBe(boom));
        // The prior notification is retained alongside the surfaced error.
        expect(result.current.data).toStrictEqual({ value: 1 });
    });

    it('surfaces a nullish error-channel publish as a sentinel error instead of clearing data', async () => {
        // SWR's `next` treats a nullish error as a *success* update. If our store has
        // `status: 'error'` but the error is nullish, the hook should substitute a
        // sentinel so the failure surfaces.
        const sub = makeFakeSubscription<{ value: number }>();
        const { result } = renderHook(() => useSubscriptionSWR(['nullish-err'], sub.source), { wrapper });
        await waitForActiveSubscription(sub);
        // Read both fields up front so SWR's `stateDependencies` tracking subscribes the component
        // to subsequent `data` and `error` changes (see the "later error" test above).
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBeUndefined();

        await act(async () => await sub.publish({ value: 1 }));
        await waitFor(() => expect(result.current.data).toStrictEqual({ value: 1 }));

        await act(async () => await sub.publishError(undefined));
        await waitFor(() =>
            expect(isSolanaError(result.current.error, SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR)).toBe(
                true,
            ),
        );
        // The retained notification is preserved rather than wiped to `undefined`.
        expect(result.current.data).toStrictEqual({ value: 1 });
    });

    it('skips the subscription when the key is null', async () => {
        const reactiveStore = jest.fn();
        const source: ReactiveStreamSource<{ value: number }> = { reactiveStore };
        renderHook(() => useSubscriptionSWR(null, source), { wrapper });
        await waitForSubscriptionToSettle();
        expect(reactiveStore).not.toHaveBeenCalled();
    });

    it('skips the subscription when the source is null (even if the key is non-null)', async () => {
        const { result } = renderHook(() => useSubscriptionSWR<{ value: number }>(['key-set'], null), { wrapper });
        await waitForSubscriptionToSettle();
        expect(result.current.data).toBeUndefined();
    });

    it('opens the subscription when the source transitions from null to a real source', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const initialProps: { source: ReactiveStreamSource<{ value: number }> | null } = { source: null };
        const { result, rerender } = renderHook(({ source }) => useSubscriptionSWR(['source-set'], source), {
            initialProps,
            wrapper,
        });
        await waitForSubscriptionToSettle();
        expect(sub.publishersCreated()).toBe(0);
        expect(result.current.data).toBeUndefined();

        rerender({ source: sub.source });
        await waitForActiveSubscription(sub);
        await act(async () => await sub.publish({ value: 1 }));
        await waitFor(() => expect(result.current.data).toStrictEqual({ value: 1 }));
        expect(sub.activeConnections()).toBe(1);
    });

    it('opens the subscription when the key transitions from null to non-null', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const initialProps: { key: string | null } = { key: null };
        const { rerender } = renderHook(
            ({ key }) => useSubscriptionSWR(key == null ? null : ['key-set', key], sub.source),
            {
                initialProps,
                wrapper,
            },
        );
        await waitForSubscriptionToSettle();
        expect(sub.publishersCreated()).toBe(0);

        rerender({ key: 'ready' });
        await waitForActiveSubscription(sub);
        expect(sub.activeConnections()).toBe(1);
    });

    it('tears down the subscription when the source transitions to null', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        let source: ReactiveStreamSource<{ value: number }> | null = sub.source;
        const { rerender } = renderHook(() => useSubscriptionSWR(['source-null'], source), { wrapper });
        await waitForActiveSubscription(sub);

        source = null;
        rerender();
        await waitFor(() => expect(sub.activeConnections()).toBe(0));
        await act(async () => await sub.publish({ value: 2 }));
    });

    it('tears down the old subscription and opens a new one when the key changes', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        let key = 'a';
        const { rerender } = renderHook(() => useSubscriptionSWR([key], sub.source), { wrapper });
        await waitForActiveSubscription(sub);
        const createdBeforeKeyChange = sub.publishersCreated();

        key = 'b';
        rerender();
        await waitFor(() => expect(sub.publishersCreated()).toBeGreaterThan(createdBeforeKeyChange));
        await waitForActiveSubscription(sub);
    });

    it('shares one active underlying subscription across components with the same key', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        renderHook(
            () => [useSubscriptionSWR(['shared'], sub.source), useSubscriptionSWR(['shared'], sub.source)] as const,
            { wrapper },
        );
        await waitFor(() => expect(sub.activeConnections()).toBe(1));
    });

    it('keeps using the current subscription when the source changes but the key is stable', async () => {
        const subA = makeFakeSubscription<{ value: number }>();
        const subB = makeFakeSubscription<{ value: number }>();
        let source: ReactiveStreamSource<{ value: number }> = subA.source;
        const { rerender } = renderHook(() => useSubscriptionSWR(['stable-key'], source), { wrapper });
        await waitForActiveSubscription(subA);

        source = subB.source;
        rerender();
        await waitForSubscriptionToSettle();
        expect(subB.publishersCreated()).toBe(0);
        expect(subA.activeConnections()).toBe(1);
    });

    describe('SSR', () => {
        it('renders without opening the subscription', () => {
            const reactiveStore = jest.fn();
            const source: ReactiveStreamSource<{ value: number }> = { reactiveStore };
            function Component() {
                const { data } = useSubscriptionSWR(['ssr'], source);
                return <p>{data ? 'has-data' : 'no-data'}</p>;
            }
            const html = renderToString(
                <SWRConfig value={{ provider: () => new Map() }}>
                    <Component />
                </SWRConfig>,
            );
            expect(html).toBe('<p>no-data</p>');
            expect(reactiveStore).not.toHaveBeenCalled();
        });
    });
});

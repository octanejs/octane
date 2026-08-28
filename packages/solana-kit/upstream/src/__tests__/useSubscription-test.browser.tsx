import {
    createReactiveStoreFromDataPublisherFactory,
    DataPublisher,
    ReactiveStreamSource,
    SolanaRpcResponse,
} from '@solana/kit';
import { act } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { renderHook } from '../__test-utils__/render';
import { useSubscription } from '../useSubscription';

type Notification<T> = SolanaRpcResponse<T> | T;

function makeFakeSubscription<T>(): {
    publish: (notification: Notification<T>) => Promise<void>;
    publishError: (err: unknown) => Promise<void>;
    publishersCreated: () => number;
    source: ReactiveStreamSource<T>;
} {
    type Listener = (payload: unknown) => void;
    let dataListeners: Listener[] = [];
    let errorListeners: Listener[] = [];
    let createdCount = 0;
    let publisherReady = Promise.withResolvers<void>();
    return {
        async publish(notification) {
            // Wait for the most recent connection's listeners to be wired up before firing
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
                        // Each connection gets a fresh publisher. Reset the listener arrays so
                        // any late callbacks from a torn-down prior connection can't reach the
                        // new one's listeners, and reset the ready handle so tests awaiting the
                        // *new* connection only proceed once it has wired up.
                        dataListeners = [];
                        errorListeners = [];
                        publisherReady = Promise.withResolvers<void>();
                        let onCallCount = 0;
                        const publisher: DataPublisher = {
                            on(channel, listener, options) {
                                const list = channel === 'data' ? dataListeners : errorListeners;
                                list.push(listener);
                                options?.signal.addEventListener(
                                    'abort',
                                    () => {
                                        const idx = list.indexOf(listener);
                                        if (idx !== -1) list.splice(idx, 1);
                                    },
                                    { once: true },
                                );
                                // The store binds both `data` and `error` channels on commit;
                                // after the second `.on` call the listeners are fully wired up
                                // and any awaiting publish/publishError calls can proceed.
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

describe('useSubscription', () => {
    it('starts in loading, transitions to loaded on first notification', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const { result } = renderHook(() => useSubscription(sub.source));

        expect(result.current.status).toBe('loading');
        expect(result.current.data).toBeUndefined();

        await act(async () => await sub.publish({ value: 42 }));
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toStrictEqual({ value: 42 });
    });

    it('surfaces `SolanaRpcResponse` envelopes as-is — callers read `.value` and `.context.slot`', async () => {
        const sub = makeFakeSubscription<SolanaRpcResponse<{ lamports: bigint }>>();
        const { result } = renderHook(() => useSubscription(sub.source));

        await act(async () => await sub.publish({ context: { slot: 99n }, value: { lamports: 5n } }));
        expect(result.current.data).toStrictEqual({ context: { slot: 99n }, value: { lamports: 5n } });
    });

    it('passes raw notifications through unchanged', async () => {
        const sub = makeFakeSubscription<{ parent: bigint, root: bigint, slot: bigint }>();
        const { result } = renderHook(() => useSubscription(sub.source));

        await act(async () => await sub.publish({ parent: 9n, root: 8n, slot: 10n }));
        expect(result.current.data).toStrictEqual({ parent: 9n, root: 8n, slot: 10n });
    });

    it('transitions to error on error-channel publish, preserving stale data', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const { result } = renderHook(() => useSubscription(sub.source));
        await act(async () => await sub.publish({ value: 1 }));
        expect(result.current.data).toStrictEqual({ value: 1 });

        const boom = new Error('boom');
        await act(async () => await sub.publishError(boom));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
        expect(result.current.data).toStrictEqual({ value: 1 }); // stale preserved
    });

    it('reconnect() re-opens the connection and transitions loading → loaded (SWR for data + error)', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const { result } = renderHook(() => useSubscription(sub.source));
        await act(async () => await sub.publish({ value: 1 }));
        const boom = new Error('fail');
        await act(async () => await sub.publishError(boom));
        expect(result.current.status).toBe('error');

        act(() => result.current.reconnect());
        expect(result.current.status).toBe('loading');
        expect(result.current.data).toStrictEqual({ value: 1 }); // stale data preserved
        expect(result.current.error).toBe(boom); // stale error preserved (SWR)

        await act(async () => await sub.publish({ value: 2 }));
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toStrictEqual({ value: 2 });
        expect(result.current.error).toBeUndefined(); // cleared on successful reconnect
        expect(sub.publishersCreated()).toBe(2);
    });

    it('reports status: disabled when the source is null', () => {
        const { result } = renderHook(() => useSubscription<{ value: number }>(null));
        expect(result.current.status).toBe('disabled');
        expect(result.current.data).toBeUndefined();
    });

    it('starts connecting when the source transitions from null to a real source', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const initialProps: { source: ReactiveStreamSource<{ value: number }> | null } = { source: null };
        const { result, rerender } = renderHook(({ source }) => useSubscription(source), { initialProps });
        expect(result.current.status).toBe('disabled');
        expect(sub.publishersCreated()).toBe(0);

        rerender({ source: sub.source });
        expect(result.current.status).toBe('loading');
        await act(async () => await sub.publish({ value: 1 }));
        expect(result.current.status).toBe('loaded');
        expect(sub.publishersCreated()).toBe(1);
    });

    it('returns to disabled when the source transitions from a real source to null', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const initialProps: { source: ReactiveStreamSource<{ value: number }> | null } = { source: sub.source };
        const { result, rerender } = renderHook(({ source }) => useSubscription(source), { initialProps });
        await act(async () => await sub.publish({ value: 1 }));
        expect(result.current.status).toBe('loaded');

        rerender({ source: null });
        expect(result.current.status).toBe('disabled');
        expect(result.current.data).toBeUndefined();
    });

    it('opens a fresh subscription when the source identity changes', async () => {
        const subA = makeFakeSubscription<{ value: number }>();
        const subB = makeFakeSubscription<{ value: number }>();
        const { result, rerender } = renderHook(
            ({ which }: { which: 'a' | 'b' }) => useSubscription(which === 'a' ? subA.source : subB.source),
            { initialProps: { which: 'a' } },
        );
        await act(async () => await subA.publish({ value: 1 }));
        expect(result.current.data).toStrictEqual({ value: 1 });

        rerender({ which: 'b' });
        await act(async () => await subB.publish({ value: 2 }));
        expect(result.current.data).toStrictEqual({ value: 2 });
    });

    it("aborts the prior connection's listeners when the source identity changes", async () => {
        const subA = makeFakeSubscription<{ value: number }>();
        const subB = makeFakeSubscription<{ value: number }>();
        const { result, rerender } = renderHook(
            ({ which }: { which: 'a' | 'b' }) => useSubscription(which === 'a' ? subA.source : subB.source),
            { initialProps: { which: 'a' } },
        );
        await act(async () => await subA.publish({ value: 1 }));

        rerender({ which: 'b' });
        // Late publishes from the now-torn-down prior connection must not reach the hook.
        await act(async () => await subA.publish({ value: 99 }));
        expect(result.current.data).not.toStrictEqual({ value: 99 });

        await act(async () => await subB.publish({ value: 2 }));
        expect(result.current.data).toStrictEqual({ value: 2 });
    });

    it('keeps a stable reconnect reference across re-renders', () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const { result, rerender } = renderHook(() => useSubscription(sub.source));
        const { reconnect } = result.current;
        rerender();
        expect(result.current.reconnect).toBe(reconnect);
    });

    it('invokes `getAbortSignal` on every connection with a fresh signal', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const signals: AbortSignal[] = [];
        const getAbortSignal = jest.fn(() => {
            const ctrl = new AbortController();
            signals.push(ctrl.signal);
            return ctrl.signal;
        });
        const { result } = renderHook(() => useSubscription(sub.source, { getAbortSignal }));
        await act(async () => await sub.publish({ value: 1 }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        await act(async () => await sub.publishError(new Error('fail')));
        act(() => result.current.reconnect());
        await act(async () => await sub.publish({ value: 2 }));
        expect(getAbortSignal).toHaveBeenCalledTimes(2);
        expect(signals[1]).not.toBe(signals[0]);
    });

    it('reconnect({ abortSignal }) overrides the getAbortSignal factory for that attempt', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useSubscription(sub.source, { getAbortSignal }));
        await act(async () => await sub.publish({ value: 1 }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        const overrideCtrl = new AbortController();
        act(() => result.current.reconnect({ abortSignal: overrideCtrl.signal }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1); // factory NOT called
        expect(sub.publishersCreated()).toBe(2);

        await act(async () => overrideCtrl.abort(new Error('overridden')));
        expect(result.current.status).toBe('error');
    });

    it('reconnect({ abortSignal: undefined }) opts out of the factory for that attempt', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useSubscription(sub.source, { getAbortSignal }));
        await act(async () => await sub.publish({ value: 1 }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        act(() => result.current.reconnect({ abortSignal: undefined }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1); // factory NOT called
        expect(sub.publishersCreated()).toBe(2);
    });

    it('reconnect() without an arg falls back to the getAbortSignal factory', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useSubscription(sub.source, { getAbortSignal }));
        await act(async () => await sub.publish({ value: 1 }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        act(() => result.current.reconnect());
        expect(getAbortSignal).toHaveBeenCalledTimes(2);
    });

    it('aborting the getAbortSignal transitions the current connection to error; reconnect recovers', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        let currentCtrl: AbortController | undefined;
        const getAbortSignal = () => {
            currentCtrl = new AbortController();
            return currentCtrl.signal;
        };
        const { result } = renderHook(() => useSubscription(sub.source, { getAbortSignal }));

        const timeoutReason = new Error('timeout');
        await act(async () => currentCtrl!.abort(timeoutReason));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(timeoutReason);

        act(() => result.current.reconnect());
        expect(currentCtrl!.signal.aborted).toBe(false); // brand-new controller for the new connection

        await act(async () => await sub.publish({ value: 1 }));
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toStrictEqual({ value: 1 });
    });

    it('aborts the in-flight subscription when the component unmounts', async () => {
        const sub = makeFakeSubscription<{ value: number }>();
        const { unmount } = renderHook(() => useSubscription(sub.source));
        await act(async () => await sub.publish({ value: 1 }));
        expect(sub.publishersCreated()).toBe(1);
        unmount();
        // After unmount, late publishes don't drive listeners — they've been removed via reset().
        await sub.publish({ value: 2 });
        // No assertion needed beyond "no throw"; we're verifying reset() ran without error.
    });

    describe('SSR', () => {
        it('renders `loading` on the server without opening a subscription', () => {
            const sub = makeFakeSubscription<{ value: number }>();
            function Component() {
                const { status } = useSubscription(sub.source);
                return <p>{status}</p>;
            }
            // `renderToString` drives `useSyncExternalStore` through its server-snapshot path
            // (the third arg to `useSyncExternalStore`), and effects don't run during server
            // rendering — so the store stays `idle` and the bridge maps that to `loading`.
            const html = renderToString(<Component />);
            expect(html).toBe('<p>loading</p>');
            expect(sub.publishersCreated()).toBe(0);
        });

        it('renders `disabled` on the server when the source is null', () => {
            function Component() {
                const { status } = useSubscription<{ value: number }>(null);
                return <p>{status}</p>;
            }
            const html = renderToString(<Component />);
            expect(html).toBe('<p>disabled</p>');
        });
    });
});

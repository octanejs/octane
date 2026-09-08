import {
    createReactiveActionStore,
    createReactiveStoreFromDataPublisherFactory,
    type ReactiveActionSource,
    type ReactiveStreamSource,
    type SolanaRpcResponse,
} from '@solana/kit';
import { act } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { renderHook } from '../__test-utils__/render';
import { TrackedDataSpec, useTrackedData } from '../useTrackedData';

type TestValue = { count: number };

function rpcResponse(slot: number, value: TestValue): SolanaRpcResponse<TestValue> {
    return { context: { slot: BigInt(slot) }, value };
}

// Backs `initialValueSource` with a real `ReactiveActionStore`. The wrapped function hands out a
// fresh controllable promise per dispatch (so a `refresh()` gets its own) and captures the
// per-dispatch signal so tests can assert it is forwarded and aborted.
function createMockInitialValueSource(): {
    fn: jest.Mock;
    reject(error: unknown): void;
    resolve(response: SolanaRpcResponse<TestValue>): void;
    signals: (AbortSignal | undefined)[];
    source: ReactiveActionSource<SolanaRpcResponse<TestValue>>;
} {
    const instances: { reject(error: unknown): void; resolve(response: SolanaRpcResponse<TestValue>): void }[] = [];
    const signals: (AbortSignal | undefined)[] = [];
    const fn = jest.fn().mockImplementation((signal?: AbortSignal) => {
        const { promise, resolve, reject } = Promise.withResolvers<SolanaRpcResponse<TestValue>>();
        instances.push({ reject, resolve });
        signals.push(signal);
        return promise;
    });
    return {
        fn,
        reject(error) {
            instances[instances.length - 1]?.reject(error);
        },
        resolve(response) {
            instances[instances.length - 1]?.resolve(response);
        },
        signals,
        source: { reactiveStore: () => createReactiveActionStore(fn) },
    };
}

// Backs `streamSource` with a real `ReactiveStreamStore` built from a mock `DataPublisher` factory.
// The publisher buffers events delivered before the store subscribes (mirroring the previous
// async-iterable mock) so notifications are never dropped on a timing technicality.
function createMockStreamSource(): {
    createDataPublisher: jest.Mock;
    error(err: unknown): void;
    pushNotification(notification: SolanaRpcResponse<TestValue>): void;
    source: ReactiveStreamSource<SolanaRpcResponse<TestValue>>;
} {
    const publishers: { publish(channel: string, payload: unknown): void }[] = [];
    const createDataPublisher = jest.fn().mockImplementation(() => {
        const listeners: {
            channel: string;
            listener: (payload: unknown) => void;
            options?: { signal?: AbortSignal };
        }[] = [];
        const buffered: { channel: string; payload: unknown }[] = [];
        const publisher = {
            on(channel: string, listener: (payload: unknown) => void, options?: { signal?: AbortSignal }) {
                listeners.push({ channel, listener, options });
                buffered
                    .filter(b => b.channel === channel)
                    .forEach(b => {
                        if (!options?.signal?.aborted) listener(b.payload);
                    });
                return function unsubscribe() {};
            },
        };
        publishers.push({
            publish(channel, payload) {
                const matched = listeners.filter(l => l.channel === channel && !l.options?.signal?.aborted);
                if (matched.length === 0) {
                    buffered.push({ channel, payload });
                } else {
                    matched.forEach(l => l.listener(payload));
                }
            },
        });
        return Promise.resolve(publisher);
    });
    return {
        createDataPublisher,
        error(err) {
            publishers[publishers.length - 1]?.publish('error', err);
        },
        pushNotification(notification) {
            publishers[publishers.length - 1]?.publish('data', notification);
        },
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
    error: (err: unknown) => void;
    initialValueSignals: () => (AbortSignal | undefined)[];
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
        error: stream.error,
        initialValueSignals: () => initialValue.signals,
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

describe('useTrackedData', () => {
    beforeEach(() => {
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
    });

    it('starts in loading, transitions to loaded with the initial RPC value', async () => {
        const { spec, resolveRpc } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));

        expect(result.current.status).toBe('loading');
        expect(result.current.data).toBeUndefined();

        await act(async () => {
            resolveRpc(rpcResponse(100, { count: 42 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 42 });
    });

    it('promotes a subscription notification over the initial RPC when the slot is newer', async () => {
        const { spec, resolveRpc, pushNotification } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));
        await act(async () => {
            resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 });

        await act(async () => {
            pushNotification(rpcResponse(200, { count: 2 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 2 });
    });

    it('drops a stale subscription notification with a slot older than the current value', async () => {
        const { spec, resolveRpc, pushNotification } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));
        await act(async () => {
            resolveRpc(rpcResponse(200, { count: 99 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 99 });

        // Older slot — store ignores; UI keeps the newer value.
        await act(async () => {
            pushNotification(rpcResponse(150, { count: 7 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 200n }, value: 99 });
    });

    it('drops the initial RPC value when a newer subscription notification arrived first', async () => {
        const { spec, resolveRpc, pushNotification } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));
        // Subscription arrives first at a newer slot.
        await act(async () => {
            pushNotification(rpcResponse(300, { count: 5 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 300n }, value: 5 });

        // Then the initial RPC resolves with an older slot — must NOT regress the value.
        await act(async () => {
            resolveRpc(rpcResponse(200, { count: 99 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 300n }, value: 5 });
    });

    it('transitions to error when the initial RPC rejects, preserving stale data if any', async () => {
        const { spec, rejectRpc, pushNotification } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));
        // Subscription delivers a value first.
        await act(async () => {
            pushNotification(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        const boom = new Error('boom');
        await act(async () => {
            rejectRpc(boom);
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }); // stale preserved
    });

    it('transitions to error when the subscription throws, preserving stale data if any', async () => {
        const { spec, resolveRpc, error } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));
        // Initial RPC delivers a value first.
        await act(async () => {
            resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('loaded');

        const boom = new Error('subscription failed');
        await act(async () => {
            error(boom);
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 }); // stale preserved
    });

    it('refresh() re-runs the pair and returns to loading with stale data preserved', async () => {
        const { spec, resolveRpc, pushNotification, rpcSendCalls, subscribeCalls } = makeSpec();
        const { result } = renderHook(() => useTrackedData(spec));
        await act(async () => {
            resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        await act(async () => {
            pushNotification(rpcResponse(150, { count: 2 }));
            await jest.runAllTimersAsync();
        });
        expect(rpcSendCalls()).toBe(1);
        expect(subscribeCalls()).toBe(1);

        act(() => result.current.refresh());
        // Both sources re-fire.
        expect(rpcSendCalls()).toBe(2);
        expect(subscribeCalls()).toBe(2);
        // Status returns to loading with stale data preserved.
        expect(result.current.status).toBe('loading');
        expect(result.current.data).toStrictEqual({ context: { slot: 150n }, value: 2 });
    });

    it('reports status: disabled when the spec is null', () => {
        const { result } = renderHook(() => useTrackedData<TestValue, TestValue, number>(null));
        expect(result.current.status).toBe('disabled');
        expect(result.current.data).toBeUndefined();
    });

    it('starts running when the spec transitions from null to a real one', async () => {
        const fake = makeSpec();
        const initialProps: { spec: Spec | null } = { spec: null };
        const { result, rerender } = renderHook(({ spec }) => useTrackedData(spec), { initialProps });
        expect(result.current.status).toBe('disabled');
        expect(fake.rpcSendCalls()).toBe(0);

        rerender({ spec: fake.spec });
        expect(result.current.status).toBe('loading');
        await act(async () => {
            fake.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('loaded');
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 });
    });

    it('returns to disabled when the spec transitions to null', async () => {
        const fake = makeSpec();
        const initialProps: { spec: Spec | null } = { spec: fake.spec };
        const { result, rerender } = renderHook(({ spec }) => useTrackedData(spec), { initialProps });
        await act(async () => {
            fake.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('loaded');

        rerender({ spec: null });
        expect(result.current.status).toBe('disabled');
        expect(result.current.data).toBeUndefined();
    });

    it('rebuilds the store when the spec identity changes', async () => {
        const a = makeSpec();
        const b = makeSpec();
        const { result, rerender } = renderHook(({ spec }: { spec: Spec }) => useTrackedData(spec), {
            initialProps: { spec: a.spec },
        });
        await act(async () => {
            a.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(result.current.data).toStrictEqual({ context: { slot: 100n }, value: 1 });

        rerender({ spec: b.spec });
        expect(result.current.status).toBe('loading');
        await act(async () => {
            b.resolveRpc(rpcResponse(50, { count: 2 }));
            await jest.runAllTimersAsync();
        });
        // Fresh store → slot tracking resets, so 50 is accepted as the new baseline.
        expect(result.current.data).toStrictEqual({ context: { slot: 50n }, value: 2 });
    });

    it('keeps a stable refresh reference across re-renders', () => {
        const { spec } = makeSpec();
        const { result, rerender } = renderHook(() => useTrackedData(spec));
        const { refresh } = result.current;
        rerender();
        expect(result.current.refresh).toBe(refresh);
    });

    it('invokes `getAbortSignal` on every attempt with a fresh signal', async () => {
        const fake = makeSpec();
        const signals: AbortSignal[] = [];
        const getAbortSignal = jest.fn(() => {
            const ctrl = new AbortController();
            signals.push(ctrl.signal);
            return ctrl.signal;
        });
        const { result } = renderHook(() => useTrackedData(fake.spec, { getAbortSignal }));
        await act(async () => {
            fake.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        act(() => result.current.refresh());
        expect(getAbortSignal).toHaveBeenCalledTimes(2);
        expect(signals[1]).not.toBe(signals[0]);
    });

    it('refresh({ abortSignal }) overrides the factory for that attempt', async () => {
        const fake = makeSpec();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useTrackedData(fake.spec, { getAbortSignal }));
        await act(async () => {
            fake.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        const overrideCtrl = new AbortController();
        act(() => result.current.refresh({ abortSignal: overrideCtrl.signal }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1); // factory NOT called

        await act(async () => {
            overrideCtrl.abort(new Error('overridden'));
            await jest.runAllTimersAsync();
        });
        expect(result.current.status).toBe('error');
    });

    it('refresh({ abortSignal: undefined }) opts out of the factory for that attempt', async () => {
        const fake = makeSpec();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useTrackedData(fake.spec, { getAbortSignal }));
        await act(async () => {
            fake.resolveRpc(rpcResponse(100, { count: 1 }));
            await jest.runAllTimersAsync();
        });
        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        act(() => result.current.refresh({ abortSignal: undefined }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1); // factory NOT called
        expect(fake.rpcSendCalls()).toBe(2);
    });

    it('aborts the in-flight attempt when the component unmounts', () => {
        const { spec, rpcSendCalls, initialValueSignals } = makeSpec();
        const { unmount } = renderHook(() => useTrackedData(spec));
        expect(rpcSendCalls()).toBe(1);
        const abortSignal = initialValueSignals()[0]!;
        expect(abortSignal.aborted).toBe(false);
        unmount();
        expect(abortSignal.aborted).toBe(true);
    });

    describe('SSR', () => {
        it('renders `loading` on the server without firing the RPC or subscription', () => {
            const fake = makeSpec();
            function Component() {
                const { status } = useTrackedData(fake.spec);
                return <p>{status}</p>;
            }
            const html = renderToString(<Component />);
            expect(html).toBe('<p>loading</p>');
            expect(fake.rpcSendCalls()).toBe(0);
            expect(fake.subscribeCalls()).toBe(0);
        });

        it('renders `disabled` on the server when the spec is null', () => {
            function Component() {
                const { status } = useTrackedData<TestValue, TestValue, number>(null);
                return <p>{status}</p>;
            }
            const html = renderToString(<Component />);
            expect(html).toBe('<p>disabled</p>');
        });
    });
});

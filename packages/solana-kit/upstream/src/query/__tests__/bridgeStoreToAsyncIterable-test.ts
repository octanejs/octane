import {
    isSolanaError,
    type ReactiveState,
    type ReactiveStreamStore,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
} from '@solana/kit';

import { bridgeStoreToAsyncIterable } from '../bridgeStoreToAsyncIterable';

function createFakeStore<T>(): {
    connectCount: () => number;
    emit: (state: ReactiveState<T>) => void;
    listenerCount: () => number;
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
        // The bridge connects via `withSignal(signal).connect()`, never the bare `connect()` — fail
        // loudly if it reaches for the unbound one.
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
        listenerCount: () => listeners.size,
        resetCount: () => resets,
        store,
        withSignalArg: () => withSignalArg,
    };
}

describe('bridgeStoreToAsyncIterable', () => {
    it('subscribes to and connects the store bound to the signal', () => {
        const fake = createFakeStore<number>();
        const ctrl = new AbortController();
        const it = bridgeStoreToAsyncIterable(fake.store, ctrl.signal)[Symbol.asyncIterator]();
        // The generator body runs synchronously up to its first `await`, so subscribe + connect have
        // happened by the time `next()` returns its (still-pending) promise.
        void it.next();
        expect(fake.listenerCount()).toBe(1);
        expect(fake.connectCount()).toBe(1);
        expect(fake.withSignalArg()).toBe(ctrl.signal);
    });

    it('yields a loaded value', async () => {
        expect.assertions(1);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        fake.emit({ data: 42, error: undefined, status: 'loaded' });
        await expect(pull).resolves.toEqual({ done: false, value: 42 });
    });

    it('yields successive loaded values across pulls', async () => {
        expect.assertions(2);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();

        const first = it.next();
        fake.emit({ data: 1, error: undefined, status: 'loaded' });
        await expect(first).resolves.toEqual({ done: false, value: 1 });

        const second = it.next();
        fake.emit({ data: 2, error: undefined, status: 'loaded' });
        await expect(second).resolves.toEqual({ done: false, value: 2 });
    });

    it('drops intermediate values (latest-wins) when several land between pulls', async () => {
        expect.assertions(1);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        // Three notifications arrive before the consumer pulls — only the freshest survives.
        fake.emit({ data: 1, error: undefined, status: 'loaded' });
        fake.emit({ data: 2, error: undefined, status: 'loaded' });
        fake.emit({ data: 3, error: undefined, status: 'loaded' });
        await expect(pull).resolves.toEqual({ done: false, value: 3 });
    });

    it('ignores idle and loading states', async () => {
        expect.assertions(1);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        fake.emit({ data: undefined, error: undefined, status: 'loading' });
        fake.emit({ data: undefined, error: undefined, status: 'idle' });
        // Neither carried a value; the first *loaded* is what the consumer sees.
        fake.emit({ data: 7, error: undefined, status: 'loaded' });
        await expect(pull).resolves.toEqual({ done: false, value: 7 });
    });

    it('throws on a store error and resets the store', async () => {
        expect.assertions(2);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        const boom = new Error('boom');
        fake.emit({ data: undefined, error: boom, status: 'error' });
        await expect(pull).rejects.toBe(boom);
        expect(fake.resetCount()).toBe(1);
    });

    it('drops a buffered value when an error arrives before the next pull', async () => {
        expect.assertions(2);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        // A value lands, then an error arrives before the consumer pulls again. Error wins: the
        // buffered value is dropped (once errored, stop yielding). Pins the failure-before-latest
        // precedence so a refactor can't silently invert it.
        const boom = new Error('boom');
        fake.emit({ data: 1, error: undefined, status: 'loaded' });
        fake.emit({ data: undefined, error: boom, status: 'error' });
        await expect(pull).rejects.toBe(boom);
        expect(fake.resetCount()).toBe(1);
    });

    it('substitutes a sentinel when the store errors with a nullish payload', async () => {
        expect.assertions(1);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        fake.emit({ data: undefined, error: undefined, status: 'error' });
        await pull.then(
            () => {
                throw new Error('expected the pull to reject');
            },
            error => {
                expect(isSolanaError(error, SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR)).toBe(true);
            },
        );
    });

    it('ends cleanly and resets the store when the signal aborts', async () => {
        expect.assertions(3);
        const fake = createFakeStore<number>();
        const ctrl = new AbortController();
        const it = bridgeStoreToAsyncIterable(fake.store, ctrl.signal)[Symbol.asyncIterator]();
        const pull = it.next();
        ctrl.abort();
        // An abort is teardown, not failure: the iterable completes (`done`) rather than rejecting.
        await expect(pull).resolves.toEqual({ done: true, value: undefined });
        expect(fake.resetCount()).toBe(1);
        expect(fake.listenerCount()).toBe(0);
    });

    it('unsubscribes and resets the store when the consumer stops early', async () => {
        expect.assertions(2);
        const fake = createFakeStore<number>();
        const it = bridgeStoreToAsyncIterable(fake.store, new AbortController().signal)[Symbol.asyncIterator]();
        const pull = it.next();
        fake.emit({ data: 1, error: undefined, status: 'loaded' });
        await pull;

        await it.return!(undefined);
        expect(fake.resetCount()).toBe(1);
        expect(fake.listenerCount()).toBe(0);
    });
});

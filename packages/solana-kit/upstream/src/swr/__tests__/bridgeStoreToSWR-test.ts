import {
    isSolanaError,
    type ReactiveState,
    type ReactiveStreamStore,
    SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR,
} from '@solana/kit';
import type { SWRSubscriptionOptions } from 'swr/subscription';

import { bridgeStoreToSWR } from '../bridgeStoreToSWR';

function createFakeStore<T>(): {
    connectCount: () => number;
    emit: (state: ReactiveState<T>) => void;
    listenerCount: () => number;
    resetCount: () => number;
    store: ReactiveStreamStore<T>;
} {
    let state: ReactiveState<T> = { data: undefined, error: undefined, status: 'idle' };
    const listeners = new Set<() => void>();
    let connects = 0;
    let resets = 0;
    const store: ReactiveStreamStore<T> = {
        connect: () => {
            connects++;
        },
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
        // The bridge never touches `withSignal` — fail loudly if it's called.
        withSignal: jest.fn().mockImplementation(() => {
            throw new Error('not implemented');
        }),
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
    };
}

describe('bridgeStoreToSWR', () => {
    it('subscribes to and connects the store', () => {
        const fake = createFakeStore<number>();
        const next = jest.fn();
        bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next']);
        expect(fake.listenerCount()).toBe(1);
        expect(fake.connectCount()).toBe(1);
    });

    it('forwards a loaded value as a success update', () => {
        const fake = createFakeStore<number>();
        const next = jest.fn();
        bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next']);

        fake.emit({ data: 42, error: undefined, status: 'loaded' });
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(null, 42);
    });

    it('forwards a store error as an error update', () => {
        const fake = createFakeStore<number>();
        const next = jest.fn();
        bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next']);

        const boom = new Error('boom');
        fake.emit({ data: undefined, error: boom, status: 'error' });
        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(boom);
    });

    it('substitutes a sentinel when the store reports an error with a nullish payload', () => {
        // SWR's `next` treats a nullish error as a *success* update, so the bridge must replace a
        // nullish error with a sentinel for the failure to surface.
        const fake = createFakeStore<number>();
        const next = jest.fn();
        bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next']);

        fake.emit({ data: undefined, error: undefined, status: 'error' });
        expect(next).toHaveBeenCalledTimes(1);
        const [error] = next.mock.calls[0];
        expect(isSolanaError(error, SOLANA_ERROR__REACT__SUBSCRIPTION_CLOSED_WITHOUT_ERROR)).toBe(true);
    });

    it('ignores idle and loading states', () => {
        const fake = createFakeStore<number>();
        const next = jest.fn();
        bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next']);

        fake.emit({ data: undefined, error: undefined, status: 'loading' });
        fake.emit({ data: undefined, error: undefined, status: 'idle' });
        expect(next).not.toHaveBeenCalled();
    });

    it('unsubscribes and resets the store on teardown', () => {
        const fake = createFakeStore<number>();
        const next = jest.fn();
        const teardown = bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next']);

        teardown();
        expect(fake.listenerCount()).toBe(0);
        expect(fake.resetCount()).toBe(1);
    });

    describe('with a shouldForward gate', () => {
        it('forwards a loaded value the gate accepts', () => {
            const fake = createFakeStore<number>();
            const next = jest.fn();
            bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next'], data => data >= 10);

            fake.emit({ data: 20, error: undefined, status: 'loaded' });
            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(null, 20);
        });

        it('drops a loaded value the gate rejects', () => {
            const fake = createFakeStore<number>();
            const next = jest.fn();
            bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next'], data => data >= 10);

            fake.emit({ data: 5, error: undefined, status: 'loaded' });
            expect(next).not.toHaveBeenCalled();
        });

        it('still forwards errors regardless of the gate', () => {
            const fake = createFakeStore<number>();
            const next = jest.fn();
            // A gate that would reject everything must not affect the error path.
            bridgeStoreToSWR(fake.store, next as SWRSubscriptionOptions<number>['next'], () => false);

            const boom = new Error('boom');
            fake.emit({ data: undefined, error: boom, status: 'error' });
            expect(next).toHaveBeenCalledTimes(1);
            expect(next).toHaveBeenCalledWith(boom);
        });
    });
});

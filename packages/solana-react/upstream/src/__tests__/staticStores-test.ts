import { disabledActionStore, disabledStreamStore } from '../staticStores';

describe('disabledActionStore', () => {
    it('reports a frozen `idle` state with no data or error', () => {
        const store = disabledActionStore<string>();
        const state = store.getState();
        expect(state).toEqual({ data: undefined, error: undefined, status: 'idle' });
        expect(Object.isFrozen(state)).toBe(true);
    });

    it('returns the same state reference across calls', () => {
        const store = disabledActionStore<string>();
        expect(store.getState()).toBe(store.getState());
    });

    it('`dispatch()` is a no-op — state does not change', () => {
        const store = disabledActionStore<string>();
        const before = store.getState();
        store.dispatch();
        store.dispatch();
        expect(store.getState()).toBe(before);
    });

    it('`reset()` is a no-op — state does not change', () => {
        const store = disabledActionStore<string>();
        const before = store.getState();
        store.reset();
        expect(store.getState()).toBe(before);
    });

    it('`withSignal(signal).dispatch()` is a no-op — state does not change, signal is not observed', () => {
        const store = disabledActionStore<string>();
        const ctrl = new AbortController();
        const before = store.getState();
        store.withSignal(ctrl.signal).dispatch();
        ctrl.abort(new Error('would-be-cancellation'));
        expect(store.getState()).toBe(before);
    });

    it('`subscribe()` never notifies (dispatch + reset produce no state change to observe)', () => {
        const store = disabledActionStore<string>();
        const listener = jest.fn();
        const unsubscribe = store.subscribe(listener);
        store.dispatch();
        store.reset();
        store.withSignal(new AbortController().signal).dispatch();
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });

    it('`dispatchAsync()` rejects with an AbortError so accidental awaits surface, not silently hang', async () => {
        expect.assertions(1);
        const store = disabledActionStore<string>();
        await expect(store.dispatchAsync()).rejects.toMatchObject({ name: 'AbortError' });
    });
});

describe('disabledStreamStore', () => {
    it('reports a frozen `idle` state with no data or error', () => {
        const store = disabledStreamStore<string>();
        const state = store.getState();
        expect(state).toEqual({ data: undefined, error: undefined, status: 'idle' });
        expect(Object.isFrozen(state)).toBe(true);
    });

    it('returns the same getState() reference across calls', () => {
        const store = disabledStreamStore<string>();
        expect(store.getState()).toBe(store.getState());
    });

    it('`connect()` is a no-op — state does not change', () => {
        const store = disabledStreamStore<string>();
        const before = store.getState();
        store.connect();
        store.connect();
        expect(store.getState()).toBe(before);
    });

    it('`reset()` is a no-op — state does not change', () => {
        const store = disabledStreamStore<string>();
        const before = store.getState();
        store.reset();
        expect(store.getState()).toBe(before);
    });

    it('`withSignal(signal).connect()` is a no-op — state does not change, signal is not observed', () => {
        const store = disabledStreamStore<string>();
        const ctrl = new AbortController();
        const before = store.getState();
        store.withSignal(ctrl.signal).connect();
        ctrl.abort(new Error('would-be-cancellation'));
        expect(store.getState()).toBe(before);
    });

    it('`subscribe()` never notifies (connect + reset produce no state change to observe)', () => {
        const store = disabledStreamStore<string>();
        const listener = jest.fn();
        const unsubscribe = store.subscribe(listener);
        store.connect();
        store.reset();
        store.withSignal(new AbortController().signal).connect();
        expect(listener).not.toHaveBeenCalled();
        unsubscribe();
    });
});

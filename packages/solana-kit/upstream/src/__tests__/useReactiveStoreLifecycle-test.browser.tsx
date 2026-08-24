import { act } from '@testing-library/react';

import { renderHook } from '../__test-utils__/render';
import { useReactiveStoreLifecycle } from '../useReactiveStoreLifecycle';

type FakeStore = { reset: jest.Mock };

function makeFakeStore(): FakeStore {
    return { reset: jest.fn() };
}

describe('useReactiveStoreLifecycle', () => {
    it('fires on mount with the store and the factory-provided signal', () => {
        const store = makeFakeStore();
        const fire = jest.fn();
        const signal = new AbortController().signal;
        renderHook(() => useReactiveStoreLifecycle(store, fire, () => signal));
        expect(fire).toHaveBeenCalledWith(store, signal);
    });

    it('fires on mount with an undefined signal when no factory is configured', () => {
        const store = makeFakeStore();
        const fire = jest.fn();
        renderHook(() => useReactiveStoreLifecycle(store, fire, undefined));
        expect(fire).toHaveBeenCalledWith(store, undefined);
    });

    it('resets the store on unmount', () => {
        const store = makeFakeStore();
        const fire = jest.fn();
        const { unmount } = renderHook(() => useReactiveStoreLifecycle(store, fire, undefined));
        store.reset.mockClear();
        unmount();
        expect(store.reset).toHaveBeenCalled();
    });

    it('returns a stable refresh callback across renders', () => {
        const store = makeFakeStore();
        const fire = jest.fn();
        const { result, rerender } = renderHook(() => useReactiveStoreLifecycle(store, fire, undefined));
        const refresh = result.current;
        rerender();
        expect(result.current).toBe(refresh);
    });

    it('re-fires when refresh() is called, reading the latest factory', () => {
        const store = makeFakeStore();
        const fire = jest.fn();
        const signal = new AbortController().signal;
        const { result } = renderHook(() => useReactiveStoreLifecycle(store, fire, () => signal));
        fire.mockClear();
        act(() => result.current());
        expect(fire).toHaveBeenCalledWith(store, signal);
    });

    describe('per-attempt abort signal override', () => {
        it('refresh({ abortSignal }) overrides the factory for that attempt', () => {
            const store = makeFakeStore();
            const fire = jest.fn();
            const factorySignal = new AbortController().signal;
            const { result } = renderHook(() => useReactiveStoreLifecycle(store, fire, () => factorySignal));
            fire.mockClear();
            const override = new AbortController().signal;
            act(() => result.current({ abortSignal: override }));
            expect(fire).toHaveBeenCalledWith(store, override);
        });

        it('refresh({ abortSignal: undefined }) opts out of the factory for that attempt', () => {
            const store = makeFakeStore();
            const fire = jest.fn();
            const factorySignal = new AbortController().signal;
            const { result } = renderHook(() => useReactiveStoreLifecycle(store, fire, () => factorySignal));
            fire.mockClear();
            act(() => result.current({ abortSignal: undefined }));
            expect(fire).toHaveBeenCalledWith(store, undefined);
        });
    });

    describe('dev-mode store-churn warning', () => {
        let errorSpy: jest.SpyInstance;
        beforeEach(() => {
            (globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = true;
            errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        });
        afterEach(() => {
            errorSpy.mockRestore();
        });

        it('warns when the store identity changes on too many consecutive renders', () => {
            const fire = jest.fn();
            const { rerender } = renderHook(({ store }) => useReactiveStoreLifecycle(store, fire, undefined), {
                initialProps: { store: makeFakeStore() },
            });
            for (let i = 0; i < 40; i++) {
                rerender({ store: makeFakeStore() });
            }
            expect(errorSpy).toHaveBeenCalledWith(
                expect.stringContaining('recreated its store'),
                expect.any(Number),
            );
        });

        it('does not warn when the store identity is stable across renders', () => {
            const store = makeFakeStore();
            const fire = jest.fn();
            const { rerender } = renderHook(() => useReactiveStoreLifecycle(store, fire, undefined));
            for (let i = 0; i < 40; i++) {
                rerender();
            }
            expect(errorSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('recreated its store'),
                expect.anything(),
            );
        });
    });

    it('does not warn in production mode even when the store churns', () => {
        // `__DEV__` defaults to `false` in the test harness.
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const fire = jest.fn();
        const { rerender } = renderHook(({ store }) => useReactiveStoreLifecycle(store, fire, undefined), {
            initialProps: { store: makeFakeStore() },
        });
        for (let i = 0; i < 40; i++) {
            rerender({ store: makeFakeStore() });
        }
        expect(errorSpy).not.toHaveBeenCalledWith(
            expect.stringContaining('recreated its store'),
            expect.anything(),
        );
        errorSpy.mockRestore();
    });
});

import { createReactiveActionStore, ReactiveActionSource } from '@solana/kit';
import { act } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { renderHook } from '../__test-utils__/render';
import { useRequest } from '../useRequest';

function makeFakeRequest<T>(): {
    fn: jest.Mock<Promise<T>, [AbortSignal]>;
    rejectLatest: (err: unknown) => void;
    resolveLatest: (value: T) => void;
    source: ReactiveActionSource<T>;
} {
    let latest: PromiseWithResolvers<T> | null = null;
    const fn = jest.fn<Promise<T>, [AbortSignal]>(() => {
        latest = Promise.withResolvers<T>();
        return latest.promise;
    });
    return {
        fn,
        rejectLatest(err) {
            latest!.reject(err);
        },
        resolveLatest(value) {
            latest!.resolve(value);
        },
        source: {
            reactiveStore() {
                return createReactiveActionStore<[], T>(fn);
            },
        },
    };
}

describe('useRequest', () => {
    it('auto-dispatches on mount and transitions fetching → success', async () => {
        const req = makeFakeRequest<string>();
        const { result } = renderHook(() => useRequest(req.source));

        expect(result.current.status).toBe('fetching');
        expect(result.current.data).toBeUndefined();
        expect(req.fn).toHaveBeenCalledTimes(1);

        await act(async () => req.resolveLatest('hi'));
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('hi');
    });

    it('reports error status with the error value when the call rejects', async () => {
        const boom = new Error('boom');
        const req = makeFakeRequest<string>();
        const { result } = renderHook(() => useRequest(req.source));

        await act(async () => req.rejectLatest(boom));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
    });

    it('refresh() after an error returns to fetching while preserving the stale error', async () => {
        const boom = new Error('boom');
        const req = makeFakeRequest<string>();
        const { result } = renderHook(() => useRequest(req.source));

        await act(async () => req.rejectLatest(boom));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
        expect(req.fn).toHaveBeenCalledTimes(1);

        act(() => result.current.refresh());
        expect(req.fn).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('fetching');
        expect(result.current.data).toBeUndefined();
        expect(result.current.error).toBe(boom);

        await act(async () => req.resolveLatest('ok'));
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('ok');
        expect(result.current.error).toBeUndefined();
    });

    it('refresh() re-dispatches and returns to fetching while preserving stale data', async () => {
        const req = makeFakeRequest<string>();
        const { result } = renderHook(() => useRequest(req.source));

        await act(async () => req.resolveLatest('first'));
        expect(result.current.data).toBe('first');
        expect(req.fn).toHaveBeenCalledTimes(1);

        act(() => result.current.refresh());
        expect(req.fn).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('fetching');
        expect(result.current.data).toBe('first');

        await act(async () => req.resolveLatest('second'));
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('second');
    });

    it('rebuilds the store and fires a fresh request when the source identity changes', () => {
        const reqA = makeFakeRequest<string>();
        const reqB = makeFakeRequest<string>();
        const { rerender } = renderHook(
            ({ which }: { which: 'a' | 'b' }) => useRequest(which === 'a' ? reqA.source : reqB.source),
            { initialProps: { which: 'a' } },
        );
        expect(reqA.fn).toHaveBeenCalledTimes(1);
        expect(reqB.fn).not.toHaveBeenCalled();

        rerender({ which: 'b' });
        expect(reqB.fn).toHaveBeenCalledTimes(1);
    });

    it('reports status: disabled when the source is null', () => {
        const { result } = renderHook(() => useRequest<string>(null));
        expect(result.current.status).toBe('disabled');
        expect(result.current.data).toBeUndefined();
    });

    it('starts firing when the source transitions from null to a real source', () => {
        const req = makeFakeRequest<string>();
        const initialProps: { source: ReactiveActionSource<string> | null } = { source: null };
        const { result, rerender } = renderHook(({ source }) => useRequest(source), { initialProps });
        expect(result.current.status).toBe('disabled');
        expect(req.fn).not.toHaveBeenCalled();

        rerender({ source: req.source });
        expect(result.current.status).toBe('fetching');
        expect(req.fn).toHaveBeenCalledTimes(1);
    });

    it('returns to disabled when the source transitions from a real source to null', async () => {
        const req = makeFakeRequest<string>();
        const initialProps: { source: ReactiveActionSource<string> | null } = { source: req.source };
        const { result, rerender } = renderHook(({ source }) => useRequest(source), { initialProps });
        await act(async () => req.resolveLatest('hi'));
        expect(result.current.status).toBe('success');

        rerender({ source: null });
        expect(result.current.status).toBe('disabled');
        expect(result.current.data).toBeUndefined();
    });

    it('aborts the in-flight request when the source transitions to null', () => {
        const req = makeFakeRequest<string>();
        const initialProps: { source: ReactiveActionSource<string> | null } = { source: req.source };
        const { rerender } = renderHook(({ source }) => useRequest(source), { initialProps });
        const inFlightSignal = req.fn.mock.calls[0][0];
        expect(inFlightSignal.aborted).toBe(false);

        rerender({ source: null });
        expect(inFlightSignal.aborted).toBe(true);
    });

    it('aborts the in-flight request when the component unmounts', () => {
        const req = makeFakeRequest<string>();
        const { unmount } = renderHook(() => useRequest(req.source));
        const inFlightSignal = req.fn.mock.calls[0][0];
        expect(inFlightSignal.aborted).toBe(false);

        unmount();
        expect(inFlightSignal.aborted).toBe(true);
    });

    it('keeps a stable refresh reference across re-renders', () => {
        const req = makeFakeRequest<string>();
        const { result, rerender } = renderHook(() => useRequest(req.source));
        const { refresh } = result.current;
        rerender();
        expect(result.current.refresh).toBe(refresh);
    });

    it('invokes getAbortSignal on every attempt with a fresh signal', () => {
        const req = makeFakeRequest<string>();
        const signals: AbortSignal[] = [];
        const getAbortSignal = jest.fn(() => {
            const ctrl = new AbortController();
            signals.push(ctrl.signal);
            return ctrl.signal;
        });
        const { result } = renderHook(() => useRequest(req.source, { getAbortSignal }));

        expect(getAbortSignal).toHaveBeenCalledTimes(1);

        act(() => result.current.refresh());
        expect(getAbortSignal).toHaveBeenCalledTimes(2);
        expect(signals[1]).not.toBe(signals[0]); // fresh identity per attempt
    });

    it('refresh({ abortSignal }) overrides the getAbortSignal factory for that attempt', async () => {
        const req = makeFakeRequest<string>();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useRequest(req.source, { getAbortSignal }));

        // Initial fire uses the factory.
        expect(getAbortSignal).toHaveBeenCalledTimes(1);
        expect(req.fn).toHaveBeenCalledTimes(1);

        // Refresh with an override signal: factory is NOT called this time.
        const overrideCtrl = new AbortController();
        act(() => result.current.refresh({ abortSignal: overrideCtrl.signal }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1);
        expect(req.fn).toHaveBeenCalledTimes(2);

        // Aborting the override signal cancels the current attempt and surfaces on state.
        const reason = new Error('overridden');
        await act(async () => overrideCtrl.abort(reason));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(reason);
    });

    it('refresh() without an abortSignal arg falls back to the getAbortSignal factory', () => {
        const req = makeFakeRequest<string>();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useRequest(req.source, { getAbortSignal }));

        expect(getAbortSignal).toHaveBeenCalledTimes(1);
        act(() => result.current.refresh());
        expect(getAbortSignal).toHaveBeenCalledTimes(2);
    });

    it('refresh({ abortSignal: undefined }) opts out of the getAbortSignal factory for that attempt', () => {
        const req = makeFakeRequest<string>();
        const getAbortSignal = jest.fn(() => new AbortController().signal);
        const { result } = renderHook(() => useRequest(req.source, { getAbortSignal }));

        // Initial fire uses the factory.
        expect(getAbortSignal).toHaveBeenCalledTimes(1);
        expect(req.fn).toHaveBeenCalledTimes(1);
        // First-attempt signal is the factory's signal — composed via AbortSignal.any with the
        // store's internal controller, so the fn receives a fresh non-aborted signal.
        expect(req.fn.mock.calls[0][0].aborted).toBe(false);

        // Refresh with explicit undefined: factory is NOT invoked.
        act(() => result.current.refresh({ abortSignal: undefined }));
        expect(getAbortSignal).toHaveBeenCalledTimes(1);
        expect(req.fn).toHaveBeenCalledTimes(2);
    });

    it('aborting the getAbortSignal transitions the current attempt to error; refresh starts a fresh one', async () => {
        const req = makeFakeRequest<string>();
        let currentCtrl: AbortController | undefined;
        const getAbortSignal = () => {
            currentCtrl = new AbortController();
            return currentCtrl.signal;
        };
        const { result } = renderHook(() => useRequest(req.source, { getAbortSignal }));

        const timeoutReason = new Error('timeout');
        await act(async () => currentCtrl!.abort(timeoutReason));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(timeoutReason);

        act(() => result.current.refresh());
        expect(currentCtrl!.signal.aborted).toBe(false); // brand-new controller for the new attempt

        await act(async () => req.resolveLatest('recovered'));
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('recovered');
    });

    describe('function shape', () => {
        it('accepts a bare async function and fires it on mount', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const { result } = renderHook(() => useRequest(fn));
            expect(fn).toHaveBeenCalledTimes(1);
            expect(result.current.status).toBe('fetching');

            await act(async () => resolve('hi'));
            expect(result.current.status).toBe('success');
            expect(result.current.data).toBe('hi');
        });

        it('refresh() re-invokes the function with a fresh signal', async () => {
            const { promise, resolve } = Promise.withResolvers<string>();
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => promise);
            const { result } = renderHook(() => useRequest(fn));
            await act(async () => resolve('ok'));
            expect(fn).toHaveBeenCalledTimes(1);

            act(() => result.current.refresh());
            expect(fn).toHaveBeenCalledTimes(2);
            expect(fn.mock.calls[1][0]).not.toBe(fn.mock.calls[0][0]);
        });

        it('combines a per-request signal into the signal passed to the function', () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => new Promise<string>(() => {}));
            const ctrl = new AbortController();
            renderHook(() => useRequest(fn, { getAbortSignal: () => ctrl.signal }));

            const innerSignal = fn.mock.calls[0][0];
            expect(innerSignal.aborted).toBe(false);

            ctrl.abort(new Error('timeout'));
            expect(innerSignal.aborted).toBe(true);
        });

        it('rebuilds the store and fires a fresh request when one function source replaces another', () => {
            const fnA = jest.fn<Promise<string>, [AbortSignal]>(() => new Promise<string>(() => {}));
            const fnB = jest.fn<Promise<string>, [AbortSignal]>(() => new Promise<string>(() => {}));
            const { rerender } = renderHook(
                ({ fn }: { fn: (signal: AbortSignal) => Promise<string> }) => useRequest(fn),
                {
                    initialProps: { fn: fnA },
                },
            );
            expect(fnA).toHaveBeenCalledTimes(1);
            expect(fnB).not.toHaveBeenCalled();

            rerender({ fn: fnB });
            expect(fnA.mock.calls[0][0].aborted).toBe(true); // prior in-flight call aborted
            expect(fnB).toHaveBeenCalledTimes(1);
        });

        it('rebuilds the store when switching between function and source shapes', () => {
            const fn = jest.fn<Promise<string>, [AbortSignal]>(() => new Promise<string>(() => {}));
            const req = makeFakeRequest<string>();
            type Source = ReactiveActionSource<string> | ((signal: AbortSignal) => Promise<string>);
            const initialProps: { source: Source } = { source: fn };
            const { rerender } = renderHook(({ source }) => useRequest(source), { initialProps });
            expect(fn).toHaveBeenCalledTimes(1);
            expect(req.fn).not.toHaveBeenCalled();

            rerender({ source: req.source });
            expect(fn.mock.calls[0][0].aborted).toBe(true);
            expect(req.fn).toHaveBeenCalledTimes(1);
        });
    });

    describe('SSR', () => {
        it('renders `fetching` on the server without firing the request', () => {
            const req = makeFakeRequest<string>();
            function Component() {
                const { status } = useRequest(req.source);
                return <p>{status}</p>;
            }
            // `renderToString` drives `useSyncExternalStore` through its server-snapshot path
            // (the third arg to `useSyncExternalStore`), and effects don't run during server
            // rendering — so the store stays `idle` and the bridge maps that to `fetching`.
            const html = renderToString(<Component />);
            expect(html).toBe('<p>fetching</p>');
            expect(req.fn).not.toHaveBeenCalled();
        });

        it('renders `disabled` on the server when the source is null', () => {
            function Component() {
                const { status } = useRequest<string>(null);
                return <p>{status}</p>;
            }
            const html = renderToString(<Component />);
            expect(html).toBe('<p>disabled</p>');
        });
    });
});

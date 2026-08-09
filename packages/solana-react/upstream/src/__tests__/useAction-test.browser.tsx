import { isAbortError } from '@solana/promises';
import { act } from '@testing-library/react';
import React from 'react';
import { renderToString } from 'react-dom/server';

import { renderHook } from '../__test-utils__/render';
import { useAction } from '../useAction';

describe('useAction', () => {
    it('transitions idle → running → success', async () => {
        const { promise, resolve } = Promise.withResolvers<string>();
        const fn = jest.fn((_s: AbortSignal, _arg: string) => promise);
        const { result } = renderHook(() => useAction(fn));

        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();

        act(() => {
            result.current.dispatch('hello');
        });
        expect(result.current.status).toBe('running');
        expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal), 'hello');

        await act(async () => resolve('world'));
        expect(result.current.status).toBe('success');
        expect(result.current.data).toBe('world');
    });

    it('transitions idle → running → error', async () => {
        const boom = new Error('boom');
        const { promise, reject } = Promise.withResolvers<string>();
        const { result } = renderHook(() => useAction((_s: AbortSignal) => promise));

        // Fire-and-forget: `dispatch` swallows the rejection internally, so no `.catch` is needed.
        act(() => {
            result.current.dispatch();
        });
        expect(result.current.status).toBe('running');

        await act(async () => reject(boom));
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
    });

    it('dispatch(...) is fire-and-forget — returns void and never rejects when the action fails', async () => {
        const { promise, reject } = Promise.withResolvers<string>();
        const { result } = renderHook(() => useAction((_s: AbortSignal) => promise));

        let returned: unknown;
        act(() => {
            returned = result.current.dispatch();
        });
        expect(returned).toBeUndefined();

        // Rejecting the action settles state without producing an unhandled rejection — the test
        // would fail loudly if `dispatch` surfaced the error as a floating promise.
        await act(async () => reject(new Error('boom')));
        expect(result.current.status).toBe('error');
    });

    it('aborts the prior call when dispatch is invoked again while one is in flight', async () => {
        const fn = jest.fn((signal: AbortSignal) => {
            const { promise, reject } = Promise.withResolvers<string>();
            signal.addEventListener('abort', () => reject(signal.reason));
            return promise;
        });
        const { result } = renderHook(() => useAction(fn));

        // Use `dispatchAsync` for the first call so we can await its supersede rejection below.
        let firstCall!: Promise<string>;
        act(() => {
            firstCall = result.current.dispatchAsync();
        });
        // The superseding call is fire-and-forget; `dispatch` swallows the eventual abort
        // rejection internally, so no defensive `.catch` is required.
        act(() => {
            result.current.dispatch();
        });

        expect(fn.mock.calls[0][0].aborted).toBe(true);
        expect(fn.mock.calls[1][0].aborted).toBe(false);

        const firstError = await firstCall.catch((err: unknown) => err);
        expect(isAbortError(firstError)).toBe(true);
    });

    it('await dispatchAsync(...) resolves to the function result on success', async () => {
        const { result } = renderHook(() => useAction(async (_s: AbortSignal, n: number) => n * 2));
        await act(async () => {
            await expect(result.current.dispatchAsync(21)).resolves.toBe(42);
        });
        expect(result.current.data).toBe(42);
    });

    it('await dispatchAsync(...) rejects with the thrown error on failure', async () => {
        const boom = new Error('boom');
        const { result } = renderHook(() =>
            useAction(async () => {
                throw boom;
            }),
        );
        await act(async () => {
            await expect(result.current.dispatchAsync()).rejects.toBe(boom);
        });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);
    });

    it('reset() returns to idle and clears data', async () => {
        const { result } = renderHook(() => useAction(async () => 'hi'));
        await act(async () => {
            await result.current.dispatchAsync();
        });
        expect(result.current.data).toBe('hi');

        act(() => result.current.reset());
        expect(result.current.status).toBe('idle');
        expect(result.current.data).toBeUndefined();
    });

    it('keeps prior error through a subsequent running state (stale-while-revalidate)', async () => {
        const boom = new Error('boom');
        const { promise: secondPending, resolve: resolveSecond } = Promise.withResolvers<string>();
        let n = 0;
        const fn = () => (++n === 1 ? Promise.reject(boom) : secondPending);
        const { result } = renderHook(() => useAction(fn));

        await act(async () => {
            await result.current.dispatchAsync().catch(() => {});
        });
        expect(result.current.status).toBe('error');
        expect(result.current.error).toBe(boom);

        act(() => {
            result.current.dispatch();
        });
        expect(result.current.status).toBe('running');
        expect(result.current.error).toBe(boom); // stale error preserved during revalidation

        await act(async () => resolveSecond('ok'));
        expect(result.current.status).toBe('success');
        expect(result.current.error).toBeUndefined();
    });

    it('keeps prior data through a subsequent running state (stale-while-revalidate)', async () => {
        const { promise: secondPending, resolve: resolveSecond } = Promise.withResolvers<string>();
        let n = 0;
        const fn = () => (++n === 1 ? Promise.resolve('first') : secondPending);
        const { result } = renderHook(() => useAction(fn));

        await act(async () => {
            await result.current.dispatchAsync();
        });
        expect(result.current.data).toBe('first');

        act(() => {
            result.current.dispatch();
        });
        expect(result.current.status).toBe('running');
        expect(result.current.data).toBe('first'); // stale data preserved during revalidation

        await act(async () => resolveSecond('second'));
        expect(result.current.data).toBe('second');
    });

    it('uses the latest fn closure on each new call', async () => {
        let captured: number | null = null;
        const { result, rerender } = renderHook(({ value }: { value: number }) => useAction(async () => (captured = value)), { initialProps: { value: 1 } });

        await act(async () => {
            await result.current.dispatchAsync();
        });
        expect(captured).toBe(1);

        rerender({ value: 2 });
        await act(async () => {
            await result.current.dispatchAsync();
        });
        expect(captured).toBe(2);
    });

    it('keeps stable dispatch / dispatchAsync / reset references across re-renders even as fn changes', () => {
        const { result, rerender } = renderHook(({ tag }: { tag: string }) => useAction(async () => tag), {
            initialProps: { tag: 'a' },
        });
        const { dispatch, dispatchAsync, reset } = result.current;

        rerender({ tag: 'b' });
        expect(result.current.dispatch).toBe(dispatch);
        expect(result.current.dispatchAsync).toBe(dispatchAsync);
        expect(result.current.reset).toBe(reset);
    });

    describe('SSR', () => {
        it('renders `idle` on the server without invoking the wrapped function', () => {
            const fn = jest.fn(async () => 'never');
            function Component() {
                const { status } = useAction(fn);
                return <p>{status}</p>;
            }
            // `renderToString` drives `useSyncExternalStore` through its server-snapshot path
            // (the third arg to `useSyncExternalStore`), and effects don't run during server
            // rendering — so the store stays `idle` and dispatch is never called.
            const html = renderToString(<Component />);
            expect(html).toBe('<p>idle</p>');
            expect(fn).not.toHaveBeenCalled();
        });
    });
});

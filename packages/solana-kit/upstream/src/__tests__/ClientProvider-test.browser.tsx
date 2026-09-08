import { Client, createClient, isSolanaError, SOLANA_ERROR__REACT__MISSING_PROVIDER } from '@solana/kit';
import { act } from '@testing-library/react';
import React, { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { render, renderHook } from '../__test-utils__/render';
import { ClientProvider } from '../ClientProvider';
import { useClient } from '../useClient';

describe('ClientProvider + useClient', () => {
    it('publishes the client to descendants and returns the same reference across renders', () => {
        const client = createClient();
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <ClientProvider client={client}>{children}</ClientProvider>
        );
        const { result, rerender } = renderHook(() => useClient(), { wrapper });
        expect(result.current).toBe(client);
        rerender();
        expect(result.current).toBe(client);
    });

    it('throws SolanaError MISSING_PROVIDER when `useClient` is called outside a provider', () => {
        const { result } = renderHook(() => {
            try {
                return useClient();
            } catch (err) {
                return err;
            }
        });
        expect(isSolanaError(result.current, SOLANA_ERROR__REACT__MISSING_PROVIDER)).toBe(true);
        expect((result.current as { context: { hookName: string } }).context.hookName).toBe('useClient');
    });

    it('lets the nearest provider win for nested mounts', () => {
        const outer = createClient();
        const inner = createClient();
        // Separate spies per probe — StrictMode renders each probe twice, so a single shared spy
        // can't be ordered (we'd see outer, outer, inner, inner or interleaved). Per-probe spies
        // let us assert each probe only ever saw its own provider's client.
        const onRenderOuter = jest.fn();
        const onRenderInner = jest.fn();
        function OuterProbe() {
            onRenderOuter(useClient());
            return null;
        }
        function InnerProbe() {
            onRenderInner(useClient());
            return null;
        }
        render(
            <ClientProvider client={outer}>
                <OuterProbe />
                <ClientProvider client={inner}>
                    <InnerProbe />
                </ClientProvider>
            </ClientProvider>,
        );
        expect(onRenderOuter).toHaveBeenCalledWith(outer);
        expect(onRenderOuter).not.toHaveBeenCalledWith(inner);
        expect(onRenderInner).toHaveBeenCalledWith(inner);
        expect(onRenderInner).not.toHaveBeenCalledWith(outer);
    });

    describe('async client', () => {
        it('renders the children once the client promise has resolved', async () => {
            const client = createClient();
            const clientPromise = Promise.resolve(client);
            const onRender = jest.fn();
            function Probe() {
                onRender(useClient());
                return <div data-testid="probe">ready</div>;
            }
            let queryByTestId!: ReturnType<typeof render>['queryByTestId'];
            await act(async () => {
                ({ queryByTestId } = render(
                    <Suspense fallback={<div data-testid="fallback">loading</div>}>
                        <ClientProvider client={clientPromise}>
                            <Probe />
                        </ClientProvider>
                    </Suspense>,
                ));
            });
            expect(queryByTestId('fallback')).toBeNull();
            expect(queryByTestId('probe')).not.toBeNull();
            expect(onRender).toHaveBeenLastCalledWith(client);
        });

        it('suspends while the promise is pending', () => {
            const clientPromise = new Promise<Client<object>>(() => {
                /* never resolves */
            });
            function Probe() {
                useClient();
                return <div data-testid="probe">ready</div>;
            }
            const { queryByTestId } = render(
                <Suspense fallback={<div data-testid="fallback">loading</div>}>
                    <ClientProvider client={clientPromise}>
                        <Probe />
                    </ClientProvider>
                </Suspense>,
            );
            expect(queryByTestId('fallback')).not.toBeNull();
            expect(queryByTestId('probe')).toBeNull();
        });

        it('lets a rejected client promise propagate to the nearest error boundary', async () => {
            const boom = new Error('boom');
            const clientPromise = Promise.reject<Client<object>>(boom);
            // Pre-attach a catch so the rejection isn't flagged as unhandled before React's
            // error-boundary subscription runs.
            clientPromise.catch(() => { });
            const onError = jest.fn();
            function Probe() {
                useClient();
                return <div data-testid="probe">ready</div>;
            }
            let queryByTestId!: ReturnType<typeof render>['queryByTestId'];
            await act(async () => {
                ({ queryByTestId } = render(
                    <ErrorBoundary
                        fallbackRender={({ error }) => {
                            onError(error);
                            return <div data-testid="caught">{(error as Error).message}</div>;
                        }}
                    >
                        <Suspense fallback={<div data-testid="fallback">loading</div>}>
                            <ClientProvider client={clientPromise}>
                                <Probe />
                            </ClientProvider>
                        </Suspense>
                    </ErrorBoundary>,
                ));
            });
            expect(queryByTestId('caught')).not.toBeNull();
            expect(queryByTestId('caught')!.textContent).toBe('boom');
            expect(queryByTestId('probe')).toBeNull();
            expect(onError).toHaveBeenCalledWith(boom);
        });
    });
});

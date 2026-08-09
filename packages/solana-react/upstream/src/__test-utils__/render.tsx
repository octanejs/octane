import {
    render as baseRender,
    renderHook as baseRenderHook,
    RenderHookOptions,
    RenderOptions,
} from '@testing-library/react';
import React, { ComponentType, ReactElement, ReactNode, StrictMode } from 'react';

/**
 * Shared test renderers that wrap every React tree in `<StrictMode>`.
 *
 * StrictMode's dev double-render surfaces render-phase impurity (side effects in `useMemo` or
 * `useState` initializers, missing effect cleanups, refs read during render) that would
 * otherwise only manifest in real apps. Using these helpers across all React hook / component
 * tests catches that class of bug at test time.
 *
 * Composes with caller-supplied wrappers: `renderHook(() => useFoo(), { wrapper: Provider })`
 * still works — the `Provider` is rendered inside `StrictMode`.
 *
 * Re-export from this module rather than `@testing-library/react` directly so the StrictMode
 * wrap is automatic.
 */

function composeWithStrictMode(
    Inner: ComponentType<{ children: ReactNode }> | undefined,
): ComponentType<{ children: ReactNode }> {
    return function StrictModeWrapper({ children }) {
        return <StrictMode>{Inner ? <Inner>{children}</Inner> : children}</StrictMode>;
    };
}

export function renderHook<TResult, TProps>(
    callback: (props: TProps) => TResult,
    options?: RenderHookOptions<TProps>,
): ReturnType<typeof baseRenderHook<TResult, TProps>> {
    return baseRenderHook(callback, { ...options, wrapper: composeWithStrictMode(options?.wrapper) });
}

export function render(ui: ReactElement, options?: RenderOptions): ReturnType<typeof baseRender> {
    return baseRender(ui, { ...options, wrapper: composeWithStrictMode(options?.wrapper) });
}

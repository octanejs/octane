import type { InitializationTarget } from 'overlayscrollbars';
import type { OverlayScrollbarsComponentProps, OverlayScrollbarsComponentRef } from './OverlayScrollbarsComponent';
export interface UseOverlayScrollbarsParams {
    /** OverlayScrollbars options. */
    options?: OverlayScrollbarsComponentProps['options'];
    /** OverlayScrollbars events. */
    events?: OverlayScrollbarsComponentProps['events'];
    /** Whether to defer the initialization to a point in time when the browser is idle. (or to the next frame if `window.requestIdleCallback` is not supported) */
    defer?: OverlayScrollbarsComponentProps['defer'];
}
export type UseOverlayScrollbarsInitialization = (target: InitializationTarget) => void;
export type UseOverlayScrollbarsInstance = () => ReturnType<OverlayScrollbarsComponentRef['osInstance']>;
/**
 * Hook for advanced usage of OverlayScrollbars. (When the OverlayScrollbarsComponent is not enough)
 * @param params Parameters for customization.
 * @returns A tuple with two values:
 * The first value is the initialization function, it takes one argument which is the `InitializationTarget`.
 * The second value is a function which returns the current OverlayScrollbars instance or `null` if not initialized.
 */
export declare const useOverlayScrollbars: (params?: UseOverlayScrollbarsParams) => [UseOverlayScrollbarsInitialization, UseOverlayScrollbarsInstance];

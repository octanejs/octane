import React from 'react';
import type { OverlayScrollbars } from 'overlayscrollbars';
import type { PartialOptions, EventListeners } from 'overlayscrollbars';
import type { ComponentPropsWithoutRef, ElementRef, ElementType, ForwardedRef, ReactElement } from 'react';
type OverlayScrollbarsComponentBaseProps<T extends ElementType = 'div'> = ComponentPropsWithoutRef<T> & {
    /** Tag of the root element. */
    element?: T;
    /** OverlayScrollbars options. */
    options?: PartialOptions | false | null;
    /** OverlayScrollbars events. */
    events?: EventListeners | false | null;
    /** Whether to defer the initialization to a point in time when the browser is idle. (or to the next frame if `window.requestIdleCallback` is not supported) */
    defer?: boolean | IdleRequestOptions;
};
export type OverlayScrollbarsComponentProps<T extends ElementType = 'div'> = OverlayScrollbarsComponentBaseProps<T> & {
    ref?: ForwardedRef<OverlayScrollbarsComponentRef<T>>;
};
export interface OverlayScrollbarsComponentRef<T extends ElementType = 'div'> {
    /** Returns the OverlayScrollbars instance or null if not initialized. */
    osInstance(): OverlayScrollbars | null;
    /** Returns the root element. */
    getElement(): ElementRef<T> | null;
}
declare const OverlayScrollbarsComponent: <T extends React.ElementType = "div">(props: OverlayScrollbarsComponentBaseProps<T>, ref: React.ForwardedRef<OverlayScrollbarsComponentRef<T>>) => ReactElement | null;
declare const OverlayScrollbarsComponentForwardedRef: <T extends React.ElementType = "div">(props: OverlayScrollbarsComponentProps<T>) => ReturnType<typeof OverlayScrollbarsComponent>;
export { OverlayScrollbarsComponentForwardedRef as OverlayScrollbarsComponent };

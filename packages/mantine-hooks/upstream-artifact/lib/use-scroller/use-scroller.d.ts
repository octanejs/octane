import { RefCallback } from 'react';
export interface UseScrollerOptions {
    /** Amount of pixels to scroll when calling scroll functions, `200` by default */
    scrollAmount?: number;
    /** Determines whether content can be scrolled by dragging with mouse, `true` by default */
    draggable?: boolean;
    /** Called when scroll state changes (canScrollStart or canScrollEnd) */
    onScrollStateChange?: (state: UseScrollerScrollState) => void;
}
export interface UseScrollerScrollState {
    /** Whether content can be scrolled towards the start (left in LTR, right in RTL) */
    canScrollStart: boolean;
    /** Whether content can be scrolled towards the end (right in LTR, left in RTL) */
    canScrollEnd: boolean;
}
export interface UseScrollerReturnValue<T extends HTMLElement = HTMLDivElement> {
    /** Ref callback to attach to the scrollable container element */
    ref: RefCallback<T | null>;
    /** Whether content can be scrolled towards the start */
    canScrollStart: boolean;
    /** Whether content can be scrolled towards the end */
    canScrollEnd: boolean;
    /** Scrolls towards the start direction */
    scrollStart: () => void;
    /** Scrolls towards the end direction */
    scrollEnd: () => void;
    /** `true` if the user is currently dragging the content */
    isDragging: boolean;
    /** Props to spread on the scrollable container for drag functionality */
    dragHandlers: {
        onMouseDown: (e: React.MouseEvent) => void;
        onMouseMove: (e: React.MouseEvent) => void;
        onMouseUp: () => void;
        onMouseLeave: () => void;
    };
}
export declare function useScroller<T extends HTMLElement = HTMLDivElement>(options?: UseScrollerOptions): UseScrollerReturnValue<T>;
export declare namespace useScroller {
    type Options = UseScrollerOptions;
    type ReturnValue<T extends HTMLElement = HTMLDivElement> = UseScrollerReturnValue<T>;
    type ScrollState = UseScrollerScrollState;
}

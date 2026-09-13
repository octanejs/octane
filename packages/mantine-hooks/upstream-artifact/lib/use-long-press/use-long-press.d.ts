import React from 'react';
export type UseLongPressEvent = 'mouse' | 'touch';
export interface UseLongPressOptions {
    /** Time in milliseconds to trigger the long press, default is 400ms */
    threshold?: number;
    /** Input types that can trigger the long press, `['mouse', 'touch']` by default */
    events?: UseLongPressEvent[];
    /** If set, the long press is canceled when the pointer moves further than the given distance in px from the start position. `true` uses a 10px threshold, a number sets a custom threshold. `false` by default */
    cancelOnMove?: boolean | number;
    /** Callback triggered when the long press starts */
    onStart?: (event: React.MouseEvent | React.TouchEvent) => void;
    /** Callback triggered when the long press finishes */
    onFinish?: (event: React.MouseEvent | React.TouchEvent) => void;
    /** Callback triggered when the long press is canceled */
    onCancel?: (event: React.MouseEvent | React.TouchEvent) => void;
}
export interface UseLongPressReturnValue {
    onMouseDown?: (event: React.MouseEvent) => void;
    onMouseUp?: (event: React.MouseEvent) => void;
    onMouseLeave?: (event: React.MouseEvent) => void;
    onMouseMove?: (event: React.MouseEvent) => void;
    onTouchStart?: (event: React.TouchEvent) => void;
    onTouchEnd?: (event: React.TouchEvent) => void;
    onTouchCancel?: (event: React.TouchEvent) => void;
    onTouchMove?: (event: React.TouchEvent) => void;
}
export declare function useLongPress(onLongPress: (event: React.MouseEvent | React.TouchEvent) => void, options?: UseLongPressOptions): UseLongPressReturnValue;
export declare namespace useLongPress {
    type Options = UseLongPressOptions;
    type ReturnValue = UseLongPressReturnValue;
}

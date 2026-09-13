type Vector2 = [number, number];
export interface UseDragState {
    /** Current pointer position [x, y] */
    xy: Vector2;
    /** Position where the gesture started [x, y] */
    initial: Vector2;
    /** Displacement from start [x, y], respects axis constraint */
    movement: Vector2;
    /** Change since previous event [x, y] */
    delta: Vector2;
    /** Absolute distance per axis [x, y] */
    distance: Vector2;
    /** Movement direction per axis: -1, 0, or 1 */
    direction: Vector2;
    /** Speed per axis in px/ms */
    velocity: Vector2;
    /** Time since drag started in ms */
    elapsedTime: number;
    /** `true` on the first handler call after the threshold is met */
    first: boolean;
    /** `true` on the last handler call (pointer released or canceled) */
    last: boolean;
    /** `true` while the gesture is ongoing */
    active: boolean;
    /** `true` when the gesture qualifies as a tap (requires `filterTaps: true`) */
    tap: boolean;
    /** `true` when the gesture was interrupted by a `pointercancel` event */
    canceled: boolean;
    /** Function to programmatically cancel the current gesture */
    cancel: () => void;
    /** The source `PointerEvent` */
    event: PointerEvent;
}
export interface UseDragOptions {
    /** Constrain movement to a specific axis. `'lock'` locks to whichever axis has more movement after `axisThreshold` is exceeded. */
    axis?: 'x' | 'y' | 'lock';
    /** Movement in px required to determine axis when `axis` is `'lock'`, `1` by default */
    axisThreshold?: number;
    /** When `true`, the last state includes `tap: true` when total distance is below `tapThreshold`, `false` by default */
    filterTaps?: boolean;
    /** Max displacement in px to still be considered a tap, `3` by default */
    tapThreshold?: number;
    /** Minimum displacement in px before the drag activates. Can be a number (both axes) or `[x, y]`. `0` by default */
    threshold?: number | Vector2;
    /** Enable or disable the hook, `true` by default */
    enabled?: boolean;
}
export interface UseDragReturnValue<T extends HTMLElement = any> {
    /** Ref callback to attach to the draggable element */
    ref: React.RefCallback<T | null>;
    /** `true` while the element is being dragged */
    active: boolean;
}
export declare function useDrag<T extends HTMLElement = any>(handler: (state: UseDragState) => void, options?: UseDragOptions): UseDragReturnValue<T>;
export declare namespace useDrag {
    type State = UseDragState;
    type Options = UseDragOptions;
    type ReturnValue<T extends HTMLElement = any> = UseDragReturnValue<T>;
}
export {};

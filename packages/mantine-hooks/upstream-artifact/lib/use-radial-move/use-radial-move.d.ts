export declare function normalizeRadialValue(degree: number, step: number): number;
export interface UseRadialMoveOptions {
    /** Number by which value is incremented/decremented with mouse and touch events, `0.01` by default */
    step?: number;
    /** Called in `onMouseUp` and `onTouchEnd` events with the current value */
    onChangeEnd?: (value: number) => void;
    /** Called in `onMouseDown` and `onTouchStart` events */
    onScrubStart?: () => void;
    /** Called in `onMouseUp` and `onTouchEnd` events */
    onScrubEnd?: () => void;
}
export interface UseRadialMoveReturnValue<T extends HTMLElement = any> {
    /** Ref to be passed to the element that should be used for radial move */
    ref: React.RefCallback<T | null>;
    /** Indicates whether the radial move is active */
    active: boolean;
}
export declare function useRadialMove<T extends HTMLElement = any>(onChange: (value: number) => void, { step, onChangeEnd, onScrubStart, onScrubEnd }?: UseRadialMoveOptions): UseRadialMoveReturnValue<T>;
export declare namespace useRadialMove {
    type Options = UseRadialMoveOptions;
    type ReturnValue<T extends HTMLElement> = UseRadialMoveReturnValue<T>;
}

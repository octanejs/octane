export interface UseIntervalOptions {
    /** If set, the interval will start automatically when the component is mounted, `false` by default */
    autoInvoke?: boolean;
}
export interface UseIntervalReturnValue {
    /** Starts the interval */
    start: () => void;
    /** Stops the interval */
    stop: () => void;
    /** Toggles the interval */
    toggle: () => void;
    /** Indicates if the interval is active */
    active: boolean;
}
export declare function useInterval(fn: () => void, interval: number, { autoInvoke }?: UseIntervalOptions): UseIntervalReturnValue;
export declare namespace useInterval {
    type Options = UseIntervalOptions;
    type ReturnValue = UseIntervalReturnValue;
}

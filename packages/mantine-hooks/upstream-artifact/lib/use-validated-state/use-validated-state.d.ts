export interface UseValidatedStateValue<T> {
    /** Current value */
    value: T;
    /** Last valid value */
    lastValidValue: T | undefined;
    /** True if the current value is valid, false otherwise */
    valid: boolean;
}
export type UseValidatedStateReturnValue<T> = [
    /** Current value */
    UseValidatedStateValue<T>,
    /** Handler to update the state, passes `value` and `payload` to `onChange` */
    (value: T) => void
];
export declare function useValidatedState<T>(initialValue: T, validate: (value: T) => boolean, initialValidationState?: boolean): UseValidatedStateReturnValue<T>;
export declare namespace useValidatedState {
    type ReturnValue<T> = UseValidatedStateReturnValue<T>;
}

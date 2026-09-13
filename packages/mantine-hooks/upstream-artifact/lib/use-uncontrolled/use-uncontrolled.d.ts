export interface UseUncontrolledOptions<T> {
    /** Value for controlled state */
    value?: T;
    /** Initial value for uncontrolled state */
    defaultValue?: T;
    /** Final value for uncontrolled state when value and defaultValue are not provided */
    finalValue?: T;
    /** Controlled state onChange handler */
    onChange?: (value: T, ...payload: any[]) => void;
}
export type UseUncontrolledReturnValue<T> = [
    /** Current value */
    T,
    /** Handler to update the state, passes `value` and `payload` to `onChange` */
    (value: T, ...payload: any[]) => void,
    /** True if the state is controlled, false if uncontrolled */
    boolean
];
export declare function useUncontrolled<T>({ value, defaultValue, finalValue, onChange, }: UseUncontrolledOptions<T>): UseUncontrolledReturnValue<T>;
export declare namespace useUncontrolled {
    type Options<T> = UseUncontrolledOptions<T>;
    type ReturnValue<T> = UseUncontrolledReturnValue<T>;
}

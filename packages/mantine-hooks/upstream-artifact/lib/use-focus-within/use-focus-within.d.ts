export interface UseFocusWithinOptions {
    onFocus?: (event: FocusEvent) => void;
    onBlur?: (event: FocusEvent) => void;
}
export interface UseFocusWithinReturnValue<T extends HTMLElement = any> {
    ref: React.RefCallback<T | null>;
    focused: boolean;
}
export declare function useFocusWithin<T extends HTMLElement = any>({ onBlur, onFocus, }?: UseFocusWithinOptions): UseFocusWithinReturnValue<T>;
export declare namespace useFocusWithin {
    type Options = UseFocusWithinOptions;
    type ReturnValue<T extends HTMLElement> = UseFocusWithinReturnValue<T>;
}

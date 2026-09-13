export interface UseDebouncedCallbackOptions {
    delay: number;
    flushOnUnmount?: boolean;
    leading?: boolean;
    maxWait?: number;
}
export type UseDebouncedCallbackReturnValue<T extends (...args: any[]) => any> = ((...args: Parameters<T>) => void) & {
    flush: () => void;
    cancel: () => void;
    isPending: () => boolean;
};
export declare function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, options: number | UseDebouncedCallbackOptions): ((...args: Parameters<T>) => void) & {
    flush: () => void;
    cancel: () => void;
    isPending: () => boolean;
    _isFirstCall: boolean;
    _hasPendingCallback: boolean;
};
export declare namespace useDebouncedCallback {
    type Options = UseDebouncedCallbackOptions;
    type ReturnValue<T extends (...args: any[]) => any> = UseDebouncedCallbackReturnValue<T>;
}

export interface UseDebouncedValueOptions {
    leading?: boolean;
}
export interface UseDebouncedValueHandlers {
    cancel: () => void;
    flush: () => void;
}
export type UseDebouncedValueReturnValue<T> = [T, () => void, UseDebouncedValueHandlers];
export declare function useDebouncedValue<T = any>(value: T, wait: number, options?: UseDebouncedValueOptions): UseDebouncedValueReturnValue<T>;
export declare namespace useDebouncedValue {
    type Handlers = UseDebouncedValueHandlers;
    type Options = UseDebouncedValueOptions;
    type ReturnValue<T> = UseDebouncedValueReturnValue<T>;
}

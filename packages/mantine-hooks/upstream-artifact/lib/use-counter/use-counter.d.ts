export interface UseCounterOptions {
    min?: number;
    max?: number;
    step?: number;
}
export interface UseCounterHandlers {
    increment: () => void;
    decrement: () => void;
    set: (value: number) => void;
    reset: () => void;
}
export type UseCounterReturnValue = [number, UseCounterHandlers];
export declare function useCounter(initialValue?: number, options?: UseCounterOptions): UseCounterReturnValue;
export declare namespace useCounter {
    type Options = UseCounterOptions;
    type Handlers = UseCounterHandlers;
    type ReturnValue = UseCounterReturnValue;
}

export interface UseTimeoutOptions {
    autoInvoke: boolean;
}
export interface UseTimeoutReturnValue {
    start: (...args: any[]) => void;
    clear: () => void;
}
export declare function useTimeout(callback: (...args: any[]) => void, delay: number, options?: UseTimeoutOptions): UseTimeoutReturnValue;
export declare namespace useTimeout {
    type Options = UseTimeoutOptions;
    type ReturnValue = UseTimeoutReturnValue;
}

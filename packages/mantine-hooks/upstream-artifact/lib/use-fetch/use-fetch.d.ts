export interface UseFetchOptions extends RequestInit {
    autoInvoke?: boolean;
}
export interface UseFetchReturnValue<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refetch: () => Promise<any>;
    abort: () => void;
}
export declare function useFetch<T>(url: string, { autoInvoke, ...options }?: UseFetchOptions): UseFetchReturnValue<T>;
export declare namespace useFetch {
    type Options = UseFetchOptions;
    type ReturnValue<T> = UseFetchReturnValue<T>;
}

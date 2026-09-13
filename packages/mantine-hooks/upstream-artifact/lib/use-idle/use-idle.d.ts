export interface UseIdleOptions {
    events?: (keyof DocumentEventMap)[];
    initialState?: boolean;
}
export declare function useIdle(timeout: number, options?: UseIdleOptions): boolean;
export declare namespace useIdle {
    type Options = UseIdleOptions;
}

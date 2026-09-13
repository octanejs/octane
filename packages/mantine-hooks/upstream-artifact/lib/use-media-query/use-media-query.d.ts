export interface UseMediaQueryOptions {
    getInitialValueInEffect: boolean;
}
export declare function useMediaQuery(query: string, initialValue?: boolean, { getInitialValueInEffect }?: UseMediaQueryOptions): boolean;
export declare namespace useMediaQuery {
    type Options = UseMediaQueryOptions;
}

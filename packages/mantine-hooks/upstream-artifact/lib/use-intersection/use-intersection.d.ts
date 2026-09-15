export interface UseIntersectionReturnValue<T> {
    ref: React.RefCallback<T | null>;
    entry: IntersectionObserverEntry | null;
}
export declare function useIntersection<T extends HTMLElement = any>(options?: IntersectionObserverInit): UseIntersectionReturnValue<T>;
export declare namespace useIntersection {
    type ReturnValue<T> = UseIntersectionReturnValue<T>;
}

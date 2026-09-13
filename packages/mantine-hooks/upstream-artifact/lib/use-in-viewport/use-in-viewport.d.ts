export interface UseInViewportReturnValue<T extends HTMLElement = any> {
    inViewport: boolean;
    ref: React.RefCallback<T | null>;
}
export declare function useInViewport<T extends HTMLElement = any>(): UseInViewportReturnValue<T>;
export declare namespace useInViewport {
    type ReturnValue<T extends HTMLElement> = UseInViewportReturnValue<T>;
}

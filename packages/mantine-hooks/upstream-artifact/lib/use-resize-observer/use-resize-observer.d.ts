export type ObserverRect = Omit<DOMRectReadOnly, 'toJSON'>;
export type UseResizeObserverReturnValue<T extends HTMLElement = any> = [
    React.RefCallback<T | null>,
    ObserverRect
];
export declare function useResizeObserver<T extends HTMLElement = any>(options?: ResizeObserverOptions): UseResizeObserverReturnValue<T>;
export interface UseElementSizeReturnValue<T extends HTMLElement = any> {
    ref: React.RefCallback<T | null>;
    width: number;
    height: number;
}
export declare function useElementSize<T extends HTMLElement = any>(options?: ResizeObserverOptions): {
    ref: React.RefCallback<T | null>;
    width: number;
    height: number;
};
export declare namespace useResizeObserver {
    type ReturnValue<T extends HTMLElement> = UseResizeObserverReturnValue<T>;
}
export declare namespace useElementSize {
    type ReturnValue<T extends HTMLElement> = UseElementSizeReturnValue<T>;
}

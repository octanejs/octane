export interface UseMouseReturnValue<T extends HTMLElement = any> {
    ref: React.RefCallback<T | null>;
    x: number;
    y: number;
}
export declare function useMouse<T extends HTMLElement = any>(options?: {
    resetOnExit?: boolean;
}): UseMouseReturnValue<T>;
export interface UseMousePositionReturnValue {
    x: number;
    y: number;
}
export declare function useMousePosition(): UseMousePositionReturnValue;
export declare namespace useMouse {
    type ReturnValue<T extends HTMLElement> = UseMouseReturnValue<T>;
}
export declare namespace useMousePosition {
    type ReturnValue = UseMousePositionReturnValue;
}

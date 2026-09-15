export interface UseMovePosition {
    x: number;
    y: number;
}
export declare function clampUseMovePosition(position: UseMovePosition): {
    x: number;
    y: number;
};
export interface UseMoveHandlers {
    onScrubStart?: () => void;
    onScrubEnd?: () => void;
}
export interface UseMoveReturnValue<T extends HTMLElement = any> {
    ref: React.RefCallback<T | null>;
    active: boolean;
}
export declare function useMove<T extends HTMLElement = any>(onChange: (value: UseMovePosition) => void, handlers?: UseMoveHandlers, dir?: 'ltr' | 'rtl'): UseMoveReturnValue<T>;
export declare namespace useMove {
    type Handlers = UseMoveHandlers;
    type ReturnValue<T extends HTMLElement> = UseMoveReturnValue<T>;
}

export interface UseFullscreenElementReturnValue<T extends HTMLElement = any> {
    ref: React.RefCallback<T | null>;
    toggle: () => Promise<void>;
    fullscreen: boolean;
}
export declare function useFullscreenElement<T extends HTMLElement = any>(): UseFullscreenElementReturnValue<T>;
export interface UseFullscreenDocumentReturnValue {
    toggle: () => Promise<void>;
    fullscreen: boolean;
}
export declare function useFullscreenDocument(): UseFullscreenDocumentReturnValue;

export declare function useMutationObserver<T extends HTMLElement = any>(callback: MutationCallback, options: MutationObserverInit): React.RefCallback<T | null>;
export declare function useMutationObserverTarget(callback: MutationCallback, options: MutationObserverInit, target?: HTMLElement | (() => HTMLElement) | null): void;

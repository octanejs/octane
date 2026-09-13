export declare function useThrottledCallbackWithClearTimeout<T extends (...args: any[]) => any>(callback: T, wait: number): readonly [(...args: Parameters<T>) => void, () => void];
export declare function useThrottledCallback<T extends (...args: any[]) => any>(callback: T, wait: number): (...args: Parameters<T>) => void;

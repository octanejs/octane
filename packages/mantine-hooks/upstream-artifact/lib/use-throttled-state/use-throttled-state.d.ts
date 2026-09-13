export declare function useThrottledState<T = any>(defaultValue: T, wait: number): readonly [T, (value: import("react").SetStateAction<T>) => void];

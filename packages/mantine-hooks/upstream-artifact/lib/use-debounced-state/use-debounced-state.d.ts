import { SetStateAction } from 'react';
export interface UseDebouncedStateOptions {
    leading?: boolean;
}
export type UseDebouncedStateReturnValue<T> = [T, (newValue: SetStateAction<T>) => void];
export declare function useDebouncedState<T = any>(defaultValue: T, wait: number, options?: UseDebouncedStateOptions): UseDebouncedStateReturnValue<T>;
export declare namespace useDebouncedState {
    type Options = UseDebouncedStateOptions;
    type ReturnValue<T> = UseDebouncedStateReturnValue<T>;
}

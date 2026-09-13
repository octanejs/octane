import { Ref, type RefCallback } from 'react';
type PossibleRef<T> = Ref<T> | undefined;
type RefCleanup<T> = ReturnType<RefCallback<T>>;
export declare function assignRef<T>(ref: PossibleRef<T>, value: T): RefCleanup<T>;
export declare function mergeRefs<T>(...refs: PossibleRef<T>[]): RefCallback<T>;
export declare function useMergedRef<T>(...refs: PossibleRef<T>[]): RefCallback<T>;
export {};

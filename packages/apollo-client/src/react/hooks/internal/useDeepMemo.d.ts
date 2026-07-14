export declare function useDeepMemo<TValue>(
	memoFn: () => TValue,
	deps: readonly unknown[],
	site?: symbol,
): TValue;

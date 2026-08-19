import { useCallback, useMemo } from 'octane';

export function usePlainBox(dep: number, tick: number) {
	return useMemo(() => ({ value: dep, tick }), [dep]);
}

export function usePlainCallback(dep: number, tick: number) {
	return useCallback(() => dep * 1000 + tick, [dep]);
}

const EXPLICIT_MEMO = Symbol('hook-memo-bench:plain-value');
const EXPLICIT_CALLBACK = Symbol('hook-memo-bench:plain-callback');

export function usePlainExplicitPair(dep: number, tick: number) {
	const box = useMemo(() => ({ value: dep, tick }), [dep], EXPLICIT_MEMO);
	const callback = useCallback(() => dep * 1000 + tick, [dep], EXPLICIT_CALLBACK);
	return { box, callback };
}

import { useCallback, useMemo } from 'octane';

export function usePlainBox(dep: number, tick: number) {
	return useMemo(() => ({ value: dep, tick }), [dep]);
}

export function usePlainCallback(dep: number, tick: number) {
	return useCallback(() => dep * 1000 + tick, [dep]);
}

// Template literals print through their parent's visitor; a module using one
// must still reach the inline memo tier.
const SLOT_PREFIX = 'hook-memo-bench';
const EXPLICIT_MEMO = Symbol(`${SLOT_PREFIX}:plain-value`);
const EXPLICIT_CALLBACK = Symbol(`${SLOT_PREFIX}:plain-callback`);

export function usePlainExplicitPair(dep: number, tick: number) {
	const box = useMemo(() => ({ value: dep, tick }), [dep], EXPLICIT_MEMO);
	const callback = useCallback(() => dep * 1000 + tick, [dep], EXPLICIT_CALLBACK);
	return { box, callback };
}

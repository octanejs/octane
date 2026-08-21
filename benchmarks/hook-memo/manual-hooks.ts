import { useCallback, useMemo } from 'octane';

const MEMO_SLOT = Symbol('hook-memo-bench:manual-value');
const CALLBACK_SLOT = Symbol('hook-memo-bench:manual-callback');

// This module follows a binding package's manual-slot contract. The production
// adapter may lower its memo expressions, but must not add another slot layer.
export function useManualPair(dep: number, tick: number) {
	const box = useMemo(() => ({ value: dep, tick }), [dep], MEMO_SLOT);
	const callback = useCallback(() => dep * 1000 + tick, [dep], CALLBACK_SLOT);
	return { box, callback };
}

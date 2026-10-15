'use strong';

import { useCallback, useMemo } from 'octane';

const MEMO_SLOT = Symbol('hook-memo-bench:strong-manual-value');
const CALLBACK_SLOT = Symbol('hook-memo-bench:strong-manual-callback');

// Strong bindings retain authored slots and explicit dependency semantics.
export function useStrongManualPair(dep: number, tick: number) {
	const box = useMemo(() => ({ value: dep, tick }), [dep], MEMO_SLOT);
	const callback = useCallback(() => dep * 1000 + tick, [dep], CALLBACK_SLOT);
	return { box, callback };
}

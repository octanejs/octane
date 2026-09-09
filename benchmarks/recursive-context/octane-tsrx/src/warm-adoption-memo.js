import { useMemo } from 'octane';

const valueSlot = Symbol();

// An ordinary custom hook exercises the runtime memo adoption path. Its value
// is synchronous; only the separate control ever creates a warmable resource.
export function useOrdinaryMemo(version, depth) {
	return useMemo(() => `${version}:${depth}`, [version, depth], valueSlot);
}

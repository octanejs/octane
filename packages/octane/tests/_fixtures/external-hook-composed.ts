import { useExternalCounter } from './external-hook.ts';
import { useOtherCounter } from './external-hook-other.ts';

// This module has no base hook of its own, so the surgical pass intentionally
// leaves these nested custom-hook calls unwrapped. Their base slots therefore
// share the caller's one ambient path and must remain distinct across modules.
export function useCrossModuleCounters() {
	const left = useExternalCounter(1);
	const [right, setRight] = useOtherCounter(100);
	return { left, right, setRight };
}

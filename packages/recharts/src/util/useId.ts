// Port of util/useId.ts — octane always provides useId (React-18 semantics,
// SSR/hydration-stable), so the pre-18 fallback collapses to a forwarder. The
// slot forwarding keeps the hook usable from compiled AND uncompiled callers.
import { useId as octaneUseId } from 'octane';
import { splitSlot } from '../internal';

export function useId(...rest: any[]): string {
	const [, slot] = splitSlot(rest);
	return octaneUseId(slot);
}

/** Upstream's pre-React-18 fallback — same implementation here. */
export const useIdFallback = useId;

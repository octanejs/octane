// Ported from @radix-ui/react-use-is-hydrated (source:
// .radix-primitives/packages/react/use-is-hydrated/src/use-is-hydrated.tsx). Whether
// the component tree has hydrated: `useSyncExternalStore` returns the server snapshot
// (false) during SSR/hydration and the client snapshot (true) after. octane exposes
// useSyncExternalStore directly, so the source's legacy fallback isn't needed.
import { useSyncExternalStore } from 'octane';

import { S, splitSlot, subSlot } from './internal';

function subscribe(): () => void {
	return () => {};
}

export function useIsHydrated(...args: any[]): boolean {
	const [, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useIsHydrated');
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
		subSlot(slot, 's'),
	);
}

import { useEffect, useLayoutEffect } from 'octane';

export function useIsomorphicLayoutEffect(
	effect: () => void | (() => void),
	dependencies: unknown[] | undefined,
	slot?: symbol,
): void {
	const hook = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
	hook(effect, dependencies, slot);
}

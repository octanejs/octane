import { useEffect, useLayoutEffect } from 'octane';
import { canUseDOM } from '@dnd-kit/dom/utilities';

type EffectCallback = () => void | (() => void);
type EffectHook = (callback: EffectCallback, deps?: any[] | null, slot?: symbol) => void;

const effect: EffectHook = canUseDOM ? useLayoutEffect : useEffect;

export function useIsomorphicLayoutEffect(
	callback: EffectCallback,
	dependenciesOrSlot?: any[] | null | symbol,
	maybeSlot?: symbol,
): void {
	const slot = typeof dependenciesOrSlot === 'symbol' ? dependenciesOrSlot : maybeSlot;
	const dependencies = typeof dependenciesOrSlot === 'symbol' ? undefined : dependenciesOrSlot;
	effect(callback, dependencies, slot);
}

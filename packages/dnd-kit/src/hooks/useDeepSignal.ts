import { flushSync, useMemo, useRef } from 'octane';
import { effect, untracked } from '@dnd-kit/state';
import { subSlot } from '../internal';
import { useForceUpdate } from './useForceUpdate';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

type Synchronous<T> = (property: keyof T, oldValue: any, newValue: any) => boolean;

export function useDeepSignal<T extends object | null | undefined>(
	target: T,
	synchronousOrSlot?: Synchronous<NonNullable<T>> | symbol,
	maybeSlot?: symbol,
): T {
	const slot = typeof synchronousOrSlot === 'symbol' ? synchronousOrSlot : maybeSlot;
	const synchronous = typeof synchronousOrSlot === 'function' ? synchronousOrSlot : undefined;
	const tracked = useRef(new Map<string | symbol, any>(), subSlot(slot, 'tracked'));
	const forceUpdate = useForceUpdate(subSlot(slot, 'force'));

	useIsomorphicLayoutEffect(
		() => {
			if (!target) {
				tracked.current.clear();
				return;
			}
			return effect(() => {
				let stale = false;
				let sync = false;
				for (const [key, previous] of tracked.current) {
					const value = untracked(() => previous);
					const latestValue = (target as any)[key];
					if (value !== latestValue) {
						stale = true;
						tracked.current.set(key, latestValue);
						sync = synchronous?.(key as keyof NonNullable<T>, value, latestValue) ?? false;
					}
				}
				if (stale) {
					if (sync) queueMicrotask(() => flushSync(forceUpdate));
					else forceUpdate();
				}
			});
		},
		[target],
		subSlot(slot, 'effect'),
	);

	return useMemo(
		() =>
			target
				? new Proxy(target, {
						get(value, key) {
							const current = (value as any)[key];
							tracked.current.set(key, current);
							return current;
						},
					})
				: target,
		[target],
		subSlot(slot, 'memo'),
	);
}

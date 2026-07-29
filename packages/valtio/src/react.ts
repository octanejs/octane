import { useCallback, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'octane';
import { createProxy as createProxyToCompare, isChanged } from 'proxy-compare';
import { snapshot, subscribe } from 'valtio/vanilla';
import type { Snapshot } from 'valtio/vanilla';
import { subSlot } from './internal';

export type UseSnapshotOptions = {
	sync?: boolean;
};

const targetCache = new WeakMap<object, unknown>();

export function useSnapshot<T extends object>(
	proxyObject: T,
	...rest: [options?: UseSnapshotOptions, slot?: symbol]
): Snapshot<T> {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	const options = (typeof rest[0] === 'object' ? rest[0] : undefined) as
		UseSnapshotOptions | undefined;
	const notifyInSync = options?.sync;

	const affected = useMemo(
		() => new WeakMap<object, unknown>(),
		[proxyObject],
		subSlot(slot, 'affected'),
	);
	const lastSnapshot = useRef<Snapshot<T> | undefined>(undefined, subSlot(slot, 'last-snapshot'));
	let inRender = true;

	const currSnapshot = useSyncExternalStore(
		useCallback(
			(callback) => {
				const unsubscribe = subscribe(proxyObject, callback, notifyInSync);
				callback();
				return unsubscribe;
			},
			[proxyObject, notifyInSync],
			subSlot(slot, 'subscribe'),
		),
		() => {
			const nextSnapshot = snapshot(proxyObject);
			try {
				if (
					!inRender &&
					lastSnapshot.current &&
					!isChanged(lastSnapshot.current, nextSnapshot, affected, new WeakMap())
				) {
					return lastSnapshot.current;
				}
			} catch {
				// Accessed promises and other throwing values must not break snapshots.
			}
			return nextSnapshot;
		},
		() => snapshot(proxyObject),
		subSlot(slot, 'external-store'),
	);

	inRender = false;
	useLayoutEffect(
		() => {
			lastSnapshot.current = currSnapshot;
		},
		null,
		subSlot(slot, 'last-snapshot-effect'),
	);

	const proxyCache = useMemo(
		() => new WeakMap<object, unknown>(),
		[],
		subSlot(slot, 'proxy-cache'),
	);
	return createProxyToCompare(currSnapshot, affected, proxyCache, targetCache) as Snapshot<T>;
}

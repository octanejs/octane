import { useLayoutEffect } from 'octane';
import { subSlot } from '../internal';
import { useSnapshot } from '../react';
import type { UseSnapshotOptions } from '../react';

const DUMMY_SYMBOL = Symbol();

export function useProxy<T extends object>(
	proxyObject: T,
	...rest: [options?: UseSnapshotOptions, slot?: symbol]
): T {
	const tail = rest[rest.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	const options = (typeof rest[0] === 'object' ? rest[0] : undefined) as
		UseSnapshotOptions | undefined;
	const currentSnapshot = useSnapshot(proxyObject, options, subSlot(slot, 'snapshot')) as T;

	// Register an empty access so a component that reads only in callbacks does
	// not subscribe to every property.
	currentSnapshot[DUMMY_SYMBOL as keyof T];

	let isRendering = true;
	useLayoutEffect(
		() => {
			isRendering = false;
		},
		null,
		subSlot(slot, 'render-effect'),
	);

	return new Proxy(proxyObject, {
		get(target, property) {
			return isRendering ? currentSnapshot[property as keyof T] : target[property as keyof T];
		},
	});
}

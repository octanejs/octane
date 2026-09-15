import { observable } from 'mobx';
import type { AnnotationsMap } from 'mobx';
import { useState } from 'octane';
import { subSlot } from './internal';

export function useLocalObservable<TStore extends Record<string, unknown>>(
	initializer: () => TStore,
	annotations?: AnnotationsMap<TStore, never>,
): TStore;
export function useLocalObservable<TStore extends Record<string, unknown>>(
	initializer: () => TStore,
	annotations?: AnnotationsMap<TStore, never> | symbol,
	...rest: [slot?: symbol]
): TStore {
	const slot =
		typeof rest[rest.length - 1] === 'symbol'
			? rest[rest.length - 1]
			: typeof annotations === 'symbol'
				? annotations
				: undefined;
	return useState(
		() =>
			observable(initializer(), typeof annotations === 'symbol' ? undefined : annotations, {
				autoBind: true,
			}),
		subSlot(slot, 'local-observable'),
	)[0];
}

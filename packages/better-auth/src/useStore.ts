import { useCallback, useRef, useSyncExternalStore } from 'octane';
import { listenKeys } from 'nanostores';
import type { Store, StoreValue } from 'nanostores';
import { readSlot, subSlot } from './internal';

type StoreKeys<T> = T extends { setKey: (key: infer Key, value: any) => unknown } ? Key : never;

export interface UseStoreOptions<SomeStore> {
	deps?: readonly unknown[];
	keys?: StoreKeys<SomeStore>[];
}

export function useStore<SomeStore extends Store>(
	store: SomeStore,
	...rest: [options?: UseStoreOptions<SomeStore>, slot?: symbol]
): StoreValue<SomeStore> {
	const slot = readSlot(rest);
	const options = (typeof rest[0] === 'object' ? rest[0] : undefined) as
		UseStoreOptions<SomeStore> | undefined;
	const keys = options?.keys;
	const deps = options?.deps ?? [store, keys];
	const snapshotRef = useRef<{ store: SomeStore; value: StoreValue<SomeStore> } | undefined>(
		undefined,
		subSlot(slot, 'snapshot'),
	);
	if (snapshotRef.current?.store !== store) {
		snapshotRef.current = { store, value: store.get() };
	}

	const subscribe = useCallback(
		(onChange: () => void) => {
			const emitChange = (value: StoreValue<SomeStore>) => {
				if (Object.is(snapshotRef.current?.value, value)) return;
				snapshotRef.current = { store, value };
				onChange();
			};

			emitChange(store.value);
			if (keys?.length) {
				return listenKeys(store as any, keys, emitChange);
			}
			return store.listen(emitChange);
		},
		deps as unknown[],
		subSlot(slot, 'subscribe'),
	);

	const getSnapshot = useCallback(
		() => snapshotRef.current!.value,
		[store],
		subSlot(slot, 'get-snapshot'),
	);

	return useSyncExternalStore(subscribe, getSnapshot, getSnapshot, subSlot(slot, 'external-store'));
}

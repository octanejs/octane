import { useRef } from 'octane';

import { subSlot } from './internal';

export function useRefs<T>(refs: T, slot?: symbol) {
	const ref = useRef(refs, subSlot(slot, 'refs'));
	return {
		get<K extends keyof T>(key: K): T[K] {
			return ref.current[key];
		},
		set<K extends keyof T>(key: K, value: T[K]) {
			ref.current[key] = value;
		},
	};
}

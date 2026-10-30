import { useLayoutEffect } from 'octane';

import type { ListenerType, ListenerTypeValueMap } from '../state/state.ts';
import { listen$, useStateContext } from '../state/state.ts';

export function useValueListener$<T extends ListenerType>(
	key: T,
	callback: (value: ListenerTypeValueMap[T]) => void,
) {
	const ctx = useStateContext();
	useLayoutEffect(() => {
		const unsubscribe = listen$(ctx, key, (value) => {
			callback(value);
		});
		return unsubscribe;
	}, [callback, ctx, key]);
}

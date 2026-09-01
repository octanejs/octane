import { Context, useContext } from '../react-shim.js';
import { StoreApi, useStore } from '@octanejs/zustand';
import { useShallow } from '@octanejs/zustand/shallow';

type ExtractState<S> = S extends {
	getState: () => infer T;
}
	? T
	: never;

/**
 * Use a Zustand store via context
 */
export function useContextStore<T, U>(
	context: Context<StoreApi<T>>,
	selector: (s: ExtractState<StoreApi<T>>) => U,
): U {
	const store = useContext(context);

	if (!store) {
		throw new Error('useContextStore must be used inside context');
	}

	return useStore<StoreApi<T>, U>(store, useShallow(selector));
}

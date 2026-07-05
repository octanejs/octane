// Ported from .base-ui/packages/utils/src/store/useStore.ts, octane-adapted. React's version has
// a fiber-instance "fastHooks" optimization + a legacy `useSyncExternalStoreWithSelector` shim for
// concurrent rendering. octane renders synchronously (a render always commits), so — exactly like
// `@octanejs/zustand/traditional` — we build directly on octane's real `useSyncExternalStore`: a
// ref caches the last selection and `getSnapshot` returns that SAME reference while the selection
// is Object.is-equal, so useSyncExternalStore's own equality check bails out the re-render.
//
// SLOT: plain-`.ts` hook; the caller threads a slot (the ref + the store subscription each derive
// a distinct sub-slot).
import { useSyncExternalStore, useRef } from 'octane';
import { subSlot } from '../../internal';
import type { ReadonlyStore } from './Store';

interface SelectionCell<U> {
	hasValue: boolean;
	value: U | undefined;
}

export function useStore<State, Value>(
	store: ReadonlyStore<State>,
	selector: (state: State, a1?: unknown, a2?: unknown, a3?: unknown) => Value,
	slot: symbol | undefined,
	a1?: unknown,
	a2?: unknown,
	a3?: unknown,
): Value {
	const cache = useRef<SelectionCell<Value>>(
		{ hasValue: false, value: undefined },
		subSlot(slot, 'sel'),
	);

	const select = (state: State): Value => {
		const next = selector(state, a1, a2, a3);
		const c = cache.current;
		if (c.hasValue && Object.is(c.value as Value, next)) {
			return c.value as Value;
		}
		c.hasValue = true;
		c.value = next;
		return next;
	};

	return useSyncExternalStore(
		store.subscribe,
		() => select(store.getSnapshot()),
		() => select(store.getSnapshot()),
		subSlot(slot, 'uses'),
	);
}

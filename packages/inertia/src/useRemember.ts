import { router } from '@inertiajs/core';
import { useEffect, useState } from 'octane';

type SetStateAction<State> = State | ((previousState: State) => State);
type Dispatch<Action> = (action: Action) => void;
type MutableRefObject<Value> = { current: Value };

const stateSlotCache = new Map<string, symbol>();
const effectSlotCache = new Map<string, symbol>();

function slotForRememberKey(
	cache: Map<string, symbol>,
	label: string,
	key: string | undefined,
): symbol {
	const cacheKey = key ?? '';
	let slot = cache.get(cacheKey);
	if (!slot) {
		slot = Symbol(`Inertia.useRemember.${label}:${cacheKey}`);
		cache.set(cacheKey, slot);
	}
	return slot;
}

export default function useRemember<State>(
	initialState: State,
	key?: string | symbol,
	excludeKeysRef?: MutableRefObject<string[]> | symbol,
): [State, Dispatch<SetStateAction<State>>] {
	key = typeof key === 'symbol' ? undefined : key;
	excludeKeysRef = typeof excludeKeysRef === 'symbol' ? undefined : excludeKeysRef;
	const stateSlot = slotForRememberKey(stateSlotCache, 'state', key);
	const effectSlot = slotForRememberKey(effectSlotCache, 'effect', key);
	const [state, setState] = useState(function () {
		const restored = router.restore(key) as State;

		return restored !== undefined ? restored : initialState;
	}, stateSlot);

	useEffect(
		function () {
			const keys = excludeKeysRef?.current;
			if (keys && keys.length > 0 && typeof state === 'object' && state !== null) {
				const filtered = { ...state } as Record<string, unknown>;
				keys.forEach(function (k) {
					delete filtered[k];
				});
				router.remember(filtered, key);
			} else {
				router.remember(state, key);
			}
		},
		[state, key],
		effectSlot,
	);

	return [state, setState];
}

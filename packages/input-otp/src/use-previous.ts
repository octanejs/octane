import { useEffect, useRef } from 'octane';

const childSlots = new Map<symbol, Map<string, symbol>>();

function subSlot(slot: symbol | undefined, key: string): symbol | undefined {
	if (!slot) return undefined;
	let slots = childSlots.get(slot);
	if (!slots) {
		slots = new Map();
		childSlots.set(slot, slots);
	}
	let child = slots.get(key);
	if (!child) {
		child = Symbol(`input-otp:usePrevious:${key}`);
		slots.set(key, child);
	}
	return child;
}

/** Returns the value observed during the previous committed render. */
export function usePrevious<T>(value: T, slot?: symbol): T | undefined {
	const ref = useRef<T | undefined>(undefined, subSlot(slot, 'ref'));
	useEffect(
		() => {
			ref.current = value;
		},
		[value],
		subSlot(slot, 'effect'),
	);
	return ref.current;
}

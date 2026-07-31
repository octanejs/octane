const childSlots = new Map<symbol, Map<string, symbol>>();
const childSlotNamespace = '@octanejs/usehooks-ts';

export function splitSlot<T>(args: T[]): { args: T[]; slot: symbol | undefined } {
	const tail = args.at(-1);
	return typeof tail === 'symbol'
		? { args: args.slice(0, -1), slot: tail }
		: { args, slot: undefined };
}

export function subSlot(slot: symbol | undefined, key: string): symbol | undefined {
	if (!slot) return undefined;
	let slots = childSlots.get(slot);
	if (!slots) {
		slots = new Map();
		childSlots.set(slot, slots);
	}
	let child = slots.get(key);
	if (!child) {
		child = Symbol.for(`${childSlotNamespace}:${slot.description ?? ''}:${key}`);
		slots.set(key, child);
	}
	return child;
}

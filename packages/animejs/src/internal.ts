const subSlotCache = new Map<symbol, Map<string, symbol>>();

export function splitSlot<T>(args: T[]): [T[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let slots = subSlotCache.get(slot);
	if (slots === undefined) {
		slots = new Map();
		subSlotCache.set(slot, slots);
	}
	let child = slots.get(tag);
	if (child === undefined) {
		child = Symbol.for(`${slot.description ?? ''}:animejs:${tag}`);
		slots.set(tag, child);
	}
	return child;
}

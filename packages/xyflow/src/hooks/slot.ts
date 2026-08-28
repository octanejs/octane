const subSlotCache = new Map<symbol, Map<string, symbol>>();

export function resolveHookSlot(rest: unknown[]): symbol | undefined {
	const tail = rest[rest.length - 1];
	return typeof tail === 'symbol' ? (tail as symbol) : undefined;
}

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let derived = byTag.get(tag);
	if (derived === undefined) {
		derived = Symbol((slot.description ?? '') + ':' + tag);
		byTag.set(tag, derived);
	}
	return derived;
}

export function withoutSlot<T>(value: T | symbol | undefined): T | undefined {
	return typeof value === 'symbol' ? undefined : value;
}

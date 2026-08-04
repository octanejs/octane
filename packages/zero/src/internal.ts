const subSlotCache = new Map<symbol, Map<string, symbol>>();

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let result = byTag.get(tag);
	if (result === undefined) {
		byTag.set(tag, (result = Symbol.for((slot.description ?? '') + ':' + tag)));
	}
	return result;
}

export function stringCompare(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

const subSlotCache = new Map<symbol, Map<string, symbol>>();

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let value = byTag.get(tag);
	if (value === undefined) {
		value = Symbol.for(`@octanejs/vaul:${slot.description ?? ''}:${tag}`);
		byTag.set(tag, value);
	}
	return value;
}

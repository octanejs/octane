const subSlotCache = new Map<symbol, Map<string, symbol>>();

export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) {
		byTag = new Map();
		subSlotCache.set(slot, byTag);
	}
	let result = byTag.get(tag);
	if (result === undefined) {
		result = Symbol.for(`${slot.description ?? ''}:@octanejs/opentui:${tag}`);
		byTag.set(tag, result);
	}
	return result;
}

export function splitSlot(args: readonly unknown[]): [readonly unknown[], symbol | undefined] {
	const tail = args.at(-1);
	return typeof tail === 'symbol' ? [args.slice(0, -1), tail] : [args, undefined];
}

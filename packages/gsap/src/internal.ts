const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareSlotCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareSlotCache.get(tag);
		if (bare === undefined) bareSlotCache.set(tag, (bare = Symbol.for('@octanejs/gsap:' + tag)));
		return bare;
	}

	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let derived = byTag.get(tag);
	if (derived === undefined) {
		byTag.set(tag, (derived = Symbol.for((slot.description ?? '@octanejs/gsap') + ':' + tag)));
	}
	return derived;
}

export function splitSlot(args: unknown[]): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

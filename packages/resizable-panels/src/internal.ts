const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareTagCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareTagCache.get(tag);
		if (bare === undefined)
			bareTagCache.set(tag, (bare = Symbol.for(`react-resizable-panels:${tag}`)));
		return bare;
	}

	let tags = subSlotCache.get(slot);
	if (tags === undefined) subSlotCache.set(slot, (tags = new Map()));
	let child = tags.get(tag);
	if (child === undefined) tags.set(tag, (child = Symbol.for(`${slot.description ?? ''}:${tag}`)));
	return child;
}

export function splitSlot(args: unknown[]): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

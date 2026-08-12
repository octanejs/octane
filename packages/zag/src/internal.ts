const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareSlotCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareSlotCache.get(tag);
		if (bare === undefined) {
			bare = Symbol.for(`@octanejs/zag:${tag}`);
			bareSlotCache.set(tag, bare);
		}
		return bare;
	}

	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) {
		byTag = new Map();
		subSlotCache.set(slot, byTag);
	}

	let child = byTag.get(tag);
	if (child === undefined) {
		child = Symbol.for(`${slot.description ?? ''}:${tag}`);
		byTag.set(tag, child);
	}
	return child;
}

export function splitSlot(args: unknown[]): [unknown[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

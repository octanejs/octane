const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareTagCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareTagCache.get(tag);
		if (bare === undefined) {
			bare = Symbol.for(`@octanejs/valtio:${tag}`);
			bareTagCache.set(tag, bare);
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

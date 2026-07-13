// The package ships raw TypeScript. Public custom hooks receive the compiler's
// trailing call-site slot and derive distinct slots for every base hook they
// compose. This keeps multiple draggable/sortable hooks in one component
// isolated while preserving upstream's stable hook identities.
const subSlotCache = new Map<symbol, Map<string, symbol>>();

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

// Slot mechanics for @octanejs/i18next's published plain-JS hook layer.
// Compiled callers pass a call-site Symbol as the trailing argument; each
// composed base hook gets a deterministic sub-slot. Tag-only symbols cover
// renderHook and other slotless callers while remaining distinct inside the
// runtime's ambient withSlot path.
const subSlotCache = new Map();
const bareTagCache = new Map();

export function subSlot(slot, tag) {
	if (slot === undefined) {
		let bare = bareTagCache.get(tag);
		if (bare === undefined) bareTagCache.set(tag, (bare = Symbol.for(`:${tag}`)));
		return bare;
	}
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let symbol = byTag.get(tag);
	if (symbol === undefined) {
		symbol = Symbol.for(`${slot.description ?? ''}:${tag}`);
		byTag.set(tag, symbol);
	}
	return symbol;
}

export function splitSlot(args) {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? tail : undefined;
	return [slot === undefined ? args : args.slice(0, -1), slot];
}

const componentSlots = new Map();

// A fixed symbol is safe for a plain-JS component because every component
// instance owns an independent hook scope.
export function S(tag) {
	let symbol = componentSlots.get(tag);
	if (symbol === undefined) {
		symbol = Symbol.for(`@octanejs/i18next:${tag}`);
		componentSlots.set(tag, symbol);
	}
	return symbol;
}

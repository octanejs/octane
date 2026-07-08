// Slot mechanics shared by the binding's plain-`.ts` hooks (same helper as
// @octanejs/query). The octane compiler injects a per-call-site Symbol slot into
// every hook call in compiled files; these binding files are NOT compiled, so a
// hook here receives the caller's slot as its trailing argument and derives a
// distinct sub-slot for each base hook it composes.

// Memoized: subSlot runs on EVERY hook call every render; the cache returns the
// identical Symbol.for-interned value without the concat + registry lookup.
const subSlotCache = new Map<symbol, Map<string, symbol>>();
// Tag-only symbols for the slotless-caller case (see below).
const bareTagCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	// No inherited slot (the caller was NOT compiled — e.g. a vendored wrapper
	// hook): return a stable TAG-ONLY symbol rather than undefined. The runtime
	// combines it with the ambient withSlot path, so sibling base hooks inside
	// one composed hook stay DISTINCT per tag. Returning undefined here made
	// them all resolve to the bare path — one shared slot, state collision.
	if (slot === undefined) {
		let bare = bareTagCache.get(tag);
		if (bare === undefined) bareTagCache.set(tag, (bare = Symbol.for(':' + tag)));
		return bare;
	}
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let sym = byTag.get(tag);
	if (sym === undefined) byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':' + tag)));
	return sym;
}

// Split the compiler-injected trailing slot off a hook's runtime args, returning
// the user args (everything before it) and the slot.
export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	return [slot !== undefined ? args.slice(0, -1) : args, slot];
}

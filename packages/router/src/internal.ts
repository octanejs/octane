// Slot mechanics shared by the binding's plain-`.ts` hooks (copied from
// @octane-ts/query). The octane compiler injects a per-call-site Symbol slot into
// every hook call in `.tsrx`/`.tsx`, but these binding files are NOT compiled — so
// a hook here receives the caller's slot as its trailing argument and derives a
// distinct sub-slot for each base hook it composes.

// Derive a stable, distinct sub-slot from a wrapper's slot, namespaced per hook so
// composing multiple base hooks gives each its own identity.
export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':' + tag) : undefined;
}

// Split the compiler-injected (or .ts-forwarded) trailing slot off a hook's args,
// returning the user args (everything before it) and the slot.
export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	return [slot !== undefined ? args.slice(0, -1) : args, slot];
}

// Slot mechanics for @octanejs/tiptap's plain-`.ts` hooks. The Octane
// compiler injects a per-call-site Symbol as the final argument of every
// custom-hook call. Binding hooks split that argument from their public
// options and derive one stable sub-slot for each base hook they compose.

const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareSlotCache = new Map<string, symbol>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareSlotCache.get(tag);
		if (bare === undefined) {
			bare = Symbol.for(`@octanejs/tiptap:${tag}`);
			bareSlotCache.set(tag, bare);
		}
		return bare;
	}

	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) {
		byTag = new Map();
		subSlotCache.set(slot, byTag);
	}

	let result = byTag.get(tag);
	if (result === undefined) {
		result = Symbol.for(`${slot.description ?? ''}:@octanejs/tiptap:${tag}`);
		byTag.set(tag, result);
	}
	return result;
}

/** Split a compiler-owned trailing slot from a custom hook's user arguments. */
export function splitSlot(args: readonly unknown[]): [readonly unknown[], symbol | undefined] {
	const tail = args.at(-1);
	return typeof tail === 'symbol' ? [args.slice(0, -1), tail] : [args, undefined];
}

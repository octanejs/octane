// Octane appends a compiler-owned hook slot to public hook calls. Binding
// internals derive stable child slots so composed hooks and sibling
// virtualizers never share state.
const subSlotCache = new Map<symbol, Map<string, symbol>>();
const bareTagCache = new Map<string, symbol>();

export function getSlot(args: unknown[]): symbol | undefined {
	const slot = args.at(-1);
	return typeof slot === 'symbol' ? slot : undefined;
}

export function getPublicArgument(args: unknown[], index: number): unknown {
	const publicLength = getSlot(args) === undefined ? args.length : args.length - 1;
	return index < publicLength ? args[index] : undefined;
}

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (slot === undefined) {
		let bare = bareTagCache.get(tag);
		if (bare === undefined) {
			bare = Symbol.for(`@octanejs/window:${tag}`);
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

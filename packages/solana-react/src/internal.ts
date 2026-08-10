const slots = new Map<symbol, Map<string, symbol>>();

export function subSlot(slot: symbol | undefined, tag: string): symbol {
	if (!slot) return Symbol.for(`@octanejs/solana-react:${tag}`);
	let children = slots.get(slot);
	if (!children) slots.set(slot, (children = new Map()));
	let child = children.get(tag);
	if (!child) {
		children.set(
			tag,
			(child = Symbol.for(`${slot.description ?? '@octanejs/solana-react'}:${tag}`)),
		);
	}
	return child;
}

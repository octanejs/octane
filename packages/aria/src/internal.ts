// Slot mechanics for @octanejs/aria's plain-`.ts` hooks. octane's compiler
// injects a per-call-site Symbol slot as the trailing arg of every hook call in a
// compiled `.tsx`/`.tsrx`. These hook files are published source (consumed from
// node_modules, where the auto-slotting pass is skipped), so each PUBLIC hook
// receives the caller's slot as its trailing argument and derives a distinct
// sub-slot for every base hook it composes. Public hooks keep their react-aria
// parameter types and absorb the injected slot through a trailing rest param:
//   export function useHover(props: HoverProps, ...args: any[]): HoverResult {
//     const slot = restSlot(args) ?? S('useHover');
// (Same pattern as the other @octanejs bindings; see packages/floating-ui.)

// Derive a stable, distinct sub-slot from a wrapper's slot, namespaced per hook.
// Memoized: subSlot runs on EVERY hook call every render, and the naive form
// pays a string concat + global symbol-registry lookup each time. The cache is
// keyed by the slot symbol itself; the minted value is byte-identical to the
// uncached Symbol.for result, so identity is preserved across HMR re-evals and
// the per-package copies of this helper. Key universe is bounded: slots are
// per-call-site module constants (never minted per render).
const subSlotCache = new Map<symbol, Map<string, symbol>>();
export function subSlot(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subSlotCache.get(slot);
	if (byTag === undefined) subSlotCache.set(slot, (byTag = new Map()));
	let sym = byTag.get(tag);
	if (sym === undefined) byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':' + tag)));
	return sym;
}

// Split the compiler-injected trailing slot off a hook's args. Needed when a
// public hook takes optional user args, so the slot can't be located positionally.
export function splitSlot(args: any[]): [any[], symbol | undefined] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	return [slot !== undefined ? args.slice(0, -1) : args, slot];
}

// The common public-hook form: all REQUIRED user params are declared, so the
// rest array contains at most the injected slot (plus possibly trailing
// optional user args — callers pass those before the injected slot, so the
// symbol is always last).
export function restSlot(args: any[]): symbol | undefined {
	const tail = args[args.length - 1];
	return typeof tail === 'symbol' ? (tail as symbol) : undefined;
}

// A stable per-call-site slot for the binding's plain-`.ts` COMPONENTS (written
// with createElement, not compiled, so they get no auto-injected slots). A
// component runs in its OWN per-instance scope (componentSlot), so a globally
// stable Symbol.for(tag) resolves to a distinct slot per instance. Pass S('tag')
// as the slot to base hooks; sub-hooks derive their own sub-slots from its
// description.
const sCache = new Map<string, symbol>();
export function S(tag: string): symbol {
	let sym = sCache.get(tag);
	if (sym === undefined) sCache.set(tag, (sym = Symbol.for('@octanejs/aria:' + tag)));
	return sym;
}

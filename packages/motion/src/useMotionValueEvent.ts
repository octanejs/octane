// `useMotionValueEvent(value, event, callback)` — subscribe `callback` to one of a
// MotionValue's events ('change' | 'animationStart' | 'animationComplete' |
// 'animationCancel') for the component's lifetime. Re-subscribes if value/event/
// callback identity changes; unsubscribes on unmount. Reuses MotionValue's `on`,
// which returns the unsubscribe fn (and, for 'change', stops idle animations).
import { useInsertionEffect } from 'octane';

// Memoized — runs per hook call per render; the cache returns the identical
// Symbol.for-interned value without the concat + registry lookup.
const subCache = new Map<symbol, Map<string, symbol>>();
function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subCache.get(slot);
	if (byTag === undefined) subCache.set(slot, (byTag = new Map()));
	let sym = byTag.get(tag);
	if (sym === undefined)
		byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':umve:' + tag)));
	return sym;
}

export function useMotionValueEvent(...args: any[]): void {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	const value = args[0];
	const event = args[1] as string;
	const callback = args[2] as (latest: any) => void;

	// `value.on(event, cb)` returns the unsubscribe fn → octane uses it as cleanup.
	// Like Framer Motion, subscribe in the INSERTION phase (before layout/passive
	// effects) so a descendant that sets `value` in its own effect can't fire a
	// change before this subscription exists (octane passive effects run child-first).
	useInsertionEffect(
		() => value.on(event, callback),
		[value, event, callback],
		sub(slot, 'effect'),
	);
}

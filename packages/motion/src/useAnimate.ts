// `useAnimate` — imperative, scoped animations. Returns `[scope, animate]`: attach
// `scope` to an element (`ref={scope}`), then `animate(scope.current, …)` or
// `animate('selector', …)` (resolved within the scope). Reuses motion's
// `createScopedAnimate`; the binding just provides a stable scope object + cleanup.
import { createScopedAnimate } from 'motion';
import { useState, useEffect } from 'octane';

// Memoized — runs per hook call per render; the cache returns the identical
// Symbol.for-interned value without the concat + registry lookup.
const subCache = new Map<symbol, Map<string, symbol>>();
function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subCache.get(slot);
	if (byTag === undefined) subCache.set(slot, (byTag = new Map()));
	let sym = byTag.get(tag);
	if (sym === undefined)
		byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':ua:' + tag)));
	return sym;
}

export function useAnimate(...args: any[]): [any, any] {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;

	// The scope IS the ref: octane sets `scope.current` to the element when it's
	// passed as `ref={scope}`, and `scope.animations` tracks running animations so
	// they can be stopped on unmount.
	const [scope] = useState(() => ({ current: null, animations: [] }) as any, sub(slot, 'scope'));
	const [animate] = useState(() => createScopedAnimate({ scope }), sub(slot, 'animate'));

	useEffect(
		() => () => {
			scope.animations.forEach((animation: any) => animation.stop());
			scope.animations.length = 0;
		},
		[],
		sub(slot, 'clean'),
	);

	return [scope, animate];
}

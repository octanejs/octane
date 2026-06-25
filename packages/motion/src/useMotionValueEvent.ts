// `useMotionValueEvent(value, event, callback)` — subscribe `callback` to one of a
// MotionValue's events ('change' | 'animationStart' | 'animationComplete' |
// 'animationCancel') for the component's lifetime. Re-subscribes if value/event/
// callback identity changes; unsubscribes on unmount. Reuses MotionValue's `on`,
// which returns the unsubscribe fn (and, for 'change', stops idle animations).
import { useInsertionEffect } from 'octane';

function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':umve:' + tag) : undefined;
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

// `useSpring(source, options?)` — a spring-backed MotionValue (reuses motion's
// `attachFollow` engine). Two forms:
//   1) useSpring(mv, opts)      — output springs toward `mv` as it changes (follow).
//   2) useSpring(initial, opts) — a settable spring; `value.set(target)` springs
//      toward `target` over frames (`value.jump(v)` snaps instantly).
// Bind the returned MotionValue to a `motion.*` element via `style`, or read it
// imperatively. Returns the SAME stable MotionValue across renders.
import { motionValue, attachFollow } from 'motion';
import { useState, useInsertionEffect } from 'octane';
import { isMotionValue } from './useMotionValue';

// Memoized — runs per hook call per render; the cache returns the identical
// Symbol.for-interned value without the concat + registry lookup.
const subCache = new Map<symbol, Map<string, symbol>>();
function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	if (slot === undefined) return undefined;
	let byTag = subCache.get(slot);
	if (byTag === undefined) subCache.set(slot, (byTag = new Map()));
	let sym = byTag.get(tag);
	if (sym === undefined)
		byTag.set(tag, (sym = Symbol.for((slot.description ?? '') + ':usp:' + tag)));
	return sym;
}

export interface SpringOptions {
	stiffness?: number;
	damping?: number;
	mass?: number;
	duration?: number;
	bounce?: number;
	visualDuration?: number;
	velocity?: number;
	restSpeed?: number;
	restDelta?: number;
	// Jump (don't animate) on the first source change.
	skipInitialAnimation?: boolean;
}

export function useSpring(source: any, ...args: any[]): any {
	const tail = args[args.length - 1];
	const slot = typeof tail === 'symbol' ? (tail as symbol) : undefined;
	// First non-slot arg after `source` is the options object.
	const options: SpringOptions =
		args.length && typeof args[0] === 'object' && args[0] !== null ? args[0] : {};

	// Seed the value from the source (matching motion's followValue).
	const [value] = useState(
		() => motionValue(isMotionValue(source) ? source.get() : source),
		sub(slot, 'mv'),
	);

	// `attachFollow` wires both forms and RETURNS the correct cleanup:
	//  - settable: an attach() interceptor that springs on every `.set()`; cleanup
	//    stops the running animation.
	//  - follow:   the above PLUS a `source.on('change')` subscription; cleanup
	//    removes the subscription. So returning it gives octane correct teardown.
	// Subscribe in the INSERTION phase (like Framer's useFollowValue) so the follow
	// subscription exists before any descendant can mutate `source` in its own effect.
	useInsertionEffect(
		() => attachFollow(value, source, { type: 'spring', ...options }),
		[JSON.stringify(options)],
		sub(slot, 'attach'),
	);

	return value;
}

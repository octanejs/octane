// `useSpring(source, options?)` — a spring-backed MotionValue (reuses motion's
// `attachFollow` engine). Two forms:
//   1) useSpring(mv, opts)      — output springs toward `mv` as it changes (follow).
//   2) useSpring(initial, opts) — a settable spring; `value.set(target)` springs
//      toward `target` over frames (`value.jump(v)` snaps instantly).
// Bind the returned MotionValue to a `motion.*` element via `style`, or read it
// imperatively. Returns the SAME stable MotionValue across renders.
import { motionValue, attachFollow } from 'motion';
import { useState, useInsertionEffect } from 'octane-ts';
import { isMotionValue } from './useMotionValue';

function sub(slot: symbol | undefined, tag: string): symbol | undefined {
	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':usp:' + tag) : undefined;
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

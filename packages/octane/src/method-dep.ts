/**
 * Runtime discriminator for compiler-inferred method-call dependencies.
 *
 * When a hook's dependency list is inferred and the callback contains a
 * one-level method call `root.m(...)`, the call reads two values: the function
 * `root.m` and the receiver `root` that it receives as `this`. Neither static
 * choice of dependency value is correct for every program:
 *
 * - the member value `root.m` misses receiver changes whenever the method reads
 *   `this` through a function every receiver shares: an inherited method
 *   (`count.toFixed` is `Number.prototype.toFixed` on every render — issue
 *   #542), or one own function placed on several objects (issue #1788);
 * - the receiver `root` recomputes on every render when `root` is a fresh
 *   container whose own callback is the real dependency (`props.onChange(...)`
 *   with `props` rebuilt by each parent render).
 *
 * The method itself resolves the ambiguity at runtime. An own arrow function
 * binds `this` lexically, so no receiver can reach its body and its identity
 * is the whole dependency. Any other method may read `this`, so the call
 * tracks its receiver, as React Compiler does for every method call. The
 * results feed the ordinary `Object.is` slot comparison. An arrow and a
 * receiver are unequal values, so a method that changes kind across renders
 * recomputes. Replacing a non-arrow method in place on the same receiver is a
 * mutation, which inferred dependencies do not witness.
 *
 * A property that is absent altogether (`props.onReady?.()` with no `onReady`
 * passed) contributes `undefined` — the same stable value the plain member
 * read produced — rather than the receiver, so an optional call on a fresh
 * container does not re-run its hook on every render while the callback stays
 * unprovided.
 *
 * Primitives skip the object probes entirely — they cannot carry own
 * properties and the guard avoids boxing them. `null`/`undefined` receivers
 * (the optional call spellings `root?.m(...)` / `root.m?.(...)`) also fall
 * through to the receiver branch instead of throwing. Compiled dependency
 * arrays evaluate this helper on every render. The ordinary method-call path
 * stays allocation-free except for the source text of an own function, which
 * is the only reflection that tells an arrow from a method.
 * Guarded reads instead inspect an own descriptor so data properties retain
 * precise dependencies without invoking accessors. A guarded plain read
 * (`read`) calls nothing, so an own function value is its own dependency there.
 * Accessors and inherited properties track the receiver. A failed reflection
 * probe also falls back to the receiver, leaving exceptions in authored code.
 * Module-local nullish markers distinguish a failed receiver read from a
 * successful read whose own data value is null or undefined.
 */
import { hasOwnProp } from './has-own.js';

const guardedNullReceiver = Symbol();
const guardedUndefinedReceiver = Symbol();

export function __methodDep(
	receiver: unknown,
	name: string,
	guarded = false,
	read = false,
): unknown {
	if (guarded && receiver == null) {
		return receiver === null ? guardedNullReceiver : guardedUndefinedReceiver;
	}
	if ((typeof receiver !== 'object' || receiver === null) && typeof receiver !== 'function') {
		return receiver;
	}
	if (guarded) {
		try {
			const descriptor = Object.getOwnPropertyDescriptor(receiver, name);
			if (descriptor) {
				if (!('value' in descriptor)) return receiver;
				return read ? descriptor.value : ownMethodDep(receiver, descriptor.value);
			}
			return name in receiver ? receiver : undefined;
		} catch {
			return receiver;
		}
	}
	if (hasOwnProp.call(receiver, name)) {
		return ownMethodDep(receiver, (receiver as Record<string, unknown>)[name]);
	}
	return name in (receiver as object) ? receiver : undefined;
}

// An arrow's source text starts with its parameters, after an optional
// `async`: a parenthesized list, or one identifier followed by `=>`. Every
// other function starts with `function`, `class`, or a method's property key,
// and a bound, native, or proxied function reads as `function … [native code]`.
// Anything this does not recognize counts as a method, which only costs a
// spurious recompute. A method named `async` also reads as `async(`, so only a
// parenthesized arrow skips the name check.
const ARROW_HEAD = /^(?:async\s*)?(?:\(|[\w$]+\s*=>)/;

function ownMethodDep(receiver: object, method: unknown): unknown {
	if (typeof method !== 'function') return method;
	// A probe that throws (a patched `toString`, a `name` getter) counts as a
	// method, leaving any exception to the authored call.
	try {
		const source = Function.prototype.toString.call(method);
		return ARROW_HEAD.test(source) && (source[0] === '(' || method.name !== 'async')
			? method
			: receiver;
	} catch {
		return receiver;
	}
}

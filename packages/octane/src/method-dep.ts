/**
 * Runtime discriminator for compiler-inferred method-call dependencies.
 *
 * When a hook's dependency list is inferred and the callback contains a
 * one-level method call `root.m(...)`, neither static choice of dependency
 * value is correct for every program:
 *
 * - the member value `root.m` misses receiver changes whenever `m` is an
 *   inherited method (`count.toFixed` is `Number.prototype.toFixed` on every
 *   render, so a memo keyed on it never recomputes — issue #542);
 * - the receiver `root` recomputes on every render when `root` is a fresh
 *   container whose own function property is the real dependency
 *   (`props.onChange(...)` with `props` rebuilt by each parent render).
 *
 * Where the method lives resolves the ambiguity at runtime: an own function
 * property was placed on that specific object and carries the identity that
 * matters, while an inherited method is one function shared by every receiver,
 * leaving the receiver as the only value that can witness a change. Both
 * results feed the ordinary `Object.is` slot comparison; if the property
 * migrates between own and inherited across renders the two branches produce
 * unequal values, so the worst case is a spurious recompute, never a missed
 * one.
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
 * arrays evaluate this helper on every render, so every branch must stay
 * allocation-free.
 */
const hasOwnProp = Object.prototype.hasOwnProperty;

export function __methodDep(receiver: unknown, name: string): unknown {
	if ((typeof receiver !== 'object' || receiver === null) && typeof receiver !== 'function') {
		return receiver;
	}
	if (hasOwnProp.call(receiver, name)) return (receiver as Record<string, unknown>)[name];
	return name in (receiver as object) ? receiver : undefined;
}

import { hasOwnProp } from './has-own.js';

const OCTANE_COMPONENT_FLAGS: unique symbol = Symbol.for('octane.flags.component') as any;

type FlaggedComponent = {
	[OCTANE_COMPONENT_FLAGS]?: number;
};

/** The component owns a load-bearing runtime/SSR boundary range. */
export const COMPONENT_FLAG_BOUNDARY = 1 << 0;

/** Attach an immutable capability bitmask without retaining concrete component identities. */
export function markComponentFlags<T extends Function>(
	component: T,
	flags: number,
	name: string,
	kind?: symbol,
): T {
	Object.defineProperty(component, OCTANE_COMPONENT_FLAGS, { value: flags });
	Object.defineProperty(component, 'name', { value: name, configurable: true });
	if (kind !== undefined) {
		// Introspection must recognize the same built-in in client and server
		// modules, while descriptor hoisting must not brand an unrelated HOC.
		Object.defineProperty(component, kind, {
			get() {
				return this === component;
			},
		});
	}
	return component;
}

/** Test compiler/runtime capability bits on a component from any Octane runtime copy. */
export function hasComponentFlags(component: unknown, flags: number): boolean {
	return (
		typeof component === 'function' &&
		hasOwnProp.call(component, OCTANE_COMPONENT_FLAGS) &&
		((component as FlaggedComponent)[OCTANE_COMPONENT_FLAGS]! & flags) === flags
	);
}

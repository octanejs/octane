import type { OctaneNode } from './runtime.js';

/** Migration wrapper. Octane deliberately does not replay renders or effects. */
export function StrictMode(props: { children?: OctaneNode }): OctaneNode {
	return props.children;
}

/** Updates already share Octane's microtask batch. */
export function unstable_batchedUpdates<A extends unknown[], R>(
	callback: (...args: A) => R,
	...args: A
): R {
	return callback(...args);
}

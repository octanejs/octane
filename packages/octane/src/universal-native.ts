/**
 * Experimental host-neutral universal renderer entry.
 *
 * This subpath deliberately has no dependency on Octane's DOM runtime. Native
 * renderer packages can therefore reuse the universal component, hook,
 * scheduler, transport, and object-driver contracts in JS environments that
 * do not provide DOM globals.
 */
export * from './universal-core.js';

import {
	universalContext,
	type UniversalContext,
	type UniversalContextValue,
	type UniversalRenderable,
} from './universal-core.js';

const CONTEXT_TAG = Symbol.for('octane.context');

export interface NativeUniversalContext<T> extends UniversalContext<T> {
	(props: {
		value: T;
		children?: UniversalRenderable | (() => UniversalRenderable);
	}): UniversalContextValue;
	readonly Provider: NativeUniversalContext<T>;
}

/** Create a context whose Provider can be lowered without a DOM Scope. */
/* @__NO_SIDE_EFFECTS__ */
export function createContext<T>(defaultValue: T): NativeUniversalContext<T> {
	const context = ((props: {
		value: T;
		children?: UniversalRenderable | (() => UniversalRenderable);
	}) => universalContext(context, props.value, props.children)) as NativeUniversalContext<T>;
	Object.defineProperties(context, {
		$$kind: { value: CONTEXT_TAG, enumerable: true },
		defaultValue: { value: defaultValue, enumerable: true },
		Provider: { value: context, enumerable: true },
		$$version: { value: 0, enumerable: true, writable: true },
	});
	return context;
}

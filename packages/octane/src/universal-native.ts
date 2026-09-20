/**
 * Experimental host-neutral universal renderer entry.
 *
 * This subpath deliberately has no dependency on Octane's DOM runtime. Native
 * renderer packages can therefore reuse the universal component, hook,
 * scheduler, transport, and object-driver contracts in JS environments that
 * do not provide DOM globals.
 */
export * from './universal-core.js';
export {
	createSubSlot,
	subSlot,
	type SubSlot,
	type SlotlessSubSlot,
	type SubSlotOptions,
} from './sub-slot.js';

import {
	universalContext,
	type UniversalContext,
	type UniversalContextValue,
	type UniversalRenderable,
} from './universal-core.js';
import { registerRendererContext, renderRendererContextProvider } from './renderer-bridge.js';
import { CONTEXT_TAG } from './runtime-tags.js';
import { registerContext } from './context-identity.js';

export interface NativeUniversalContext<T> extends UniversalContext<T> {
	(props: {
		value: T;
		children?: UniversalRenderable | (() => UniversalRenderable);
	}): UniversalContextValue;
}

/** Create a context whose Provider can be lowered without a DOM Scope. */
/* @__NO_SIDE_EFFECTS__ */
export function createContext<T>(defaultValue: T): NativeUniversalContext<T> {
	const context = ((
		props: {
			value: T;
			children?: UniversalRenderable | (() => UniversalRenderable);
		},
		scope?: object,
	) =>
		scope === undefined
			? universalContext(context, props.value, props.children)
			: renderRendererContextProvider(context, props, scope)) as NativeUniversalContext<T>;
	Object.defineProperties(context, {
		$$kind: { value: CONTEXT_TAG, enumerable: true },
		defaultValue: { value: defaultValue, enumerable: true },
		$$version: { value: 0, enumerable: true, writable: true },
	});
	registerRendererContext(context);
	registerContext(context);
	return context;
}

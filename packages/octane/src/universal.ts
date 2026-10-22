/**
 * Experimental universal renderer facade for DOM-owned roots.
 *
 * The renderer core lives in `universal-core.ts`; this compatibility entry
 * installs only the DOM hooks needed by `createUniversalHostBoundary` and
 * retains Octane's existing DOM `createContext` identity.
 */
export * from './universal-core.js';
export * from './universal-styles.js';
export { normalizeClass } from './class-names.js';
export {
	createSubSlot,
	subSlot,
	type SubSlot,
	type SlotlessSubSlot,
	type SubSlotOptions,
} from './sub-slot.js';

export { createContext } from './runtime.js';
export {
	createUniversalHostBoundary,
	registerUniversalHostBridge,
} from './universal-dom-boundary.js';

/**
 * Experimental universal renderer facade for DOM-owned roots.
 *
 * The renderer core lives in `universal-core.ts`; this compatibility entry
 * installs only the DOM hooks needed by `createUniversalHostBoundary` and
 * retains Octane's existing DOM `createContext` identity.
 */
export * from './universal-core.js';

export { createContext } from './runtime.js';
export { createUniversalHostBoundary } from './universal-dom-boundary.js';

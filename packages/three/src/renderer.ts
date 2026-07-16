/**
 * Compiler-facing Three renderer ABI.
 *
 * Compiled `*.three.tsrx` modules import their host plans and hook helpers from
 * this entry point. The Three driver remains package-owned while component
 * execution, ownership, scheduling, refs, and effects stay in Octane.
 */
export * from 'octane/universal';
export * from './core/index.js';
// Resolve the deliberate name overlap with the capability-gated universal
// primitive in favor of Three's R3F-shaped state-enclave adapter.
export { createPortal } from './core/portal.js';

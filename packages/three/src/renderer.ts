/**
 * Compiler-facing Three renderer ABI.
 *
 * Compiled `*.three.tsrx` modules import their host plans and hook helpers from
 * this entry point. The Three driver remains package-owned while component
 * execution, ownership, scheduling, refs, and effects stay in Octane.
 */
export * from 'octane/universal';
export * from './core/index.js';

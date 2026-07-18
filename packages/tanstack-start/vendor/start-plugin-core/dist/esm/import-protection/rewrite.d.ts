import { SourceMapLike } from './sourceLocation.js';
/**
 * Rewrite static imports/re-exports from denied sources using Babel AST transforms.
 *
 * Transforms:
 *   import { a as b, c } from 'denied'
 * Into:
 *   import __tss_deny_0 from 'tanstack-start-import-protection:mock'
 *   const b = __tss_deny_0.a
 *   const c = __tss_deny_0.c
 *
 * Also handles:
 *   import def from 'denied'        -> import def from mock
 *   import * as ns from 'denied'    -> import ns from mock
 *   export { x } from 'denied'      -> export const x = mock.x
 *   export * from 'denied'          -> removed
 *   export { x as y } from 'denied' -> export const y = mock.x
 */
export declare function rewriteDeniedImports(code: string, id: string, deniedSources: Set<string>, getMockModuleId?: (source: string) => string): {
    code: string;
    map?: SourceMapLike;
} | undefined;

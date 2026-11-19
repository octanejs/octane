/**
 * Private server-side compiler/runtime ABI. Its import graph must remain
 * independent of the browser renderer and its DOM-specific feature tables.
 */
export * from '../runtime.server.js';
export { isContext } from '../context-identity.js';
export { __methodDep } from '../method-dep.js';
export {
	__registerServerFunction,
	__serverCall,
	__setServerCallContextSource,
} from '../server-call.js';

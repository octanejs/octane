export { getSuspenseCache } from './cache/getSuspenseCache.js';
export {
	assertWrappedQueryRef,
	getWrappedPromise,
	InternalQueryReference,
	unwrapQueryRef,
	updateWrappedQueryRef,
	wrapQueryRef,
} from './cache/QueryReference.js';
export const wrapperSymbol = Symbol.for('apollo.hook.wrappers');

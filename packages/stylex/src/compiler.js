import { compileToVolarMappings as compileOctaneToVolarMappings } from 'octane/compiler/volar';
import { knownAttributeSpreads } from './compiler-contract.js';
export { stylexBindingConstants } from './shared-constants.js';

/** @type {typeof compileOctaneToVolarMappings} */
export function compileToVolarMappings(source, filename, options) {
	return compileOctaneToVolarMappings(source, filename, {
		...options,
		knownAttributeSpreads: [...knownAttributeSpreads, ...(options?.knownAttributeSpreads ?? [])],
	});
}

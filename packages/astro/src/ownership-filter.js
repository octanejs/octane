import { compileFilterPatterns } from './compile-filter-patterns.js';
import { createFilter } from './create-filter.js';

/**
 * Config-time ownership filter for the Vite compiler transform. Uses the same
 * picomatch→RegExp pipeline as SSR `check()`, so Astro include/exclude globs
 * (for example components/react under a double-star path) actually skip Octane
 * compilation. The compiler's own `exclude` only supports literal
 * `file.includes(...)` fragments and cannot honor those globs.
 *
 * @param {import('../types/index.d.ts').OctaneAstroOptions['include']} include
 * @param {import('../types/index.d.ts').OctaneAstroOptions['exclude']} exclude
 * @returns {((id: string) => boolean) | null}
 */
export function createOwnershipFilter(include, exclude) {
	return createFilter(compileFilterPatterns(include), compileFilterPatterns(exclude));
}

import picomatch from 'picomatch';

/**
 * Compile Astro-style include/exclude patterns to RegExp arrays in Node
 * (Vite plugin / config time). The SSR server filter stays RegExp-only so
 * picomatch never enters the SSR graph (Cloudflare Workers / edge).
 *
 * @param {string | RegExp | Array<string | RegExp> | undefined | null} patterns
 * @returns {RegExp[] | null}
 */
export function compileFilterPatterns(patterns) {
	if (patterns == null) return null;
	const list = Array.isArray(patterns) ? patterns : [patterns];
	// Empty `include: []` must stay `[]` (match nothing), not `null` ("no
	// filter"). `createFilter` treats null include as unrestricted.
	if (list.length === 0) return [];

	return list.map((pattern) => {
		if (pattern instanceof RegExp) return pattern;
		const normalized = pattern.replace(/\\/g, '/');
		return picomatch.makeRe(normalized, { dot: true });
	});
}

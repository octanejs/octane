/**
 * SSR include/exclude filter for Astro renderer `check()`.
 * Expects patterns precompiled to RegExp (see `compileFilterPatterns`) —
 * same role as `@astrojs/internal-helpers/create-filter` without pulling
 * that private helper or picomatch into the SSR graph.
 *
 * @param {RegExp | RegExp[] | null | undefined} include
 * @param {RegExp | RegExp[] | null | undefined} exclude
 * @returns {((id: string) => boolean) | null}
 */
export function createFilter(include, exclude) {
	if (include == null && exclude == null) return null;

	const includeList = normalizeList(include);
	const excludeList = normalizeList(exclude);

	return (id) => {
		if (typeof id !== 'string') return false;
		if (id.includes('\0')) return false;

		// Strip Vite query suffixes (`?t=…`, `?v=…`) so include/exclude globs
		// match the real path — same split as `shouldSkipOctaneTransform`.
		const pathId = (id.split('?', 1)[0] ?? id).replace(/\\/g, '/');

		if (excludeList !== null) {
			for (const pattern of excludeList) {
				pattern.lastIndex = 0;
				if (pattern.test(pathId)) return false;
			}
		}

		if (includeList === null) return true;

		for (const pattern of includeList) {
			pattern.lastIndex = 0;
			if (pattern.test(pathId)) return true;
		}
		return false;
	};
}

/**
 * @param {RegExp | RegExp[] | null | undefined} value
 * @returns {RegExp[] | null}
 */
function normalizeList(value) {
	if (value == null) return null;
	return Array.isArray(value) ? value : [value];
}

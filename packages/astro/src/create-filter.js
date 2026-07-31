/**
 * Minimal include/exclude filter for Astro renderer `check()` — same role as
 * `@astrojs/internal-helpers/create-filter` without pulling that private helper.
 *
 * @param {string | RegExp | Array<string | RegExp> | undefined} include
 * @param {string | RegExp | Array<string | RegExp> | undefined} exclude
 * @returns {((id: string) => boolean) | null}
 */
export function createFilter(include, exclude) {
	if (include == null && exclude == null) return null;

	const includeList = normalizeList(include);
	const excludeList = normalizeList(exclude);

	return (id) => {
		if (excludeList !== null && matchesAny(excludeList, id)) return false;
		if (includeList !== null) return matchesAny(includeList, id);
		return true;
	};
}

/**
 * @param {string | RegExp | Array<string | RegExp> | undefined} value
 * @returns {Array<string | RegExp> | null}
 */
function normalizeList(value) {
	if (value == null) return null;
	return Array.isArray(value) ? value : [value];
}

/**
 * @param {Array<string | RegExp>} patterns
 * @param {string} id
 */
function matchesAny(patterns, id) {
	for (const pattern of patterns) {
		if (typeof pattern === 'string') {
			if (id.includes(pattern)) return true;
		} else if (pattern.test(id)) {
			return true;
		}
	}
	return false;
}

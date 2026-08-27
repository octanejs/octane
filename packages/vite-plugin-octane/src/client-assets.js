// @ts-check
import { HYDRATE_QUERY_PARAM } from 'octane/compiler/bundler';

/**
 * @typedef {{
 *   file: string,
 *   src?: string,
 *   css?: string[],
 *   imports?: string[],
 *   dynamicImports?: string[],
 * }} ViteManifestEntry
 */

/** @param {string | undefined} id */
function isDeferredHydrationId(id) {
	if (!id) return false;
	const queryStart = id.indexOf('?');
	if (queryStart === -1) return false;
	const hashStart = id.indexOf('#', queryStart);
	const query = id.slice(queryStart + 1, hashStart === -1 ? undefined : hashStart);
	return new URLSearchParams(query).has(HYDRATE_QUERY_PARAM);
}

/**
 * Build the route asset map consumed by the production server.
 *
 * A normal dynamic import stays lazy in both channels. Compiler-generated
 * `?octane-hydrate=` imports are different: their JavaScript remains deferred,
 * but their CSS must be present while the server-rendered boundary is inert.
 * Once inside one of those branches, collect CSS through the whole async
 * descendant graph so nested Hydrate/lazy components cannot flash unstyled.
 *
 * @param {Record<string, ViteManifestEntry>} manifest
 * @param {string[]} moduleIds
 * @param {Record<string, string>} [entryFiles]
 * @returns {Record<string, { js: string, css: string[] }>}
 */
export function createClientAssetMap(manifest, moduleIds, entryFiles = {}) {
	const manifestKeysByFile = new Map(
		Object.entries(manifest).map(([key, entry]) => [entry.file, key]),
	);
	// Route entries usually converge on the same shared chunks. Cache only small,
	// complete transitive CSS results for this immutable manifest build so a large
	// shared JavaScript graph is walked once without retaining quadratic CSS lists.
	const MAX_CACHED_CSS_FILES = 64;
	/** @type {Map<string, string[]>} */
	const cssCache = new Map();
	let traversalVersion = 0;
	let traversalDepth = 0;

	/**
	 * @param {string} key
	 * @param {boolean} deferredHydrationBranch
	 * @param {Set<string>} visited
	 * @returns {string[]}
	 */
	function collectCss(key, deferredHydrationBranch, visited) {
		const visitKey = `${deferredHydrationBranch ? 'deferred' : 'eager'}:${key}`;
		if (visited.has(visitKey)) {
			// This result is complete for the current route because the earlier path
			// already supplied the subtree. It is not safe to reuse as a standalone
			// result for another route; the version change prevents its active callers
			// from caching their now-context-dependent results.
			traversalVersion++;
			return [];
		}
		visited.add(visitKey);
		const cached = cssCache.get(visitKey);
		if (cached !== undefined) return cached;
		const entry = manifest[key];
		if (!entry) return [];

		const version = traversalVersion;
		traversalDepth++;
		const css = [...(entry.css || [])];
		for (const imported of entry.imports || []) {
			css.push(...collectCss(imported, deferredHydrationBranch, visited));
		}
		for (const imported of entry.dynamicImports || []) {
			const importedEntry = manifest[imported];
			const entersDeferredHydration =
				deferredHydrationBranch ||
				isDeferredHydrationId(imported) ||
				isDeferredHydrationId(importedEntry?.src);
			if (entersDeferredHydration) {
				css.push(...collectCss(imported, true, visited));
			}
		}
		traversalDepth--;
		// Top-level route entries are consumed once; caching them only grows the map.
		if (traversalDepth > 0 && traversalVersion === version && css.length <= MAX_CACHED_CSS_FILES) {
			cssCache.set(visitKey, css);
		}
		return css;
	}

	/** @type {Record<string, { js: string, css: string[] }>} */
	const assets = {};
	for (const moduleId of moduleIds) {
		// Vite manifest keys are root-relative without the leading slash.
		const sourceKey = moduleId.startsWith('/') ? moduleId.slice(1) : moduleId;
		// A route module that is also statically imported can become a shared
		// non-facade chunk. Vite keys that manifest entry by generated chunk name,
		// so use the Rollup-observed output file to recover the graph root.
		const manifestKey = manifest[sourceKey]
			? sourceKey
			: manifestKeysByFile.get(entryFiles[moduleId]);
		if (!manifestKey) continue;
		const entry = manifest[manifestKey];
		const visited = new Set();
		traversalVersion = 0;
		assets[moduleId] = {
			js: entry.file,
			css: [...new Set(collectCss(manifestKey, false, visited))],
		};
	}
	return assets;
}

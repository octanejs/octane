import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Load the project's own config loader rather than shipping a second one.
 *
 * `@octanejs/app-core` is usually a transitive dependency of the bundler
 * plugin, not a direct one, so a plain resolve from the project root misses it.
 * Falling back to a resolve rooted at the plugin reproduces exactly the lookup
 * the plugin itself performs.
 *
 * @param {string} root
 * @returns {Promise<((root: string) => Promise<any>) | null>}
 */
export async function resolveConfigLoader(root) {
	const fromProject = createRequire(path.join(root, 'noop.js'));
	const specifier = '@octanejs/app-core/config-loader';

	/** @type {string | null} */
	let entry = null;
	try {
		entry = fromProject.resolve(specifier);
	} catch {
		for (const plugin of [
			'@octanejs/vite-plugin',
			'@octanejs/rspack-plugin',
			'@octanejs/rsbuild-plugin',
		]) {
			try {
				entry = createRequire(fromProject.resolve(plugin)).resolve(specifier);
				break;
			} catch {
				// Try the next plugin.
			}
		}
	}

	if (!entry) return null;
	const module = await import(pathToFileURL(entry).href);
	return module.loadOctaneConfig ?? null;
}

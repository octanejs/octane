/**
 * Path filter for the Astro-scoped Octane Vite plugin. Skip Astro virtual
 * modules and ordinary `node_modules` before the compiler's SSR `transform`
 * schedule (which may `load()` importers and deadlock Rollup on Astro's own
 * graph). Published Octane bindings under `@octanejs/*` / `octane` still need
 * to compile — they often ship raw `.tsrx` / pragma `.tsx` / slotted `.ts`.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function shouldSkipOctaneTransform(id) {
	if (id.startsWith('\0')) return true;
	const clean = id.split('?', 1)[0] ?? id;
	const inNodeModules = clean.includes('/node_modules/') || clean.includes('\\node_modules\\');
	if (inNodeModules && !isInstalledOctanePackagePath(clean)) return true;
	if (/\.(astro|md|mdx|css|scss|sass|less|styl|json|svg|png|jpe?g|gif|webp)$/i.test(clean)) {
		return true;
	}
	return !/\.(tsrx|tsx|jsx|ts|js|mts|mjs)$/i.test(clean);
}

/**
 * Registry / pnpm layouts for packages the Octane compiler must still see.
 * `@octanejs/astro` is excluded: it sits on Astro's SSR graph via
 * `ssr.noExternal` and must not re-enter the async transform schedule.
 *
 * @param {string} clean
 */
function isInstalledOctanePackagePath(clean) {
	return (
		/(?:^|[\\/])node_modules[\\/]@octanejs[\\/](?!astro(?:[\\/]|$))[^\\/]+(?:[\\/]|$)/.test(
			clean,
		) || /(?:^|[\\/])node_modules[\\/]octane(?:[\\/]|$)/.test(clean)
	);
}

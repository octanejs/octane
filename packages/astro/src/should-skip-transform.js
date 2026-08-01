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
	// Always skip this integration — Vite may realpath the workspace package to
	// `packages/astro/...` (no `node_modules` segment).
	if (isOctaneAstroIntegrationPath(clean)) return true;
	const inNodeModules = clean.includes('/node_modules/') || clean.includes('\\node_modules\\');
	if (inNodeModules && !isInstalledOctanePackagePath(clean)) return true;
	if (/\.(astro|md|mdx|css|scss|sass|less|styl|json|svg|png|jpe?g|gif|webp)$/i.test(clean)) {
		return true;
	}
	return !/\.(tsrx|tsx|jsx|ts|js|mts|mjs)$/i.test(clean);
}

/**
 * `@octanejs/astro` under node_modules or the workspace `packages/astro` tree.
 * It sits on Astro's SSR graph via `ssr.noExternal` and must not re-enter the
 * async transform schedule.
 *
 * @param {string} clean
 */
function isOctaneAstroIntegrationPath(clean) {
	const path = clean.replace(/\\/g, '/');
	return (
		/(?:^|\/)packages\/astro(?:\/|$)/.test(path) ||
		/(?:^|\/)node_modules\/@octanejs\/astro(?:\/|$)/.test(path)
	);
}

/**
 * Registry / pnpm layouts for packages the Octane compiler must still see.
 * `@octanejs/astro` is handled by `isOctaneAstroIntegrationPath` instead.
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

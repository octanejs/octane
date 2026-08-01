import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute root of this `@octanejs/astro` package (workspace or installed). */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
	// Always skip this integration — Vite may realpath the workspace package
	// away from `node_modules/@octanejs/astro`.
	if (isOctaneAstroIntegrationPath(clean)) return true;
	const inNodeModules = clean.includes('/node_modules/') || clean.includes('\\node_modules\\');
	if (inNodeModules && !isInstalledOctanePackagePath(clean)) return true;
	if (/\.(astro|md|mdx|css|scss|sass|less|styl|json|svg|png|jpe?g|gif|webp)$/i.test(clean)) {
		return true;
	}
	return !/\.(tsrx|tsx|jsx|ts|js|mts|mjs)$/i.test(clean);
}

/**
 * True for published `@octanejs/*` (except this integration) and `octane`
 * under node_modules — project `include`/`exclude` must not gate these; they
 * ship raw Octane sources that always need the compiler.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isInstalledOctaneCompilerTarget(id) {
	if (typeof id !== 'string' || id.startsWith('\0')) return false;
	const clean = id.split('?', 1)[0] ?? id;
	return isInstalledOctanePackagePath(clean);
}

/**
 * This package only: its install root via `import.meta.url`, plus the
 * `node_modules/@octanejs/astro` layout when not realpathed. Does not match a
 * consumer app that happens to live at `packages/astro`.
 *
 * @param {string} clean
 */
function isOctaneAstroIntegrationPath(clean) {
	const path = clean.replace(/\\/g, '/');
	if (/(?:^|\/)node_modules\/@octanejs\/astro(?:\/|$)/.test(path)) return true;
	const root = PACKAGE_ROOT.replace(/\\/g, '/');
	return path === root || path.startsWith(root + '/');
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

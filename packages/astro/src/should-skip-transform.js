import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute root of this `@octanejs/astro` package (workspace or installed). */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Parent directory that holds sibling workspace packages (e.g. `…/packages`). */
const WORKSPACE_PACKAGES_DIR = resolve(PACKAGE_ROOT, '..');

/** @type {Map<string, boolean>} */
const octanePackageNameCache = new Map();

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
 * True for `@octanejs/*` (except this integration) and `octane` that must
 * always reach the compiler — under `node_modules` or Vite-realpathed to a
 * sibling of this package. Project `include`/`exclude` must not gate them.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function isInstalledOctaneCompilerTarget(id) {
	if (typeof id !== 'string' || id.startsWith('\0')) return false;
	const clean = id.split('?', 1)[0] ?? id;
	if (isOctaneAstroIntegrationPath(clean)) return false;
	return isInstalledOctanePackagePath(clean) || isRealpathedOctaneWorkspacePackage(clean);
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

/**
 * Vite realpaths `workspace:*` links, so binding ids look like
 * `…/packages/zustand/…` with no `node_modules` segment. Recognize siblings of
 * this package whose `package.json` name is `octane` or `@octanejs/*`.
 *
 * @param {string} clean
 */
function isRealpathedOctaneWorkspacePackage(clean) {
	const path = clean.replace(/\\/g, '/');
	const packagesDir = WORKSPACE_PACKAGES_DIR.replace(/\\/g, '/');
	if (!path.startsWith(packagesDir + '/')) return false;
	const pkgSeg = path.slice(packagesDir.length + 1).split('/')[0];
	if (!pkgSeg || pkgSeg === 'astro') return false;
	return packageJsonIsOctaneCompilerTarget(join(WORKSPACE_PACKAGES_DIR, pkgSeg));
}

/**
 * @param {string} pkgDir
 * @returns {boolean}
 */
function packageJsonIsOctaneCompilerTarget(pkgDir) {
	const cached = octanePackageNameCache.get(pkgDir);
	if (cached !== undefined) return cached;
	let ok = false;
	try {
		const name = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).name;
		ok =
			name === 'octane' ||
			(typeof name === 'string' && name.startsWith('@octanejs/') && name !== '@octanejs/astro');
	} catch {
		ok = false;
	}
	octanePackageNameCache.set(pkgDir, ok);
	return ok;
}

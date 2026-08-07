// Resolve a workspace package's subpath imports by re-reading its package.json on every request.
//
// WHY THIS EXISTS. Vite reads a package's `exports` map the first time it resolves that package and
// caches it for the life of the dev server. `@octanejs/shadcn` is consumed through PER-FAMILY
// SUBPATHS (`@octanejs/shadcn/base-ui/Field`), so every family added to the package makes the
// playground fail with
//
//     "./base-ui/Field" is not exported under the conditions [...]
//
// until the server is restarted — even though the export is right there in package.json and
// `import.meta.resolve` finds it. Excluding the package from `optimizeDeps` does NOT help: the
// cache is in the resolver, not in pre-bundling, and `--force` does not clear it either.
//
// WHAT THIS DELIBERATELY DOES NOT DO: bypass the exports map. It reads the SAME map Node and the
// published package use, just without caching it. A subpath missing from `exports` still fails to
// resolve here exactly as it would for a real consumer, so the playground keeps its value as a
// check that the published surface is wired up — it simply stops needing a restart to see it.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface WorkspacePackage {
	/** Package name as imported, e.g. `@octanejs/shadcn`. */
	name: string;
	/** Absolute path to the package directory containing package.json. */
	dir: string;
}

/**
 * Resolve `source` against `pkgDir`'s exports map, read fresh from disk.
 * Returns an absolute path, or null to let vite's own resolution take over.
 */
export function resolveThroughExports(
	pkgDir: string,
	pkgName: string,
	source: string,
): string | null {
	if (source !== pkgName && !source.startsWith(`${pkgName}/`)) {
		return null;
	}

	let pkg: { exports?: Record<string, unknown> };
	try {
		pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
	} catch {
		return null;
	}

	const subpath = source === pkgName ? '.' : `.${source.slice(pkgName.length)}`;
	const target = pkg.exports?.[subpath];

	// Only plain string targets are handled. Condition objects and wildcards fall through to vite,
	// which resolves them correctly — they are not what changes when a family is added.
	return typeof target === 'string' ? resolve(pkgDir, target) : null;
}

export function freshWorkspaceExports(packages: WorkspacePackage[]) {
	return {
		name: 'fresh-workspace-exports',
		// Ahead of vite's own resolution, which is where the stale cache lives.
		enforce: 'pre',
		resolveId(source: string): string | null {
			for (const { name, dir } of packages) {
				const resolved = resolveThroughExports(dir, name, source);
				if (resolved) {
					return resolved;
				}
			}
			return null;
		},
	};
}

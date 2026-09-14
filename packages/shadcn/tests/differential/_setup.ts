/**
 * Vitest globalSetup for the shadcn projects — the shadcn analogue of radix's
 * differential precompile. Runs ONCE in pure Node before any test loads and fills
 * each project's subdirectory in `.react-cache` with the React side of the rig:
 *
 *   1. The vendored pinned upstream sources (`tests/differential/upstream/…`,
 *      real React TSX from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544)
 *      are esbuild-lowered to plain `.js`. They must NOT be imported through
 *      Vitest's pipeline directly: the octane() plugin owns pragma-less project
 *      `.tsx` and would octane-compile the React reference code.
 *   2. Every `.tsrx` fixture under `tests/_fixtures` is compiled through
 *      `@tsrx/react` + esbuild (same as octane's/radix's setup — via the shared
 *      `compileReactFixture`), then specifiers are rewritten so the React side
 *      runs against the matching vendored upstream module. Aggregate and
 *      relative imports fall back to `./upstream-index.js`; `octane` becomes
 *      `react`.
 *
 * The cache lives INSIDE this package so the compiled React modules resolve THIS
 * package's deps (react, react-dom, radix-ui, lucide-react). The differential
 * tests pass the same dir to octane's `mountDifferential(..., cacheDir)`.
 */
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { compileReactFixture } from '../../../../test-utils/differential-precompile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const UPSTREAM_DIR = join(__dirname, 'upstream');
const CACHE_ROOT = join(__dirname, '.react-cache');
const UPSTREAM_SUBPATHS: Record<string, string> = {
	Badge: 'badge',
	Button: 'button',
	Dialog: 'dialog',
	DropdownMenu: 'dropdown-menu',
	Tabs: 'tabs',
};
const BASE_UPSTREAM_SUBPATHS: Record<string, string> = {
	Select: 'select',
	NavigationMenu: 'navigation-menu',
	ScrollArea: 'scroll-area',
};

/**
 * Lower one vendored upstream React module to plain JS in the cache dir. The
 * upstream files import each other with `./name` specifiers — those become the
 * cache-local `./upstream-name.js` so the whole graph resolves inside
 * `.react-cache` (bare imports — react, radix-ui, lucide-react,
 * class-variance-authority, clsx, tailwind-merge — resolve from this package's
 * node_modules).
 */
function compileUpstream(cacheDir: string, name: string, ext: '.ts' | '.tsx', base = false): void {
	const srcPath = join(base ? join(__dirname, 'base-upstream') : UPSTREAM_DIR, `${name}${ext}`);
	const source = readFileSync(srcPath, 'utf8');
	const transformed = esbuildTransformSync(source, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: srcPath,
	});
	const rewritten = transformed.code.replace(
		/from\s*["']\.\/([\w-]+)["']/g,
		'from "./upstream-$1.js"',
	);
	writeFileSync(join(cacheDir, `${base ? 'base' : 'upstream'}-${name}.js`), rewritten);
}

function shadcnConfig(cacheDir: string) {
	return {
		fixtureDir: join(FIXTURE_DIR, 'shadcn-diff'),
		cacheDir,
		// `@octanejs/shadcn` → the vendored pinned upstream barrel (shadcn has no
		// npm runtime package to rewrite to). Subpath fixtures go straight to
		// their matching upstream module so an isolated case does not load
		// unrelated Dialog/Menu/Tabs graphs. Relative source imports still use
		// the aggregate barrel as a fallback for any future multi-component
		// fixture.
		rewrites: [
			[
				/from\s*["']@octanejs\/shadcn\/base-ui\/(\w+)["']/g,
				(specifier: string, subpath: string) => {
					const name = BASE_UPSTREAM_SUBPATHS[subpath];
					if (!name) throw new Error(`No pinned Base UI reference for ${subpath}`);
					return `from "./base-${name}.js"`;
				},
			],
			[
				/from\s*["']@octanejs\/shadcn\/([\w-]+)["']/g,
				(_match: string, subpath: string) => {
					const moduleName = UPSTREAM_SUBPATHS[subpath] ?? 'index';
					return `from "./upstream-${moduleName}.js"`;
				},
			],
			[/from\s*["']@octanejs\/shadcn(?:\/[\w.\/-]+)?["']/g, 'from "./upstream-index.js"'],
			[
				/from\s*["'](?:\.\.\/)+src\/bases\/[\w-]+\/ui\/[\w-]+\.tsrx["']/g,
				'from "./upstream-index.js"',
			],
		],
		fixtures: 'all' as const,
		depsFrom: import.meta.url,
	} satisfies Parameters<typeof compileReactFixture>[1];
}

export async function setup(project: TestProject): Promise<void> {
	const families: Record<string, string> = {
		'shadcn-differential': 'radix',
		'shadcn-base-ui-differential': 'base-ui',
	};
	const family = families[project.name];
	if (!family) throw new Error(`Unknown shadcn differential project: ${project.name}`);
	const cacheDir = join(CACHE_ROOT, family);
	rmSync(cacheDir, { recursive: true, force: true });
	mkdirSync(cacheDir, { recursive: true });
	compileUpstream(cacheDir, 'utils', '.ts');
	compileUpstream(cacheDir, 'icon-placeholder', '.tsx');
	compileUpstream(cacheDir, 'badge', '.tsx');
	compileUpstream(cacheDir, 'button', '.tsx');
	compileUpstream(cacheDir, 'tabs', '.tsx');
	compileUpstream(cacheDir, 'dialog', '.tsx');
	compileUpstream(cacheDir, 'dropdown-menu', '.tsx');
	compileUpstream(cacheDir, 'index', '.ts');
	for (const name of Object.values(BASE_UPSTREAM_SUBPATHS))
		compileUpstream(cacheDir, name, '.tsx', true);
	const config = shadcnConfig(cacheDir);
	const walk = (dir: string): string[] =>
		readdirSync(dir).flatMap((entry) => {
			const full = join(dir, entry);
			return statSync(full).isDirectory() ? walk(full) : full.endsWith('.tsrx') ? [full] : [];
		});
	for (const fixturePath of walk(join(FIXTURE_DIR, 'shadcn-diff'))) {
		compileReactFixture(fixturePath, config);
	}
}

export async function teardown(): Promise<void> {
	// Cache is regenerated on each run; nothing to clean up.
}

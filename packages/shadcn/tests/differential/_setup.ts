/**
 * Vitest globalSetup for the `shadcn` project — the shadcn analogue of radix's
 * differential precompile. Runs ONCE in pure Node before any test loads and fills
 * THIS package's `.react-cache` with the React side of the differential rig:
 *
 *   1. The vendored pinned upstream sources (`tests/differential/upstream/…`,
 *      real React TSX from shadcn-ui/ui@4baadbc6517070ae8f8feb2c97037adc2b305544)
 *      are esbuild-lowered to plain `.js`. They must NOT be imported through
 *      Vitest's pipeline directly: the octane() plugin owns pragma-less project
 *      `.tsx` and would octane-compile the React reference code.
 *   2. Every `.tsrx` fixture under `tests/_fixtures` is compiled through
 *      `@tsrx/react` + esbuild (same as octane's/radix's setup), then specifiers
 *      are rewritten so the React side runs against the vendored upstream:
 *      `@octanejs/shadcn` (and any relative `src/ui/*.tsrx` import) →
 *      `./upstream-index.js`, `octane` → `react`.
 *
 * The cache lives INSIDE this package so the compiled React modules resolve THIS
 * package's deps (react, react-dom, radix-ui, lucide-react). The differential
 * tests pass the same dir to octane's `mountDifferential(..., cacheDir)`.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const UPSTREAM_DIR = join(__dirname, 'upstream');
const CACHE_DIR = join(__dirname, '.react-cache');

// Must match the hash in octane's `_rig.ts` so the slug+hash file names line up.
function hashString(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

/**
 * Lower one vendored upstream React module to plain JS in the cache dir. The
 * upstream files import each other with `./name` specifiers — those become the
 * cache-local `./upstream-name.js` so the whole graph resolves inside
 * `.react-cache` (bare imports — react, radix-ui, lucide-react,
 * class-variance-authority, clsx, tailwind-merge — resolve from this package's
 * node_modules).
 */
function compileUpstream(name: string, ext: '.ts' | '.tsx'): void {
	const srcPath = join(UPSTREAM_DIR, `${name}${ext}`);
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
	writeFileSync(join(CACHE_DIR, `upstream-${name}.js`), rewritten);
}

function compileFixture(srcPath: string): void {
	const source = readFileSync(srcPath, 'utf8');
	let compiled;
	try {
		compiled = compileToReact(source, srcPath);
	} catch {
		return;
	}
	if (compiled.errors && compiled.errors.length > 0) return;
	let transformed;
	try {
		transformed = esbuildTransformSync(compiled.code, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			target: 'esnext',
			format: 'esm',
			sourcefile: srcPath,
		});
	} catch {
		return;
	}
	// `@octanejs/shadcn` → the vendored pinned upstream barrel (shadcn has no npm
	// runtime package to rewrite to); relative `src/bases/<base>/ui/*.tsrx`
	// imports → the same barrel; `octane` → `react`. The base segment is matched
	// generically so a fixture pinned to any base rewrites to the one reference
	// barrel — upstream ships a single component surface across its bases.
	const rewritten = transformed.code
		.replace(/from\s*["']@octanejs\/shadcn(?:\/[\w./-]+)?["']/g, 'from "./upstream-index.js"')
		.replace(
			/from\s*["'](?:\.\.\/)+src\/bases\/[\w-]+\/ui\/[\w-]+\.tsrx["']/g,
			'from "./upstream-index.js"',
		)
		.replace(/from\s*["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	const outFile = join(CACHE_DIR, `${slug}-${hashString(srcPath)}.js`);
	writeFileSync(outFile, rewritten);
}

export async function setup(): Promise<void> {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	compileUpstream('utils', '.ts');
	compileUpstream('icon-placeholder', '.tsx');
	compileUpstream('badge', '.tsx');
	compileUpstream('button', '.tsx');
	compileUpstream('tabs', '.tsx');
	compileUpstream('dialog', '.tsx');
	compileUpstream('dropdown-menu', '.tsx');
	compileUpstream('index', '.ts');
	if (!existsSync(FIXTURE_DIR)) return;
	const walk = (dir: string): string[] => {
		const out: string[] = [];
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			if (statSync(full).isDirectory()) out.push(...walk(full));
			else if (full.endsWith('.tsrx')) out.push(full);
		}
		return out;
	};
	for (const file of walk(FIXTURE_DIR)) compileFixture(file);
}

export async function teardown(): Promise<void> {
	// Cache is regenerated on each run; nothing to clean up.
}

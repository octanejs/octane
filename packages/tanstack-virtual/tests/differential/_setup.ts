/**
 * Vitest globalSetup for the `tanstack-virtual` project — the table analogue of
 * octane's differential precompile. Runs ONCE in pure Node before any test
 * loads, compiles every `.tsrx` fixture under
 * `packages/tanstack-virtual/tests/_fixtures` through `@tsrx/react` + esbuild,
 * and writes the React-runtime JS into the SHARED differential cache that
 * octane's `_rig.ts` reads from — so the table differential tests reuse
 * octane's `mountDifferential` unchanged.
 *
 * The one table-specific step: besides rewriting `octane` → `react`, we
 * rewrite `@octanejs/tanstack-virtual` → `@tanstack/react-virtual`, so the React
 * side of each fixture runs the REAL react-virtual adapter (the byte-for-byte
 * oracle) over the SAME `@tanstack/table-core` instance. The public API
 * matches 1:1 (`useReactTable`, `flexRender`, core re-exports), so a flat
 * import rewrite is all it takes.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
// Keep the compiled React fixtures INSIDE this package so the React side resolves
// THIS package's deps (@tanstack/react-virtual, react, react-dom). The differential
// tests pass this same dir to octane's `mountDifferential(..., cacheDir)`.
const CACHE_DIR = join(__dirname, '.react-cache');

// Must match the hash in octane's `_rig.ts`/`_setup.ts` so the slug+hash file
// names line up — the rig keys cache lookups by `hashString(srcPath)`.
function hashString(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

function compileOne(srcPath: string): void {
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
	// `@octanejs/tanstack-virtual` (and any subpath) → the matching real
	// react-virtual specifier; `octane` → react.
	let rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/tanstack-virtual(\/[^"']*)?["']/g,
			(_m, sub) => `from "@tanstack/react-virtual${sub || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	const outFile = join(CACHE_DIR, `${slug}-${hashString(srcPath)}.js`);
	writeFileSync(outFile, rewritten);
}

export async function setup(): Promise<void> {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
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
	for (const file of walk(FIXTURE_DIR)) compileOne(file);
}

export async function teardown(): Promise<void> {
	// Cache is shared + regenerated on each run; nothing to clean up.
}

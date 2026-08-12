/**
 * Vitest globalSetup for the `tanstack-table` project — the table analogue of
 * octane's differential precompile. Runs ONCE in pure Node before any test
 * loads, compiles every `.tsrx` fixture under
 * `packages/tanstack-table/tests/_fixtures` through `@tsrx/react` + esbuild,
 * and writes the React-runtime JS into the SHARED differential cache that
 * octane's `_rig.ts` reads from — so the table differential tests reuse
 * octane's `mountDifferential` unchanged.
 *
 * The one table-specific step: besides rewriting `octane` → `react`, we
 * rewrite `@octanejs/tanstack-table` → `@tanstack/react-table`, so the React
 * side of each fixture runs the REAL react-table adapter (the byte-for-byte
 * oracle) over the SAME `@tanstack/table-core` instance. The public API
 * matches 1:1 (`useTable`, `flexRender`, `Subscribe`, core re-exports), so a
 * flat import rewrite is all it takes.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
// Keep the compiled React fixtures INSIDE this package so the React side resolves
// THIS package's deps (@tanstack/react-table, react, react-dom). The differential
// tests pass this same dir to octane's `mountDifferential(..., cacheDir)`.
const CACHE_DIR = join(__dirname, '.react-cache');

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
	for (const file of walk(FIXTURE_DIR)) {
		compileFixture(file, CACHE_DIR, {
			readFile: readFileSync,
			compile: compileToReact,
			transform: esbuildTransformSync,
			writeFile: writeFileSync,
		});
	}
}

export async function teardown(): Promise<void> {
	// Cache is shared + regenerated on each run; nothing to clean up.
}

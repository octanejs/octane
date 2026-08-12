/**
 * Vitest globalSetup for the `tanstack-virtual` project — the table analogue of
 * octane's differential precompile. Runs ONCE in pure Node before any test
 * loads, compiles differential-oracle `.tsrx` fixtures (`*-diff.tsrx`) under
 * `packages/tanstack-virtual/tests/_fixtures` through `@tsrx/react` + esbuild,
 * and writes the React-runtime JS into the SHARED differential cache that
 * octane's `_rig.ts` reads from — so the table differential tests reuse
 * octane's `mountDifferential` unchanged.
 *
 * Conformance and SSR fixtures (e.g. `list-*.tsrx`, `server.tsrx`) stay out of
 * this walk so Octane-only imports cannot fail-closed the React parity lane —
 * same isolation Apollo keeps by walking only `_fixtures/differential`.
 *
 * The one table-specific step: besides rewriting `octane` → `react`, we
 * rewrite `@octanejs/tanstack-virtual` → `@tanstack/react-virtual`, so the React
 * side of each fixture runs the REAL react-virtual adapter (the byte-for-byte
 * oracle) over the SAME `@tanstack/virtual-core` instance. The public API
 * matches 1:1, so a flat import rewrite is all it takes.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture, isOracleFixture } from './fixture-compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
// Keep the compiled React fixtures INSIDE this package so the React side resolves
// THIS package's deps (@tanstack/react-virtual, react, react-dom). The differential
// tests pass this same dir to octane's `mountDifferential(..., cacheDir)`.
const CACHE_DIR = join(__dirname, '.react-cache');

// Must match the hash in octane's `_rig.ts`/`_setup.ts` so the slug+hash file
// names line up — the rig keys cache lookups by `hashString(srcPath)`.
export async function setup(): Promise<void> {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	if (!existsSync(FIXTURE_DIR)) return;
	function walk(dir: string): string[] {
		const out: string[] = [];
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			if (statSync(full).isDirectory()) out.push(...walk(full));
			else if (isOracleFixture(full)) out.push(full);
		}
		return out;
	}
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

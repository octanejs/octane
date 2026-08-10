/**
 * Vitest globalSetup for the `zustand` project — the zustand analogue of
 * octane's differential precompile. Runs ONCE in pure Node before any test
 * loads, compiles every `.tsrx` fixture under `packages/zustand/tests/_fixtures`
 * through `@tsrx/react` + esbuild, and writes the React-runtime JS into the
 * SHARED differential cache that octane's `_rig.ts` reads from — so the zustand
 * differential tests reuse octane's `mountDifferential` unchanged.
 *
 * The one zustand-specific step: besides rewriting `octane` → `react`, we
 * rewrite `@octanejs/zustand` → `zustand`, so the React side of each fixture
 * runs the REAL zustand React binding (the byte-for-byte oracle). The public
 * API matches 1:1 (`create`, `useStore`, `createStore`), so a flat import
 * rewrite is all it takes.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES = ['counter-diff.tsrx', 'multistore-diff.tsrx'].map((name) =>
	join(__dirname, '../_fixtures', name),
);
// Keep the compiled React fixtures INSIDE this package so the React side resolves
// THIS package's deps (zustand, react, react-dom). The differential tests pass
// this same dir to octane's `mountDifferential(..., cacheDir)`.
const CACHE_DIR = join(__dirname, '.react-cache');

export async function setup(): Promise<void> {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	for (const fixture of FIXTURES) {
		compileFixture(fixture, CACHE_DIR, {
			readFile: readFileSync,
			compile: compileToReact,
			transform: transformSync,
			writeFile: writeFileSync,
		});
	}
}

export async function teardown(): Promise<void> {
	// Cache is shared + regenerated on each run; nothing to clean up.
}

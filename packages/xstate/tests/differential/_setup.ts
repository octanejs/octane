/**
 * Vitest globalSetup for the `xstate-differential` project. Runs ONCE in pure
 * Node before any test loads, compiles every differential `.tsrx` fixture
 * through `@tsrx/react` + esbuild, and writes the React-runtime JS into the
 * cache octane's shared `_rig.ts` reads from — so these tests reuse
 * `mountDifferential` unchanged.
 *
 * The xstate-specific step: besides rewriting `octane` -> `react`, rewrite
 * `@octanejs/xstate` -> `@xstate/react`, so the React side runs the REAL pinned
 * binding as the byte-for-byte oracle. The public API matches 1:1, so a flat
 * import rewrite is all it takes.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = ['parity.tsrx'].map((name) => join(__dirname, '../_fixtures/differential', name));
// Keep the compiled React fixtures INSIDE this package so the React side
// resolves THIS package's deps (@xstate/react, xstate, react, react-dom).
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
	// Cache is regenerated on each run; nothing to clean up.
}

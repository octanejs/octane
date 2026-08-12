/**
 * Vitest globalSetup for the `router` project — the router analogue of octane's
 * differential precompile. Compiles every `.tsrx` fixture under
 * `packages/tanstack-router/tests/_fixtures` through `@tsrx/react` + esbuild and writes
 * the React-runtime JS into THIS package's cache, rewriting `@octanejs/tanstack-router`
 * → `@tanstack/react-router` (and `octane` → `react`) so the React side runs
 * the real react-router binding (the byte-for-byte oracle).
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');

export async function setup(): Promise<void> {
	mkdirSync(CACHE_DIR, { recursive: true });
	compileFixture(join(FIXTURE_DIR, 'router-diff.tsrx'), CACHE_DIR, {
		readFile: readFileSync,
		compile: compileToReact,
		transform: esbuildTransformSync,
		writeFile: writeFileSync,
	});
}

export async function teardown(): Promise<void> {}

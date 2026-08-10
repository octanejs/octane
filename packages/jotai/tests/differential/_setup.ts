/**
 * Vitest globalSetup for the `jotai-differential` project — the jotai analogue
 * of octane's differential precompile. Runs ONCE in pure Node before any test
 * loads, compiles ONLY the declared differential fixtures through `@tsrx/react`
 * + esbuild, and writes the React-runtime JS into THIS package's cache that
 * octane's `_rig.ts` reads from.
 *
 * Fail-closed: compile/transform errors throw so a broken fixture cannot leave
 * a stale `.react-cache` entry in place. The cache directory is replaced on
 * every run so undeclared/stale outputs cannot be compared against Octane.
 *
 * The one jotai-specific step: besides rewriting `octane` → `react`, we
 * rewrite `@octanejs/jotai` → `jotai`, so the React side of each fixture runs
 * the REAL jotai React binding (the byte-for-byte oracle).
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
// Keep the compiled React fixtures INSIDE this package so the React side resolves
// THIS package's deps (jotai, react, react-dom). The differential tests pass
// this same dir to octane's `mountDifferential(..., cacheDir)`.
const CACHE_DIR = join(__dirname, '.react-cache');

// Declared differential fixtures only — non-diff `_fixtures/*.tsrx` stay out of
// the React oracle cache so a broken/changed unit fixture cannot stale-poison
// the required parity lane.
const DECLARED_FIXTURES = [
	'counter-diff.tsrx',
	'providers-diff.tsrx',
	'split-diff.tsrx',
	'async-diff.tsrx',
];

// Must match the hash in octane's `_rig.ts`/`_setup.ts` so the slug+hash file
// names line up — the rig keys cache lookups by `hashString(srcPath)`.
function hashString(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

function compileOne(srcPath: string): void {
	const source = readFileSync(srcPath, 'utf8');
	const compiled = compileToReact(source, srcPath);
	if (compiled.errors && compiled.errors.length > 0) {
		throw new Error(
			`React fixture compilation failed for ${srcPath}: ${JSON.stringify(compiled.errors)}`,
		);
	}
	const transformed = esbuildTransformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: srcPath,
	});
	// `@octanejs/jotai` and its subpaths (/vanilla, /utils, /react, …) → the
	// matching real-jotai specifier; `octane` → react.
	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/jotai(\/[^"']*)?["']/g, function (_m, sub) {
			return `from "jotai${sub || ''}"`;
		})
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	const outFile = join(CACHE_DIR, `${slug}-${hashString(srcPath)}.js`);
	writeFileSync(outFile, rewritten);
}

export async function setup(): Promise<void> {
	rmSync(CACHE_DIR, { recursive: true, force: true });
	mkdirSync(CACHE_DIR, { recursive: true });
	for (const name of DECLARED_FIXTURES) {
		compileOne(join(FIXTURE_DIR, name));
	}
}

export async function teardown(): Promise<void> {
	// Cache is regenerated on each run; nothing to clean up.
}

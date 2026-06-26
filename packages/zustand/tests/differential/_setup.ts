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
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
// Keep the compiled React fixtures INSIDE this package so the React side resolves
// THIS package's deps (zustand, react, react-dom). The differential tests pass
// this same dir to octane's `mountDifferential(..., cacheDir)`.
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
	// octane → react (hook/component names match 1:1) and @octanejs/zustand →
	// zustand (create/useStore/createStore match 1:1). Order matters only in that
	// both are independent specifiers.
	let rewritten = transformed.code
		// `@octanejs/zustand` and its subpaths (/shallow, /middleware, /vanilla) →
		// the matching real-zustand specifier; `octane` → react.
		.replace(
			/from\s+["']@octanejs\/zustand(\/[^"']*)?["']/g,
			(_m, sub) => `from "zustand${sub || ''}"`,
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

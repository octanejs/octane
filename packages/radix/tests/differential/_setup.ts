/**
 * Vitest globalSetup for the `radix` project — the radix analogue of octane's
 * differential precompile. Runs ONCE in pure Node before any test loads, compiles every
 * `.tsrx` fixture under `packages/radix/tests/_fixtures` through `@tsrx/react` + esbuild,
 * and writes the React-runtime JS into THIS package's `.react-cache`, so octane's
 * `mountDifferential` runs the React side against the REAL Radix primitives.
 *
 * The radix-specific rewrite: `@octanejs/radix` → `radix-ui` (the unified Radix package
 * exports the same component namespaces — `Separator.Root`, `Collapsible.Root`, … — so a
 * flat specifier rewrite is all it takes) and `octane` → `react`.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
// Keep the compiled React fixtures INSIDE this package so the React side resolves THIS
// package's deps (radix-ui, react, react-dom). The differential tests pass this same dir
// to octane's `mountDifferential(..., cacheDir)`.
const CACHE_DIR = join(__dirname, '.react-cache');

// Must match the hash in octane's `_rig.ts` so the slug+hash file names line up.
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
	// `@octanejs/radix` → `radix-ui` (namespace shape matches 1:1); `octane` → `react`.
	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/radix["']/g, 'from "radix-ui"')
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
	// Cache is regenerated on each run; nothing to clean up.
}

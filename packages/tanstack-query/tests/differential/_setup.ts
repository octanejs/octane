/**
 * Vitest globalSetup for the `query` project — the query analogue of octane's
 * differential precompile. Compiles every `.tsrx` fixture under
 * `packages/tanstack-query/tests/_fixtures` through `@tsrx/react` + esbuild and writes the
 * React-runtime JS into THIS package's cache, rewriting `@octanejs/tanstack-query` →
 * `@tanstack/react-query` (and `octane` → `react`) so the React side runs the
 * real react-query binding (the byte-for-byte oracle).
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');

function hashString(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

function compileOne(srcPath: string): void {
	const source = readFileSync(srcPath, 'utf8');
	const compiled = compileToReact(source, srcPath);
	if (compiled.errors?.length) {
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
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/tanstack-query(\/[^"']*)?["']/g,
			(_m, sub) => `from "@tanstack/react-query${sub || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	const outFile = join(CACHE_DIR, `${slug}-${hashString(srcPath)}.js`);
	writeFileSync(outFile, rewritten);
}

export async function setup(): Promise<void> {
	mkdirSync(CACHE_DIR, { recursive: true });
	for (const fixture of ['cached-diff.tsrx', 'async-diff.tsrx']) {
		compileOne(join(FIXTURE_DIR, fixture));
	}
}

export async function teardown(): Promise<void> {}

/**
 * Vitest globalSetup for the `@octanejs/redux` differential project — the
 * differential precompile. Compiles every `.tsrx` fixture under
 * packages/redux/tests/_fixtures through `@tsrx/react` + esbuild and
 * writes the React-runtime JS into THIS package's cache, rewriting
 * `@octanejs/redux` → `react-redux` (and `octane` → `react`) so the
 * React side runs the real react-redux binding (the byte-for-byte oracle).
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
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
	if (compiled.errors && compiled.errors.length > 0) {
		throw new Error(
			`React differential precompile failed for ${srcPath}:\n${compiled.errors.join('\n')}`,
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
			/from\s+["']@octanejs\/redux(\/[^"']*)?["']/g,
			(_m, sub) => `from "react-redux${sub || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(srcPath).replace(/\.tsrx$/, '');
	const outFile = join(CACHE_DIR, `${slug}-${hashString(srcPath)}.js`);
	writeFileSync(outFile, rewritten);
}

export async function setup(): Promise<void> {
	rmSync(CACHE_DIR, { recursive: true, force: true });
	mkdirSync(CACHE_DIR, { recursive: true });
	compileOne(join(FIXTURE_DIR, 'counter.tsrx'));
}

export async function teardown(): Promise<void> {}

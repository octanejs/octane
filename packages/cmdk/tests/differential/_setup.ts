/**
 * Precompile cmdk's differential fixtures for React. The same `.tsrx` source is
 * loaded by Octane in the test project and rewritten to use the published
 * `cmdk@1.1.1` package on the React side.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');

// Must match packages/octane/tests/differential/_rig.ts.
function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function compileOne(sourcePath: string): void {
	const source = readFileSync(sourcePath, 'utf8');
	let compiled;
	try {
		compiled = compileToReact(source, sourcePath);
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
			sourcefile: sourcePath,
		});
	} catch {
		return;
	}

	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/cmdk["']/g, 'from "cmdk"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(CACHE_DIR, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function walk(directory: string): string[] {
	const files: string[] = [];
	for (const name of readdirSync(directory)) {
		const fullPath = join(directory, name);
		if (statSync(fullPath).isDirectory()) files.push(...walk(fullPath));
		else if (fullPath.endsWith('.tsrx')) files.push(fullPath);
	}
	return files;
}

export async function setup(): Promise<void> {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	if (!existsSync(FIXTURE_DIR)) return;
	for (const sourcePath of walk(FIXTURE_DIR)) compileOne(sourcePath);
}

export async function teardown(): Promise<void> {
	// The cache is regenerated on every test run.
}

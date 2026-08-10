/**
 * Precompile Apollo differential fixtures for React. Only `.tsrx` under
 * `_fixtures/differential` are oracles; conformance/upstream fixtures stay out
 * of this lane so their Octane-only imports cannot poison the React cache.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../_fixtures/differential');
const CACHE_DIR = join(__dirname, '.react-cache');

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
	const dependencies = {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	};
	for (const sourcePath of walk(FIXTURE_DIR)) {
		compileFixture(sourcePath, CACHE_DIR, dependencies);
	}
}

export async function teardown(): Promise<void> {}

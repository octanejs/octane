/**
 * Precompile cmdk's differential fixtures for React. The same `.tsrx` source is
 * loaded by Octane in the test project and rewritten to use the published
 * `cmdk@1.1.1` package on the React side.
 *
 * Fail-closed: compile/transform errors throw so a broken fixture cannot leave
 * a stale `.react-cache` entry in place. The cache directory is replaced on
 * every run so undeclared/stale outputs cannot be compared against Octane.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');

// Declared differential fixtures only — non-diff `_fixtures/*.tsrx` stay out of
// the React oracle cache so a broken/changed unit fixture cannot stale-poison
// the required parity lane.
const DECLARED_FIXTURES = ['cmdk-diff.tsrx'];

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
	const compiled = compileToReact(source, sourcePath);
	if (compiled.errors && compiled.errors.length > 0) {
		throw new Error(
			`React fixture compilation failed for ${sourcePath}: ${JSON.stringify(compiled.errors)}`,
		);
	}

	const transformed = esbuildTransformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});

	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/cmdk["']/g, 'from "cmdk"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(CACHE_DIR, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

export async function setup(): Promise<void> {
	rmSync(CACHE_DIR, { recursive: true, force: true });
	mkdirSync(CACHE_DIR, { recursive: true });
	for (const name of DECLARED_FIXTURES) {
		compileOne(join(FIXTURE_DIR, name));
	}
}

export async function teardown(): Promise<void> {
	// The cache is regenerated on every test run.
}

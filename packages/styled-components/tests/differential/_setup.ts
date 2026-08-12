/**
 * Precompile the styled-components differential fixtures for React. The same
 * `.tsrx` source is loaded by Octane in the test project and rewritten to use
 * the published `styled-components` package on the React side.
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
			`React differential precompile failed for ${sourcePath}:\n${compiled.errors.join('\n')}`,
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
		.replace(/from\s+["']@octanejs\/styled-components["']/g, 'from "styled-components"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(CACHE_DIR, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

export async function setup(): Promise<void> {
	rmSync(CACHE_DIR, { recursive: true, force: true });
	mkdirSync(CACHE_DIR, { recursive: true });
	for (const name of [
		'basic-smoke',
		'themed-card',
		'attrs-input',
		'as-polymorph',
		'global-keyframes',
		'compose',
	]) {
		compileOne(join(FIXTURE_DIR, `${name}.tsrx`));
	}
}

export async function teardown(): Promise<void> {
	// The cache is regenerated on every test run.
}

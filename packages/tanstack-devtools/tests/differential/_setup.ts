import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixture = join(dirname(fileURLToPath(import.meta.url)), '../_fixtures/devtools-diff.tsrx');
const cacheDirectory = join(dirname(fileURLToPath(import.meta.url)), '.react-cache');
const upstreamSrc = join(dirname(fileURLToPath(import.meta.url)), '../../upstream/package/src');

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

function compileUpstreamModule(name: string, extension: '.ts' | '.tsx'): string {
	const sourcePath = join(upstreamSrc, `${name}${extension}`);
	const adapter = transformSync(readFileSync(sourcePath, 'utf8'), {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = adapter.code.replace(
		/from\s+["']\.\/([\w.-]+)["']/g,
		(_match, specifier: string) => `from "./react-devtools-${specifier}.js"`,
	);
	const outFile = join(cacheDirectory, `react-devtools-${name}.js`);
	writeFileSync(outFile, rewritten);
	return outFile;
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	// Compile the internal module first, then the public index barrel so the
	// differential resolves the same entrypoint consumers import.
	compileUpstreamModule('devtools', '.tsx');
	const publicEntry = compileUpstreamModule('index', '.ts');
	writeFileSync(join(cacheDirectory, 'react-devtools.js'), readFileSync(publicEntry));
	const compiled = compileToReact(readFileSync(fixture, 'utf8'), fixture);
	if (compiled.errors?.length)
		throw new Error(`Unable to compile ${fixture}:\n${compiled.errors.join('\n')}`);
	const transformed = transformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: fixture,
	});
	const rewritten = transformed.code.replace(
		/from\s+["']@octanejs\/tanstack-devtools["']/g,
		'from "@tanstack/react-devtools"',
	);
	const slug = basename(fixture).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(fixture)}.js`), rewritten);
}

export async function teardown(): Promise<void> {}

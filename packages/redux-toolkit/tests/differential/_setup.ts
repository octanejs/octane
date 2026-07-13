/**
 * Precompile every Redux Toolkit `.tsrx` fixture through @tsrx/react. Package
 * imports are rewritten to the real React Toolkit/React Redux adapters, making
 * React the behavioral oracle for the same authored fixture.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtureDirectory = join(__dirname, '../_fixtures');
const cacheDirectory = join(__dirname, '.react-cache');

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
	if (compiled.errors?.length) return;

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
		.replaceAll('@octanejs/redux-toolkit/query/react', '@reduxjs/toolkit/query/react')
		.replaceAll('@octanejs/redux-toolkit/react', '@reduxjs/toolkit/react')
		.replaceAll('@octanejs/redux-toolkit/query', '@reduxjs/toolkit/query')
		.replaceAll('@octanejs/redux-toolkit', '@reduxjs/toolkit')
		.replaceAll('@octanejs/redux', 'react-redux')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function walk(directory: string): string[] {
	const output: string[] = [];
	for (const name of readdirSync(directory)) {
		const fullPath = join(directory, name);
		if (statSync(fullPath).isDirectory()) output.push(...walk(fullPath));
		else if (fullPath.endsWith('.tsrx')) output.push(fullPath);
	}
	return output;
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	if (!existsSync(fixtureDirectory)) return;
	for (const file of walk(fixtureDirectory)) compileOne(file);
}

export async function teardown(): Promise<void> {}

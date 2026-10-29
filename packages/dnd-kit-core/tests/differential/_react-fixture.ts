/**
 * Precompile a legacy dnd kit package's differential fixture through
 * @tsrx/react and rewrite its `@octanejs/dnd-kit-*` imports to the published
 * `@dnd-kit/*` packages. The shared differential rig then mounts both products
 * and compares every DOM step. Each package's `_setup.ts` calls this.
 *
 * Fail closed: clear the cache before writing, and throw on React compilation
 * or transform failures so incremental runs never import stale oracle JS.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function compileOne(sourcePath: string, cacheDirectory: string): void {
	const source = readFileSync(sourcePath, 'utf8');
	let compiled;
	try {
		compiled = compileToReact(source, sourcePath);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`React fixture compilation failed for ${sourcePath}: ${detail}`);
	}
	if (compiled.errors?.length) {
		throw new Error(
			`React fixture compilation failed for ${sourcePath}: ${JSON.stringify(compiled.errors)}`,
		);
	}

	let transformed;
	try {
		transformed = transformSync(compiled.code, {
			loader: 'tsx',
			jsx: 'automatic',
			jsxImportSource: 'react',
			target: 'esnext',
			format: 'esm',
			sourcefile: sourcePath,
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`React fixture transform failed for ${sourcePath}: ${detail}`);
	}

	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/dnd-kit-([a-z]+)["']/g, 'from "@dnd-kit/$1"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

/** Compile `../_fixtures/differential.tsrx` into `<differentialDirectory>/.react-cache`. */
export function compileReactFixture(differentialDirectory: string): void {
	const cacheDirectory = join(differentialDirectory, '.react-cache');
	rmSync(cacheDirectory, { recursive: true, force: true });
	mkdirSync(cacheDirectory, { recursive: true });
	compileOne(join(differentialDirectory, '../_fixtures/differential.tsrx'), cacheDirectory);
}

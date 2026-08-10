/**
 * Precompile the declared differential `.tsrx` fixtures through @tsrx/react and
 * rewrite the Octane adapter imports to the upstream @dnd-kit/react package.
 * The normal differential rig then mounts both products and compares every DOM
 * step.
 *
 * Fail closed: clear the cache before writing, and throw on React compilation
 * or transform failures so incremental runs never import stale oracle JS.
 * Only declared differential fixtures enter the oracle cache — conformance
 * fixtures such as `core.tsrx` / `hooks.tsrx` stay out so Octane-only changes
 * there cannot fail the required differential lane.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(currentDirectory, '../_fixtures');
const cacheDirectory = join(currentDirectory, '.react-cache');

/** Fixtures owned by this differential lane — never the unit-only `_fixtures` tree. */
const DECLARED_FIXTURES = ['differential.tsrx'] as const;

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
		.replace(/from\s+["']@octanejs\/dnd-kit(\/[^"']*)?["']/g, function (_match, subpath) {
			return `from "@dnd-kit/react${subpath || ''}"`;
		})
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

export async function setup(): Promise<void> {
	rmSync(cacheDirectory, { recursive: true, force: true });
	mkdirSync(cacheDirectory, { recursive: true });
	for (const name of DECLARED_FIXTURES) {
		compileOne(join(fixtureDirectory, name));
	}
}

export async function teardown(): Promise<void> {}

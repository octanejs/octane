import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { basename, dirname, join } from 'node:path';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, '../_fixtures');
const cacheDirectory = join(directory, '.react-cache');

/** Fixtures owned by this differential lane — never the unit-only `_fixtures` tree. */
const PARITY_FIXTURES = ['parity.tsrx'] as const;

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

function compileFixture(sourcePath: string): void {
	const source = readFileSync(sourcePath, 'utf8');
	let compiled;
	try {
		compiled = compileToReact(source, sourcePath);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`React differential compile failed for ${sourcePath}: ${detail}`);
	}
	if (compiled.errors?.length) {
		throw new Error(
			`React differential compile failed for ${sourcePath}: ${compiled.errors.join('\n')}`,
		);
	}

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
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new Error(`React differential transform failed for ${sourcePath}: ${detail}`);
	}

	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/rxjs(\/[^"']*)?["']/g, function (_match, subpath) {
			return `from "@react-rxjs/core${subpath || ''}"`;
		})
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

export async function setup(): Promise<void> {
	rmSync(cacheDirectory, { recursive: true, force: true });
	mkdirSync(cacheDirectory, { recursive: true });
	for (const name of PARITY_FIXTURES) {
		compileFixture(join(fixtureDirectory, name));
	}
}

export async function teardown(): Promise<void> {}

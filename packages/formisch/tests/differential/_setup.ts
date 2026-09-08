/**
 * Precompile Formisch differential fixtures through @tsrx/react, rewriting
 * `@octanejs/formisch` → `@formisch/react` (and `octane` → `react`) so the
 * shared differential rig mounts the same `.tsrx` scenario on both runtimes.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(currentDirectory, '../_fixtures');
const cacheDirectory = join(currentDirectory, '.react-cache');

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

function compileFixture(sourcePath: string): void {
	const compiled = compileToReact(readFileSync(sourcePath, 'utf8'), sourcePath);
	if (compiled.errors?.length) {
		throw new Error(`Unable to compile ${sourcePath} for React:\n${compiled.errors.join('\n')}`);
	}

	const transformed = transformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/formisch(\/[^"']*)?["']/g,
			function (_match: string, subpath: string | undefined) {
				return `from "@formisch/react${subpath || ''}"`;
			},
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function findDifferentialFixtures(directory: string): string[] {
	return readdirSync(directory).flatMap(function (name) {
		const path = join(directory, name);
		if (statSync(path).isDirectory()) return findDifferentialFixtures(path);
		// Shared scenario only — skip port-authored *.test.tsrx and other fixtures.
		if (name === 'differential.tsrx') return [path];
		return [];
	});
}

export async function setup(): Promise<void> {
	rmSync(cacheDirectory, { recursive: true, force: true });
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	if (!existsSync(fixtureDirectory)) return;
	for (const fixture of findDifferentialFixtures(fixtureDirectory)) {
		compileFixture(fixture);
	}
}

export async function teardown(): Promise<void> {}

import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '../_fixtures');
const cacheDirectory = join(dirname(fileURLToPath(import.meta.url)), '.react-cache');

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
			/from\s+["']@octanejs\/tiptap(\/[^"']*)?["']/g,
			(_match, subpath) => `from "@tiptap/react${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function findFixtures(directory: string): string[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? findFixtures(path) : path.endsWith('.tsrx') ? [path] : [];
	});
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	for (const fixture of findFixtures(fixtureDirectory)) compileFixture(fixture);
}

export async function teardown(): Promise<void> {}

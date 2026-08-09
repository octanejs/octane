import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { basename, dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(directory, '../_fixtures');
const cacheDirectory = join(directory, '.react-cache');

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

function compileFixture(sourcePath: string): void {
	const compiled = compileToReact(readFileSync(sourcePath, 'utf8'), sourcePath);
	if (compiled.errors?.length) throw new Error(compiled.errors.map(String).join('\n'));
	const transformed = esbuildTransformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: sourcePath,
	});
	const rewritten = transformed.code
		.replace(
			/from\s+["']@octanejs\/wagmi(\/[^"']*)?["']/g,
			(_match, subpath) => `from "wagmi${subpath || ''}"`,
		)
		.replace(
			/from\s+["']@octanejs\/tanstack-query(\/[^"']*)?["']/g,
			(_match, subpath) => `from "@tanstack/react-query${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function fixtures(directoryPath: string): string[] {
	return readdirSync(directoryPath).flatMap((name) => {
		const file = join(directoryPath, name);
		return statSync(file).isDirectory() ? fixtures(file) : file.endsWith('.tsrx') ? [file] : [];
	});
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	for (const file of fixtures(fixtureDirectory)) compileFixture(file);
}

export async function teardown(): Promise<void> {}

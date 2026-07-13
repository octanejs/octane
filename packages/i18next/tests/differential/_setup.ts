import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(here, '../_fixtures');
const cacheDirectory = join(here, '.react-cache');

function hashString(value: string): string {
	let hash = 5381;
	for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
	return Math.abs(hash).toString(36);
}

function compileOne(sourcePath: string): void {
	const source = readFileSync(sourcePath, 'utf8');
	const compiled = compileToReact(source, sourcePath);
	if (compiled.errors?.length) return;
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
			/from\s+["']@octanejs\/i18next(\/[^"']*)?["']/g,
			(_match, subpath) => `from "react-i18next${subpath || ''}"`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

export async function setup(): Promise<void> {
	mkdirSync(cacheDirectory, { recursive: true });
	if (!existsSync(fixtureDirectory)) return;
	const walk = (directory: string): string[] =>
		readdirSync(directory).flatMap((name) => {
			const path = join(directory, name);
			return statSync(path).isDirectory() ? walk(path) : path.endsWith('-diff.tsrx') ? [path] : [];
		});
	for (const sourcePath of walk(fixtureDirectory)) compileOne(sourcePath);
}

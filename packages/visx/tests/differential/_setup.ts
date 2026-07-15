import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	realpathSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(currentDirectory, '../_fixtures');
const cacheDirectory = join(currentDirectory, '.react-cache');
const upstreamPackageRoot = dirname(
	realpathSync(join(currentDirectory, '../../node_modules/@visx/visx')),
);

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
	if (compiled.errors?.length) {
		throw new Error(
			`React differential compile failed for ${sourcePath}: ${compiled.errors.join('\n')}`,
		);
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
			/from\s+["']@octanejs\/visx\/([^"']+)["']/g,
			(_match, subpath: string) =>
				`from ${JSON.stringify(join(upstreamPackageRoot, subpath, 'esm/index.js'))}`,
		)
		.replace(
			/from\s+["']@octanejs\/visx["']/g,
			`from ${JSON.stringify(join(upstreamPackageRoot, 'visx/esm/index.js'))}`,
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function walk(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? walk(path) : path.endsWith('.tsrx') ? [path] : [];
	});
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	for (const file of walk(fixtureDirectory)) compileOne(file);
}

export async function teardown(): Promise<void> {}

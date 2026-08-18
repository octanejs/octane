import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '../..');
const repoRoot = resolve(packageRoot, '../..');
const cacheDirectory = join(here, '.react-cache');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'audit/react-parity.json'), 'utf8')) as {
	lanes: Array<{
		id: string;
		files: Array<{ path: string }>;
	}>;
};

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

function compileFixture(sourcePath: string): void {
	const compiled = compileToReact(readFileSync(sourcePath, 'utf8'), sourcePath);
	if (compiled.errors?.length)
		throw new Error(`Unable to compile ${sourcePath}:\n${compiled.errors.join('\n')}`);
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
			/from\s+["']@octanejs\/tanstack-pacer(\/[^"']*)?["']/g,
			function rewritePacer(_match: string, subpath: string | undefined) {
				return `from "@tanstack/react-pacer${subpath || ''}"`;
			},
		)
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function differentialFixtures(): string[] {
	const lane = manifest.lanes.find(function find(entry) {
		return entry.id === 'tanstack-pacer-differential';
	});
	if (!lane) throw new Error('missing tanstack-pacer-differential lane in react-parity.json');
	return lane.files
		.map(function toPath(entry) {
			return entry.path;
		})
		.filter(function keepTsrx(path) {
			return path.endsWith('.tsrx');
		})
		.map(function absolute(path) {
			return resolve(repoRoot, path);
		});
}

export async function setup(): Promise<void> {
	rmSync(cacheDirectory, { recursive: true, force: true });
	mkdirSync(cacheDirectory, { recursive: true });
	for (const fixture of differentialFixtures()) compileFixture(fixture);
}

export async function teardown(): Promise<void> {}

import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = join(directory, '../_fixtures/popper-diff.tsrx');
const cache = join(directory, '.react-cache');

function hashString(value: string): string {
	let hash = 5381;
	for (let index = 0; index < value.length; index++)
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	return Math.abs(hash).toString(36);
}

export async function setup(): Promise<void> {
	mkdirSync(cache, { recursive: true });
	const source = readFileSync(fixture, 'utf8');
	const compiled = compileToReact(source, fixture);
	if (compiled.errors?.length)
		throw new Error(compiled.errors.map((error) => error.message).join('\n'));
	const transformed = transformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: fixture,
	});
	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/popper["']/g, 'from "react-popper"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(fixture).replace(/\.tsrx$/, '');
	writeFileSync(join(cache, `${slug}-${hashString(fixture)}.js`), rewritten);
}

export async function teardown(): Promise<void> {}

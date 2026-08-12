import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = join(directory, '../_fixtures/virtualizers.tsrx');
const cache = join(directory, '.react-cache');

function hashString(value: string) {
	let hash = 5381;
	for (let index = 0; index < value.length; index++) {
		hash = ((hash << 5) + hash + value.charCodeAt(index)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export async function setup() {
	rmSync(cache, { recursive: true, force: true });
	mkdirSync(cache, { recursive: true });
	const compiled = compileToReact(readFileSync(fixture, 'utf8'), fixture);
	if (compiled.errors?.length) throw new Error(JSON.stringify(compiled.errors));
	const transformed = esbuildTransformSync(compiled.code, {
		loader: 'tsx',
		jsx: 'automatic',
		jsxImportSource: 'react',
		target: 'esnext',
		format: 'esm',
		sourcefile: fixture,
	}).code;
	const rewritten = transformed
		.replace(/from\s+["']@octanejs\/window["']/g, 'from "react-window"')
		.replace(/from\s+["']octane["']/g, 'from "react"');
	const slug = basename(fixture).replace(/\.tsrx$/, '');
	writeFileSync(join(cache, `${slug}-${hashString(fixture)}.js`), rewritten);
}

export async function teardown() {
	rmSync(cache, { recursive: true, force: true });
}

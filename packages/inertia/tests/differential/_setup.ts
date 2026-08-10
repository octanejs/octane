import { compile as compileToReact } from '@tsrx/react';
import { transformSync as esbuildTransformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(here, '../_fixtures');
const cacheDirectory = join(here, '.react-cache');
const upstreamRoot = resolve(here, '../../upstream/src');
const upstreamIndex = join(upstreamRoot, 'index.ts');
const upstreamServer = join(upstreamRoot, 'server.ts');
const upstreamPageContext = join(upstreamRoot, 'PageContext.ts');

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
	// Point the React oracle at the vendored upstream adapter source so
	// PageContext and usePage share one module graph (the published package
	// does not export PageContext).
	const rewritten = transformed.code
		.replace(/from\s+["']@octanejs\/inertia\/server["']/g, `from ${JSON.stringify(upstreamServer)}`)
		.replace(/from\s+["']@octanejs\/inertia["']/g, `from ${JSON.stringify(upstreamIndex)}`)
		.replace(/from\s+["']octane["']/g, 'from "react"')
		.replace(/from\s+["']inertia-page-context["']/g, `from ${JSON.stringify(upstreamPageContext)}`);
	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

export async function setup(): Promise<void> {
	mkdirSync(cacheDirectory, { recursive: true });
	if (!existsSync(fixtureDirectory)) return;
	const walk = function (directory: string): string[] {
		return readdirSync(directory).flatMap(function (name) {
			const path = join(directory, name);
			return statSync(path).isDirectory() ? walk(path) : path.endsWith('-diff.tsrx') ? [path] : [];
		});
	};
	for (const sourcePath of walk(fixtureDirectory)) compileOne(sourcePath);
}

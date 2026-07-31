import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const differentialDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = join(differentialDirectory, '../_fixtures');
const cacheDirectory = join(differentialDirectory, '.react-cache');

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
		.replace(/from\s+["']@octanejs\/streamdown\/code["']/g, 'from "@streamdown/code"')
		.replace(/from\s+["']@octanejs\/streamdown\/math["']/g, 'from "@streamdown/math"')
		.replace(/from\s+["']@octanejs\/streamdown\/mermaid["']/g, 'from "@streamdown/mermaid"')
		.replace(/from\s+["']@octanejs\/streamdown\/cjk["']/g, 'from "@streamdown/cjk"')
		.replace(/from\s+["']@octanejs\/streamdown["']/g, 'from "streamdown"')
		.replace(/from\s+["']octane["']/g, 'from "react"');

	const slug = basename(sourcePath).replace(/\.tsrx$/, '');
	writeFileSync(join(cacheDirectory, `${slug}-${hashString(sourcePath)}.js`), rewritten);
}

function findFixtures(directory: string): string[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory).flatMap((name) => {
		const sourcePath = join(directory, name);
		return statSync(sourcePath).isDirectory()
			? findFixtures(sourcePath)
			: sourcePath.endsWith('.tsrx')
				? [sourcePath]
				: [];
	});
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) {
		mkdirSync(cacheDirectory, { recursive: true });
	}
	for (const fixture of findFixtures(fixtureDirectory)) {
		compileFixture(fixture);
	}
}

export async function teardown(): Promise<void> {}

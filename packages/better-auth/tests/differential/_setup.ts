import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = join(directory, 'auth-diff.tsrx');
const cacheDirectory = join(directory, '.react-cache');

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	compileFixture(fixture, cacheDirectory, {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	});
}

export async function teardown(): Promise<void> {}

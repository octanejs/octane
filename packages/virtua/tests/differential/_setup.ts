import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler.ts';

const directory = dirname(fileURLToPath(import.meta.url));
const fixture = join(directory, '../_fixtures/vlist-diff.tsrx');
const cache = join(directory, '.react-cache');

export async function setup(): Promise<void> {
	if (!existsSync(cache)) mkdirSync(cache, { recursive: true });
	compileFixture(fixture, cache, {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	});
}

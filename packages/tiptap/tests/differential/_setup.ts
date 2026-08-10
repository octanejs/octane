import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '../_fixtures');
const cacheDirectory = join(dirname(fileURLToPath(import.meta.url)), '.react-cache');

const fixtures = [
	'basic-editor.tsrx',
	'custom-views-parity.tsrx',
	'custom-views-as-prop-parity.tsrx',
].map(function toAbsolute(name) {
	return join(fixtureDirectory, name);
});

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	for (const fixture of fixtures) {
		compileFixture(fixture, cacheDirectory, {
			readFile: readFileSync,
			compile: compileToReact,
			transform: transformSync,
			writeFile: writeFileSync,
		});
	}
}

export async function teardown(): Promise<void> {}

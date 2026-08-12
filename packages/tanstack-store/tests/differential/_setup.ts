/**
 * Precompile TanStack Store differential fixtures for React. Only `.tsrx`
 * under `_fixtures/differential` are oracles; conformance/upstream fixtures
 * stay out of this lane so their Octane-only imports cannot poison the React
 * cache.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler';

const fixtureDirectory = join(dirname(fileURLToPath(import.meta.url)), '../_fixtures/differential');
const cacheDirectory = join(dirname(fileURLToPath(import.meta.url)), '.react-cache');

function findFixtures(directory: string): string[] {
	return readdirSync(directory).flatMap(function collect(name) {
		const path = join(directory, name);
		return statSync(path).isDirectory() ? findFixtures(path) : path.endsWith('.tsrx') ? [path] : [];
	});
}

export async function setup(): Promise<void> {
	if (!existsSync(cacheDirectory)) mkdirSync(cacheDirectory, { recursive: true });
	if (!existsSync(fixtureDirectory)) return;
	for (const fixture of findFixtures(fixtureDirectory)) {
		compileFixture(fixture, cacheDirectory, {
			readFile: readFileSync,
			compile: compileToReact,
			transform: transformSync,
			writeFile: writeFileSync,
		});
	}
}

export async function teardown(): Promise<void> {}

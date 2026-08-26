/**
 * Precompile differential fixtures for React. The same authored source is loaded
 * by Octane and rewritten to use the published React binding on the oracle side.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler.mjs';
import { DIFFERENTIAL_FIXTURE_FILENAMES } from './fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');

const FIXTURES = DIFFERENTIAL_FIXTURE_FILENAMES.map((name) => join(FIXTURE_DIR, name));

export async function setup() {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	if (!existsSync(FIXTURE_DIR)) return;
	const dependencies = {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	};
	for (const sourcePath of FIXTURES) {
		if (!existsSync(sourcePath)) {
			throw new Error(`Missing declared differential fixture: ${sourcePath}`);
		}
		compileFixture(sourcePath, CACHE_DIR, dependencies);
	}
}

export async function teardown() {}

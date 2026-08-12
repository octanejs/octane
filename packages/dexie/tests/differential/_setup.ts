/**
 * Precompile differential fixtures for React. The same `.tsrx` source is loaded
 * by Octane and rewritten to use the published React binding on the oracle side.
 *
 * Only fixtures the differential oracle loads are compiled here. Shared
 * `_fixtures` also hold browser/conformance sources that must not fail-close
 * this setup (or ordinary shards that run setup.test.ts without this oracle).
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');
const DIFFERENTIAL_SOURCES = [join(FIXTURE_DIR, 'live-query.tsrx')];

export async function setup() {
	if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
	const dependencies = {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	};
	for (const sourcePath of DIFFERENTIAL_SOURCES) {
		if (!existsSync(sourcePath)) {
			throw new Error(`Missing differential fixture: ${sourcePath}`);
		}
		compileFixture(sourcePath, CACHE_DIR, dependencies);
	}
}

export async function teardown() {}

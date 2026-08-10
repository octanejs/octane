/**
 * Precompile differential fixtures for React. The same `.tsrx` source is loaded
 * by Octane and rewritten to use the published React binding on the oracle side.
 */
import { compile as compileToReact } from '@tsrx/react';
import { transformSync } from 'esbuild';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFixture } from './fixture-compiler.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, '../_fixtures');
const CACHE_DIR = join(__dirname, '.react-cache');

function walk(directory) {
	const files = [];
	for (const name of readdirSync(directory)) {
		const fullPath = join(directory, name);
		if (statSync(fullPath).isDirectory()) files.push(...walk(fullPath));
		else if (fullPath.endsWith('.tsrx')) files.push(fullPath);
	}
	return files;
}

export async function setup() {
	// Fail closed: drop stale renamed/removed fixture outputs before recompiling.
	rmSync(CACHE_DIR, { recursive: true, force: true });
	mkdirSync(CACHE_DIR, { recursive: true });
	if (!existsSync(FIXTURE_DIR)) return;
	const dependencies = {
		readFile: readFileSync,
		compile: compileToReact,
		transform: transformSync,
		writeFile: writeFileSync,
	};
	for (const sourcePath of walk(FIXTURE_DIR)) {
		compileFixture(sourcePath, CACHE_DIR, dependencies);
	}
}

export async function teardown() {}

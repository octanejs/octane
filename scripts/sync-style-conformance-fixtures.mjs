#!/usr/bin/env node
/**
 * Vendor the scoped-style conformance fixtures and the parser spec table
 * from the tsrx repository into packages/octane/tests/_fixtures/tsrx-conformance/.
 *
 * The fixtures are owned by @tsrx/core (packages/tsrx/tests/fixtures/scoped-styles
 * and packages/tsrx/tests/utils/fixtures/style-syntax.js there); Octane runs
 * the same expectations through its client and server emitters, and the
 * parser spec table through its native parser plus the JavaScript fallback.
 *
 *   node scripts/sync-style-conformance-fixtures.mjs           # copy
 *   node scripts/sync-style-conformance-fixtures.mjs --check   # fail on drift
 *
 * The source checkout is `TSRX_REPO` (default: a sibling `../tsrx` checkout).
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
const tsrxRoot = resolve(repoRoot, process.env.TSRX_REPO ?? '../tsrx');
const target = join(repoRoot, 'packages/octane/tests/_fixtures/tsrx-conformance');

const SOURCES = [
	{
		from: join(tsrxRoot, 'packages/tsrx/tests/fixtures/scoped-styles'),
		to: join(target, 'scoped-styles'),
	},
	{
		from: join(tsrxRoot, 'packages/tsrx/tests/utils/fixtures/style-syntax.js'),
		to: join(target, 'style-syntax.js'),
	},
];

/** @param {string} dir */
function listFiles(dir) {
	/** @type {string[]} */
	const files = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) files.push(...listFiles(path));
		else files.push(path);
	}
	return files.sort();
}

/** @param {string} path */
function readFile(path) {
	return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

const HEADER = (origin) =>
	`// Vendored from the tsrx repository (${origin}). Do not edit; run\n// \`pnpm sync:style-fixtures\` (scripts/sync-style-conformance-fixtures.mjs).\n`;

/** @type {string[]} */
const drift = [];
/** @type {Map<string, string>} */
const desired = new Map();

for (const source of SOURCES) {
	if (!existsSync(source.from)) {
		console.error(`missing source ${source.from} — set TSRX_REPO to the tsrx checkout`);
		process.exit(1);
	}
	const isDirectory = statSync(source.from).isDirectory();
	const files = isDirectory ? listFiles(source.from) : [source.from];
	for (const file of files) {
		const rel = isDirectory ? relative(source.from, file) : '';
		const dest = isDirectory ? join(source.to, rel) : source.to;
		const origin = relative(tsrxRoot, file);
		let content = readFileSync(file, 'utf8');
		if (dest.endsWith('.js')) content = HEADER(origin) + content;
		desired.set(dest, content);
	}
}

// Stale vendored files (removed upstream) count as drift too.
if (existsSync(target)) {
	for (const file of listFiles(target)) {
		if (!desired.has(file) && !file.endsWith('README.md')) desired.set(file, null);
	}
}

for (const [dest, content] of desired) {
	const current = readFile(dest);
	if (current === content) continue;
	drift.push(relative(repoRoot, dest));
	if (check) continue;
	if (content === null) {
		rmSync(dest);
		continue;
	}
	mkdirSync(join(dest, '..'), { recursive: true });
	writeFileSync(dest, content);
}

if (check && drift.length > 0) {
	console.error('Vendored scoped-style fixtures are out of date:');
	for (const file of drift) console.error(`- ${file}`);
	console.error('Run `pnpm sync:style-fixtures` with TSRX_REPO pointing at the tsrx checkout.');
	process.exit(1);
}

console.log(
	check
		? 'Vendored scoped-style fixtures are up to date.'
		: `Synced ${desired.size} scoped-style fixture file(s)${drift.length ? ` (${drift.length} changed)` : ''}.`,
);

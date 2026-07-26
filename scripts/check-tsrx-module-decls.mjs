// A published package's `src/` must not declare `.tsrx` modules with a wildcard.
//
// `declare module '*.tsrx'` silences `.tsrx` resolution instead of fixing it, so
// every import it covers resolves to `any`, including the package's own exported
// components. It is also ambient, and every package here ships its `src/`
// directly (`"types": "src/index.ts"`), so it travels in the tarball and applies
// to any program that includes it.
//
// Benchmarks, playground apps, and test directories are not published, so the
// same shim there is harmless and stays allowed.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.join(REPO, 'packages');
const SOURCE_FILE = /\.(?:[cm]?tsx?|d\.ts)$/;
const WILDCARD = /^\s*declare\s+module\s+['"]\*\.tsrx['"]/;

function* walk(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== 'node_modules' && entry.name !== 'dist') yield* walk(absolute);
		} else if (SOURCE_FILE.test(entry.name)) {
			yield absolute;
		}
	}
}

const violations = [];
for (const name of readdirSync(PACKAGES)) {
	const manifest = path.join(PACKAGES, name, 'package.json');
	const source = path.join(PACKAGES, name, 'src');
	if (!existsSync(manifest) || !existsSync(source)) continue;
	if (JSON.parse(readFileSync(manifest, 'utf8')).private) continue;

	for (const file of walk(source)) {
		const lines = readFileSync(file, 'utf8').split('\n');
		for (let index = 0; index < lines.length; index++) {
			if (WILDCARD.test(lines[index])) {
				violations.push({ file: path.relative(REPO, file), line: index + 1 });
			}
		}
	}
}

if (violations.length > 0) {
	console.error("A published package's src/ must not contain `declare module '*.tsrx'`:");
	for (const violation of violations) {
		console.error(`  ${violation.file}:${violation.line}`);
	}
	console.error(
		"\nIt resolves every .tsrx import it covers to `any`, including this package's own exports.",
	);
	console.error('Typecheck the package with `tsrx-tsc --noEmit` instead: it reads .tsrx directly,');
	console.error(
		'so no declaration is needed. See the bindings:typecheck script for packages on it.',
	);
	console.error(
		'If the package must stay on tsgo, write a per-module sidecar (packages/tanstack-query/src/QueryClientProvider.tsrx.d.ts).',
	);
	process.exit(1);
}

console.log(
	'tsrx module declaration check passed (no wildcard .tsrx declarations in published src).',
);

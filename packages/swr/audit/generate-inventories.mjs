#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const testRoot = resolve(packageRoot, 'upstream/test');

function filesBelow(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = resolve(directory, entry.name);
		return entry.isDirectory() ? filesBelow(path) : [path];
	});
}

function hash(text) {
	return createHash('sha256').update(text).digest('hex');
}

const files = filesBelow(testRoot).sort();
const runtimeSites = [];
const typeAssertions = [];
const skips = [];

for (const path of files) {
	const source = readFileSync(path, 'utf8');
	const portable = relative(testRoot, path);
	const lines = source.split('\n');
	for (const [index, line] of lines.entries()) {
		if (/^\s*(?:test|it)(?:\.(?:only|skip|todo|each))?\s*\(/.test(line)) {
			const identity = { file: portable, line: index + 1, source: line.trim() };
			if (portable === 'type/trigger.ts')
				typeAssertions.push({ ...identity, kind: 'generic-helper' });
			else runtimeSites.push(identity);
			if (/^\s*(?:test|it)\.skip\s*\(/.test(line)) skips.push(identity);
		}
		if (
			portable.startsWith('type/') &&
			/@ts-expect-error|expectType|expectAssignable|expectNotAssignable/.test(line)
		) {
			typeAssertions.push({
				file: portable,
				line: index + 1,
				source: line.trim(),
				kind: 'type-assertion',
			});
		}
	}
}

writeFileSync(
	resolve(import.meta.dirname, 'upstream-tests.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			artifacts: files.map((path) => ({
				file: relative(testRoot, path),
				sha256: hash(readFileSync(path)),
			})),
			runtimeSites,
			skips,
		},
		null,
		2,
	)}\n`,
);

writeFileSync(
	resolve(import.meta.dirname, 'type-assertions.json'),
	`${JSON.stringify({ schemaVersion: 1, assertions: typeAssertions }, null, 2)}\n`,
);

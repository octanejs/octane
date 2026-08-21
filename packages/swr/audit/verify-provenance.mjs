#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dirname, '..');
const upstream = JSON.parse(
	readFileSync(resolve(import.meta.dirname, 'upstream-tests.json'), 'utf8'),
);
const types = JSON.parse(
	readFileSync(resolve(import.meta.dirname, 'type-assertions.json'), 'utf8'),
);
const collected = JSON.parse(
	readFileSync(resolve(import.meta.dirname, 'collected-jest-tests.json'), 'utf8'),
);
const api = JSON.parse(readFileSync(resolve(import.meta.dirname, 'public-api.json'), 'utf8'));
const repoRoot = resolve(packageRoot, '../..');

function hash(buffer) {
	return createHash('sha256').update(buffer).digest('hex');
}

for (const artifact of upstream.artifacts) {
	const actual = hash(readFileSync(resolve(packageRoot, 'upstream/test', artifact.file)));
	if (actual !== artifact.sha256) throw new Error(`Vendored test drift: ${artifact.file}`);
}

// The committed upstream/ tree verifies offline against the upstream git blob
// shas in audit/upstream.lock.json.
execFileSync(
	process.execPath,
	[
		resolve(repoRoot, 'scripts/react-port/materialize.mjs'),
		'run',
		'--check',
		'--package-dir',
		packageRoot,
	],
	{ cwd: repoRoot, stdio: 'pipe' },
);
const npmHash = hash(readFileSync(resolve(packageRoot, 'upstream-artifact/swr-2.4.2.tgz')));
if (npmHash !== '948ad899c51e73ca9555e8182946978f367410406fe6c2acb4d1012c509c9982') {
	throw new Error(`npm tarball drift: ${npmHash}`);
}

const assertions = types.assertions.filter((item) => item.kind === 'type-assertion');
const helpers = types.assertions.filter((item) => item.kind === 'generic-helper');
const counts = {
	artifacts: upstream.artifacts.length,
	runtimeSites: upstream.runtimeSites.length,
	helpers: helpers.length,
	typeAssertions: assertions.length,
	skips: upstream.skips.length,
	collected: collected.tests.length,
	passed: collected.tests.filter((test) => test.status === 'passed').length,
	pending: collected.tests.filter((test) => test.status === 'pending').length,
};
const expected = {
	artifacts: 53,
	runtimeSites: 338,
	helpers: 3,
	typeAssertions: 181,
	skips: 5,
	collected: 367,
	passed: 362,
	pending: 5,
};
if (JSON.stringify(counts) !== JSON.stringify(expected)) {
	throw new Error(`Pinned inventory mismatch: ${JSON.stringify({ counts, expected })}`);
}
if (api.version !== '2.4.2' || api.commit !== 'f1c1fd855f1e9e7c85755e4232ea4b03c7f81910') {
	throw new Error('Public API provenance mismatch');
}
console.log(`SWR provenance verified: ${JSON.stringify(counts)}`);

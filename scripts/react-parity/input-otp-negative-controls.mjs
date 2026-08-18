#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './harness-lib.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execFileAsync = promisify(execFile);
const original = JSON.parse(
	await readFile(path.join(repo, 'packages/input-otp/audit/react-parity.json'), 'utf8'),
);

for (const mutate of [
	(copy) => {
		copy.provenance.integrity = 'sha256:deadbeef';
	},
	(copy) => {
		copy.lanes[0].files[0].sha256 = '0'.repeat(63);
	},
	(copy) => {
		copy.provenance.verification = 'verified-without-running';
	},
]) {
	const copy = structuredClone(original);
	mutate(copy);
	assert.throws(() => validateManifest(copy));
}

const rewrittenPath = 'packages/input-otp/tests/pristine/upstream.browser.test.ts';
const rewrittenAbsolute = path.join(repo, rewrittenPath);
const rewritten = await readFile(rewrittenAbsolute, 'utf8');
const assertionMutation = rewritten.replace("toBe('');", "toBe('mutated');");
assert.notEqual(assertionMutation, rewritten);
await writeFile(rewrittenAbsolute, assertionMutation);
try {
	await assert.rejects(
		() =>
			execFileAsync(process.execPath, ['scripts/react-parity/input-otp-generate.mjs'], {
				cwd: repo,
			}),
		/Pristine adaptation ledger mismatch/,
	);
} finally {
	await writeFile(rewrittenAbsolute, rewritten);
}

console.log(
	'input-otp parity negative controls rejected malformed integrity, evidence hashes, verification state, and a same-name assertion mutation.',
);

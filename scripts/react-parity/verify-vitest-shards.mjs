#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRequiredVitestLanes, verifyBatchedVitestResult } from './vitest-batch-lib.mjs';

const repo = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);

function flag(name) {
	const index = args.indexOf(name);
	if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}`);
	return args[index + 1];
}

if (args.length !== 4) {
	throw new Error(
		'Usage: verify-vitest-shards.mjs --reports-directory PATH --expected-shards COUNT',
	);
}

const reportsDirectory = resolve(flag('--reports-directory'));
const expectedShards = Number(flag('--expected-shards'));
if (!Number.isInteger(expectedShards) || expectedShards < 1) {
	throw new Error('--expected-shards must be a positive integer');
}

const reportFiles = readdirSync(reportsDirectory)
	.filter((file) => file.endsWith('.json'))
	.sort();
if (reportFiles.length !== expectedShards) {
	throw new Error(
		`expected ${expectedShards} React parity Vitest shard reports, found ${reportFiles.length}`,
	);
}

verifyBatchedVitestResult(
	loadRequiredVitestLanes(repo),
	reportFiles.map((file) => readFileSync(resolve(reportsDirectory, file), 'utf8')),
	repo,
);
console.log(
	`verified complete React parity Vitest coverage across ${reportFiles.length} shard reports`,
);

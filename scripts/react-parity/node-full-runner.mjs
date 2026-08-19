#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);

function flag(name) {
	const index = args.indexOf(name);
	if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}`);
	return args[index + 1];
}

const suiteRoot = resolve(repoRoot, flag('--root'));
const file = resolve(repoRoot, flag('--file'));
const loader = resolve(repoRoot, flag('--loader'));
const inventory = JSON.parse(readFileSync(resolve(repoRoot, flag('--inventory')), 'utf8'));
const result = spawnSync(
	process.execPath,
	[
		'--conditions',
		'development',
		`--experimental-loader=${loader}`,
		'--no-warnings',
		'--test-reporter=tap',
		file,
	],
	{ cwd: suiteRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);

if (result.status !== 0) {
	process.stderr.write(`${result.stdout}\n${result.stderr}`);
	process.exit(result.status ?? 1);
}

const titles = [...result.stdout.matchAll(/^    # Subtest: (.+)$/gm)].map((match) =>
	match[1].replaceAll('\\#', '#'),
);
const expectedTitles = inventory.tests.map((test) => test.fullName);
if (JSON.stringify([...titles].sort()) !== JSON.stringify([...expectedTitles].sort())) {
	throw new Error(
		`Node suite registered unexpected leaf tests: expected ${expectedTitles.length}, received ${titles.length}`,
	);
}

process.stdout.write(
	JSON.stringify({
		schemaVersion: 1,
		tests: titles
			.map((fullName) => ({
				file: toPortablePath(relative(repoRoot, file)),
				fullName,
				status: 'passed',
			}))
			.sort(compareTestIdentities),
	}),
);

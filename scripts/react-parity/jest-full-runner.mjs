#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);

function flag(name) {
	const index = args.indexOf(name);
	if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}`);
	return args[index + 1];
}

if (args.length !== 4 || !args.every((value, index) => index % 2 === 0 || value.length > 0))
	throw new Error('Usage: jest-full-runner.mjs --config PATH --root PATH');

const config = flag('--config');
const suiteRoot = flag('--root');
const absoluteSuiteRoot = resolve(repoRoot, suiteRoot);
const report = join(tmpdir(), `octane-react-parity-jest-${process.pid}.json`);
const jestBin = createRequire(resolve(repoRoot, config)).resolve('jest/bin/jest');
const result = spawnSync(
	process.execPath,
	[
		jestBin,
		'--config',
		resolve(repoRoot, config),
		'--rootDir',
		absoluteSuiteRoot,
		'--runInBand',
		'--no-watchman',
		'--json',
		`--outputFile=${report}`,
	],
	{ cwd: repoRoot, encoding: 'utf8' },
);

try {
	if (result.status !== 0) {
		process.stderr.write(`${result.stdout}\n${result.stderr}`);
		process.exitCode = result.status ?? 1;
	} else {
		const reportJson = JSON.parse(readFileSync(report, 'utf8'));
		const tests = reportJson.testResults
			.flatMap((suite) =>
				suite.assertionResults.map((test) => ({
					file: toPortablePath(relative(absoluteSuiteRoot, suite.name)),
					fullName: test.fullName,
					status: test.status,
				})),
			)
			.sort(compareTestIdentities);
		process.stdout.write(
			JSON.stringify({
				schemaVersion: 1,
				tests,
				snapshots: reportJson.snapshot?.total ?? 0,
			}),
		);
	}
} finally {
	rmSync(report, { force: true });
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyReactTransitionGroupUpstream } from './react-transition-group-upstream-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const report = join(tmpdir(), `octane-react-transition-group-pristine-${process.pid}.json`);
const destination = resolve(root, 'packages/transition-group/audit/pristine-runtime.json');
const jestBin = createRequire(resolve(root, 'packages/transition-group/package.json')).resolve(
	'jest/bin/jest',
);

export function pristineTestIdentities(result, repoRoot = root) {
	return result.testResults
		.flatMap(function mapSuite(suite) {
			return suite.assertionResults.map(function mapTest(test) {
				return {
					file: toPortablePath(
						relative(resolve(repoRoot, 'packages/transition-group/upstream'), suite.name),
					),
					fullName: test.fullName,
					status: test.status,
				};
			});
		})
		.sort(compareTestIdentities);
}

export function runPristineUpstreamSuite({ repoRoot = root, reportPath = report } = {}) {
	verifyReactTransitionGroupUpstream(repoRoot);
	const result = spawnSync(
		process.execPath,
		[
			jestBin,
			'--config',
			resolve(repoRoot, 'packages/transition-group/tests/upstream-jest.config.cjs'),
			'--rootDir',
			resolve(repoRoot, 'packages/transition-group/upstream'),
			'--runInBand',
			'--no-watchman',
			'--json',
			`--outputFile=${reportPath}`,
		],
		{ cwd: repoRoot, encoding: 'utf8' },
	);
	const reportJson = JSON.parse(readFileSync(reportPath, 'utf8'));
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		report: reportJson,
		identities: pristineTestIdentities(reportJson, repoRoot),
	};
}

if (process.argv.includes('--write')) {
	const result = runPristineUpstreamSuite();
	try {
		if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
		const tests = result.identities.filter(function keepPassed(test) {
			return test.status === 'passed';
		});
		writeFileSync(
			destination,
			`${JSON.stringify(
				{
					schemaVersion: 1,
					root: 'packages/transition-group/upstream',
					tests,
					snapshots: result.report.snapshot?.total ?? 0,
				},
				null,
				2,
			)}\n`,
		);
		console.log(`packages/transition-group/audit/pristine-runtime.json: ${tests.length} tests`);
	} finally {
		rmSync(report, { force: true });
	}
}

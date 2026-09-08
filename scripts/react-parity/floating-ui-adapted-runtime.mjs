#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const PACKAGE_PATH = 'packages/floating-ui';

export function adaptedTestIdentities(report, repoRoot) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const file = toPortablePath(path.relative(repoRoot, path.resolve(suite.name)));
		for (const test of suite.assertionResults ?? []) {
			if (test.status === 'pending' || test.status === 'todo') continue;
			identities.push({
				file,
				fullName: test.fullName ?? test.title,
				status: test.status,
			});
		}
	}
	return identities.sort(compareTestIdentities);
}

export function runAdaptedUpstreamSuite({
	repoRoot,
	reportPath = path.join(tmpdir(), `octane-adapted-floating-ui-${process.pid}.json`),
} = {}) {
	if (!repoRoot) throw new Error('runAdaptedUpstreamSuite requires repoRoot');
	const packageRoot = path.resolve(repoRoot, PACKAGE_PATH);
	try {
		const result = spawnSync(
			path.join(packageRoot, 'node_modules/.bin/vitest'),
			[
				'run',
				'--config',
				path.join(packageRoot, 'tests/adapted-vitest.config.ts'),
				'--reporter=json',
				`--outputFile=${reportPath}`,
			],
			{
				cwd: packageRoot,
				env: { ...process.env, CI: process.env.CI ?? 'true' },
				encoding: 'utf8',
			},
		);
		const report = JSON.parse(readFileSync(reportPath, 'utf8'));
		return {
			status: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			report,
			identities: adaptedTestIdentities(report, repoRoot),
		};
	} finally {
		rmSync(reportPath, { force: true });
	}
}

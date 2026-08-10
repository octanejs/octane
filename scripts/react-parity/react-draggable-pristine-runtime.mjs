#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../packages/react-draggable',
);
const upstreamTag = join(packageRoot, 'upstream/tag');

export function pristineTestIdentities(report, repoRoot = resolve(packageRoot, '../..')) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const absoluteFile = resolve(suite.name);
		const relativeFile = toPortablePath(relative(repoRoot, absoluteFile));
		const portable = relativeFile.includes('/.pristine-upstream-')
			? relativeFile.replace(
					/^packages\/react-draggable\/\.pristine-upstream-[^/]+\//u,
					'packages/react-draggable/upstream/tag/',
				)
			: relativeFile;
		for (const test of suite.assertionResults ?? []) {
			if (test.status === 'pending' || test.status === 'todo') continue;
			identities.push({
				file: portable,
				fullName: test.fullName ?? test.title,
				status: test.status,
			});
		}
	}
	return identities.sort(compareTestIdentities);
}

export function runPristineUpstreamSuite({
	repoRoot = resolve(packageRoot, '../..'),
	reportPath = join(tmpdir(), `octane-react-draggable-pristine-${process.pid}.json`),
} = {}) {
	const runRoot = mkdtempSync(join(packageRoot, '.pristine-upstream-'));
	try {
		cpSync(join(upstreamTag, 'lib'), join(runRoot, 'lib'), { recursive: true });
		cpSync(join(upstreamTag, 'test'), join(runRoot, 'test'), { recursive: true });
		cpSync(join(upstreamTag, 'typings'), join(runRoot, 'typings'), { recursive: true });
		writeFileSync(
			join(runRoot, 'package.json'),
			JSON.stringify({ name: 'react-draggable-pristine', private: true, type: 'module' }),
		);
		const result = spawnSync(
			join(repoRoot, 'node_modules/.bin/vitest'),
			[
				'run',
				'--config',
				join(packageRoot, 'tests/upstream-vitest.config.ts'),
				'--reporter=json',
				`--outputFile=${reportPath}`,
			],
			{
				cwd: packageRoot,
				env: {
					...process.env,
					CI: process.env.CI ?? 'true',
					REACT_DRAGGABLE_PRISTINE_ROOT: runRoot,
				},
				encoding: 'utf8',
			},
		);
		const report = JSON.parse(readFileSync(reportPath, 'utf8'));
		return {
			status: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			identities: pristineTestIdentities(report, repoRoot),
			report,
		};
	} finally {
		rmSync(runRoot, { recursive: true, force: true });
	}
}

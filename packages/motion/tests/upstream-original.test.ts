import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

import { verifyMotionUpstream } from '../scripts/verify-upstream.mjs';

function findRepoRoot(start: string): string {
	let directory = resolve(start);
	const filesystemRoot = parse(directory).root;
	while (directory !== filesystemRoot) {
		if (
			existsSync(resolve(directory, 'pnpm-workspace.yaml')) &&
			existsSync(resolve(directory, 'packages/motion/package.json'))
		) {
			return directory;
		}
		directory = dirname(directory);
	}
	throw new Error(`Could not locate the Octane repository above ${start}`);
}

function compareIdentities(
	a: { file: string; fullName: string },
	b: { file: string; fullName: string },
): number {
	if (a.file === b.file) return a.fullName.localeCompare(b.fullName);
	return a.file.localeCompare(b.file);
}

const repoRoot = findRepoRoot(process.cwd());
const upstreamRoot = resolve(repoRoot, 'packages/motion/upstream');
const jestBin = createRequire(resolve(repoRoot, 'packages/motion/package.json')).resolve(
	'jest/bin/jest',
);

// @parity-case pristine:motion-use-motion-value-original-suite
it('runs the curated Motion useMotionValue Jest suite unchanged', function () {
	verifyMotionUpstream(resolve(repoRoot, 'packages/motion'));
	const report = join(tmpdir(), `octane-motion-pristine-${process.pid}.json`);
	const result = spawnSync(
		process.execPath,
		[
			jestBin,
			'--config',
			resolve(repoRoot, 'packages/motion/tests/upstream-jest.config.cjs'),
			'--rootDir',
			upstreamRoot,
			'--runInBand',
			'--no-watchman',
			'--json',
			`--outputFile=${report}`,
		],
		{ cwd: repoRoot, encoding: 'utf8' },
	);
	const output = `${result.stdout}\n${result.stderr}`;
	expect(result.status, output).toBe(0);
	expect(output).toMatch(/Tests:\s+5 passed, 5 total/);
	const expected = JSON.parse(
		readFileSync(resolve(repoRoot, 'packages/motion/audit/pristine-runtime.json'), 'utf8'),
	).tests;
	const reportJson = JSON.parse(readFileSync(report, 'utf8'));
	const executed = reportJson.testResults
		.flatMap(function mapSuite(suite: {
			name: string;
			assertionResults: Array<{ fullName: string; status: string }>;
		}) {
			return suite.assertionResults.map(function mapTest(test: {
				fullName: string;
				status: string;
			}) {
				return {
					file: relative(upstreamRoot, suite.name).split('\\').join('/'),
					fullName: test.fullName,
					status: test.status,
				};
			});
		})
		.sort(compareIdentities);
	expect(executed).toEqual(expected);
}, 60_000);

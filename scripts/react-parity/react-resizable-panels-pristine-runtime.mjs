#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../packages/resizable-panels',
);

export function pristineTestIdentities(report, repoRoot = resolve(packageRoot, '../..')) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const absoluteFile = resolve(suite.name);
		const relativeFile = toPortablePath(relative(repoRoot, absoluteFile));
		for (const test of suite.assertionResults ?? []) {
			if (test.status === 'pending' || test.status === 'todo') continue;
			identities.push({
				file: relativeFile,
				fullName: test.fullName ?? test.title,
				status: test.status,
			});
		}
	}
	return identities.sort(compareTestIdentities);
}

export function runPristineUpstreamSuite({
	repoRoot = resolve(packageRoot, '../..'),
	reportPath = join(tmpdir(), `octane-rrp-pristine-${process.pid}.json`),
} = {}) {
	// The pristine oracle runs on the package's own pinned toolchain
	// (vitest 3 + jsdom 26, matching the pinned upstream devDependencies), not
	// the workspace root's; jsdom 30 serializes styles differently
	// (minHeight: 0 reads back '0px', upstream asserts '0').
	const result = spawnSync(
		join(packageRoot, 'node_modules/.bin/vitest'),
		[
			'run',
			'--config',
			join(packageRoot, 'vitest.pristine.config.ts'),
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
		identities: pristineTestIdentities(report, repoRoot),
	};
}

export function inventoryFromIdentities(identities) {
	const idOccurrences = new Map();
	const tests = identities
		.filter(function keepPassed(test) {
			return test.status === 'passed';
		})
		.map(function toInventoryEntry(test) {
			const baseId = `runtime:${createHash('sha256')
				.update(`${test.file}\0${test.fullName}`)
				.digest('hex')
				.slice(0, 16)}`;
			const occurrence = idOccurrences.get(baseId) ?? 0;
			idOccurrences.set(baseId, occurrence + 1);
			return {
				id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
				file: test.file,
				fullName: test.fullName,
			};
		})
		.sort(compareTestIdentities);
	return {
		schemaVersion: 1,
		project: 'react-resizable-panels-pristine',
		roots: ['packages/resizable-panels/upstream/lib'],
		files: [
			...new Set(
				tests.map(function fileOf(test) {
					return test.file;
				}),
			),
		].sort(),
		tests,
		snapshots: 0,
	};
}

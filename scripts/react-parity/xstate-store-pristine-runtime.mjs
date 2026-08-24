#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyXstateStoreUpstream } from '../../packages/xstate-store/scripts/verify-upstream.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/xstate-store');
const upstreamRoot = join(packageRoot, 'upstream');

export function pristineTestIdentities(report, repoRoot = resolve(packageRoot, '../..')) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const absoluteFile = resolve(suite.name);
		const relativeFile = toPortablePath(relative(repoRoot, absoluteFile));
		const portable = relativeFile.includes('/.pristine-upstream-')
			? relativeFile.replace(
					/^packages\/xstate-store\/\.pristine-upstream-[^/]+\//u,
					'packages/xstate-store/upstream/',
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
	reportPath = join(tmpdir(), `octane-xstate-store-pristine-${process.pid}.json`),
} = {}) {
	verifyXstateStoreUpstream(packageRoot);
	const runRoot = mkdtempSync(join(packageRoot, '.pristine-upstream-'));
	try {
		// Upstream colocates its tests with the source, so one copy carries both.
		cpSync(join(upstreamRoot, 'src'), join(runRoot, 'src'), { recursive: true });
		writeFileSync(
			join(runRoot, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					esModuleInterop: true,
					jsx: 'react-jsx',
					jsxImportSource: 'react',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					target: 'ES2020',
				},
			}),
		);
		const result = spawnSync(
			join(packageRoot, 'node_modules/.bin/vitest'),
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
					XSTATE_STORE_PRISTINE_ROOT: runRoot,
				},
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
	} finally {
		rmSync(runRoot, { recursive: true, force: true });
	}
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
		project: 'xstate-store-pristine',
		roots: ['packages/xstate-store/upstream'],
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

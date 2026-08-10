#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyReactSpringVendoredBytes } from './react-spring-upstream-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/react-spring');
const upstreamRoot = join(packageRoot, 'upstream');
const repoRootDefault = resolve(packageRoot, '../..');

export function pristineTestIdentities(report, repoRoot = repoRootDefault) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const absoluteFile = resolve(suite.name);
		const relativeFile = toPortablePath(relative(repoRoot, absoluteFile));
		const portable = relativeFile.includes('/.pristine-upstream-')
			? relativeFile.replace(
					/^packages\/react-spring\/\.pristine-upstream-[^/]+\//u,
					'packages/react-spring/upstream/',
				)
			: relativeFile.startsWith('packages/react-spring/upstream/')
				? relativeFile
				: `packages/react-spring/upstream/${relative(upstreamRoot, absoluteFile).split('\\').join('/')}`;
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
	repoRoot = repoRootDefault,
	reportPath = join(tmpdir(), `octane-react-spring-pristine-${process.pid}.json`),
} = {}) {
	verifyReactSpringVendoredBytes(repoRoot);
	const runRoot = mkdtempSync(join(packageRoot, '.pristine-upstream-'));
	try {
		for (const entry of [
			'packages',
			'targets',
			'vitest.config.ts',
			'LICENSE',
			'SHA256SUMS',
			'package.json',
		]) {
			const source = join(upstreamRoot, entry);
			if (!existsSync(source)) continue;
			cpSync(source, join(runRoot, entry), { recursive: true });
		}
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
				cwd: repoRoot,
				env: {
					...process.env,
					CI: process.env.CI ?? 'true',
					REACT_SPRING_PRISTINE_ROOT: runRoot,
				},
				encoding: 'utf8',
				maxBuffer: 64 * 1024 * 1024,
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
		project: 'react-spring-pristine',
		roots: ['packages/react-spring/upstream'],
		files: [
			...new Set(
				tests.map(function fileOf(test) {
					return test.file;
				}),
			),
		].sort(),
		tests,
	};
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] ?? '')).href) {
	const result = runPristineUpstreamSuite();
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	const inventory = inventoryFromIdentities(result.identities);
	writeFileSync(
		join(packageRoot, 'audit/pristine-runtime.json'),
		`${JSON.stringify(inventory, null, '\t')}\n`,
	);
	console.log(
		`React Spring pristine upstream: ${inventory.tests.length} passed identities (status=${result.status}).`,
	);
	process.exitCode = result.status === 0 ? 0 : 1;
}

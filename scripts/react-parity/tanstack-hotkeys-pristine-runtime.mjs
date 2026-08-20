#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../packages/tanstack-hotkeys',
);
const repoRootDefault = resolve(packageRoot, '../..');
const inventoryPath = resolve(packageRoot, 'audit/pristine-runtime.json');

export function pristineTestIdentities(report, repoRoot = repoRootDefault) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const relativeFile = toPortablePath(relative(repoRoot, resolve(suite.name)));
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
		project: 'tanstack-hotkeys-pristine',
		roots: ['packages/tanstack-hotkeys/upstream/tests'],
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

export function runPristineUpstreamSuite({
	repoRoot = repoRootDefault,
	reportPath = join(tmpdir(), `octane-tanstack-hotkeys-pristine-${process.pid}.json`),
} = {}) {
	const requireFromPackage = createRequire(resolve(packageRoot, 'package.json'));
	const vitestBin = resolve(
		dirname(requireFromPackage.resolve('vitest/package.json')),
		'vitest.mjs',
	);
	const result = spawnSync(
		process.execPath,
		[
			vitestBin,
			'run',
			'--config',
			resolve(packageRoot, 'tests/upstream-pristine.vitest.config.ts'),
			'--reporter=json',
			`--outputFile=${reportPath}`,
		],
		{
			cwd: resolve(packageRoot, 'upstream'),
			encoding: 'utf8',
			env: {
				...process.env,
				NODE_OPTIONS: undefined,
			},
		},
	);
	const report = JSON.parse(readFileSync(reportPath, 'utf8'));
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		reportPath,
		report,
		identities: pristineTestIdentities(report, repoRoot),
	};
}

export function writePristineRuntimeInventory({ repoRoot = repoRootDefault } = {}) {
	const result = runPristineUpstreamSuite({ repoRoot });
	if (result.status !== 0) {
		process.stderr.write(result.stdout);
		process.stderr.write(result.stderr);
		throw new Error('TanStack Hotkeys pristine upstream suite failed while generating inventory');
	}
	const inventory = inventoryFromIdentities(result.identities);
	mkdirSync(dirname(inventoryPath), { recursive: true });
	writeFileSync(inventoryPath, `${JSON.stringify(inventory, null, '\t')}\n`);
	console.log(
		`packages/tanstack-hotkeys/audit/pristine-runtime.json: ${inventory.tests.length} tests`,
	);
	return inventory;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	writePristineRuntimeInventory();
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/pdf');
const upstreamTag = join(packageRoot, 'upstream/packages/react-pdf');
const upstreamSupport = join(packageRoot, 'upstream');

export function pristineTestIdentities(report, repoRoot = resolve(packageRoot, '../..')) {
	const identities = [];
	for (const suite of report.testResults ?? []) {
		const absoluteFile = resolve(suite.name);
		const relativeFile = toPortablePath(relative(repoRoot, absoluteFile));
		const portable = relativeFile.includes('/.pristine-upstream-')
			? relativeFile.replace(
					/^packages\/pdf\/\.pristine-upstream-[^/]+\/packages\/pdf\//u,
					'packages/pdf/upstream/packages/react-pdf/',
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

function materializePristineRoot(runRoot) {
	const packageDir = join(runRoot, 'packages/pdf');
	mkdirSync(packageDir, { recursive: true });
	cpSync(join(upstreamTag, 'src'), join(packageDir, 'src'), { recursive: true });
	cpSync(join(upstreamTag, 'vitest.setup.ts'), join(packageDir, 'vitest.setup.ts'));
	cpSync(join(upstreamTag, 'package.json'), join(packageDir, 'package.json'));
	cpSync(join(upstreamTag, 'tsconfig.json'), join(packageDir, 'tsconfig.json'));
	cpSync(upstreamSupport + '/__mocks__', join(runRoot, '__mocks__'), { recursive: true });
	// Specs import test-utils.js and __mocks__/*.js; upstream's Vite maps those
	// specifiers to the TypeScript authorities, so emit thin re-exports here
	// rather than vendoring repo-authored shims inside the pristine tree.
	writeFileSync(
		join(runRoot, 'test-utils.ts'),
		readFileSync(join(upstreamSupport, 'test-utils.ts'), 'utf8'),
	);
	writeFileSync(join(runRoot, 'test-utils.js'), "export * from './test-utils.ts';\n");
	for (const mock of ['_failing_page', '_failing_pdf', '_silently_failing_pdf']) {
		writeFileSync(
			join(runRoot, '__mocks__', `${mock}.js`),
			`export { default } from './${mock}.ts';\n`,
		);
	}
}

export function runPristineUpstreamSuite({
	repoRoot = resolve(packageRoot, '../..'),
	reportPath = join(tmpdir(), `octane-pdf-pristine-${process.pid}.json`),
} = {}) {
	const runRoot = mkdtempSync(join(packageRoot, '.pristine-upstream-'));
	try {
		materializePristineRoot(runRoot);
		const vitestBin = join(packageRoot, 'node_modules/.bin/vitest');
		const result = spawnSync(
			vitestBin,
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
					REACT_PDF_PRISTINE_ROOT: runRoot,
				},
				encoding: 'utf8',
				maxBuffer: 32 * 1024 * 1024,
			},
		);
		let report = { testResults: [] };
		try {
			report = JSON.parse(readFileSync(reportPath, 'utf8'));
		} catch {
			// leave empty report; status/stderr carry the failure
		}
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
		project: 'pdf-pristine',
		roots: ['packages/pdf/upstream/packages/react-pdf'],
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const result = runPristineUpstreamSuite();
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (process.argv.includes('--write-inventory')) {
		const inventory = inventoryFromIdentities(result.identities);
		const destination = join(packageRoot, 'audit/pristine-runtime.json');
		writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
		console.log(`${destination}: ${inventory.tests.length} tests`);
	}
	const passed = result.identities.filter(function isPassed(test) {
		return test.status === 'passed';
	}).length;
	const failed = result.identities.filter(function isFailed(test) {
		return test.status !== 'passed';
	}).length;
	console.log(`react-pdf pristine upstream: ${passed} passed, ${failed} non-passing.`);
	process.exitCode = result.status;
}

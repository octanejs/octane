#!/usr/bin/env node
import { dirname, resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { collectTests } from './playwright-full-runner.mjs';
import { verifyMaterializedUpstreamEvidence } from './materialized-upstream-lib.mjs';
import { fileURLToPath } from 'node:url';

import {
	inventoryFromIdentities as configuredInventoryFromIdentities,
	pristineIdentitiesFromReport,
	runConfiguredPristineSuite,
} from './pristine-suite-lib.mjs';

// The runner behavior lives in packages/tanstack-virtual/audit/pristine-suite.json,
// executed by the shared config-driven engine; this module keeps the
// package-scoped export names its consumers import.
const PACKAGE_PATH = 'packages/tanstack-virtual';
const repoRootDefault = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function pristineTestIdentities(report, repoRoot = repoRootDefault) {
	return pristineIdentitiesFromReport(report, { repoRoot, packagePath: PACKAGE_PATH });
}

export function runPristineUpstreamSuite({ repoRoot = repoRootDefault, reportPath } = {}) {
	return runConfiguredPristineSuite(repoRoot, PACKAGE_PATH, { reportPath });
}

export function inventoryFromIdentities(identities) {
	return configuredInventoryFromIdentities(identities, {
		project: 'tanstack-virtual-pristine',
		roots: ['packages/tanstack-virtual/upstream'],
	});
}

/** Browser fixtures retain upstream assertions; native fixtures change only renderer imports. */
export function browserTestIdentities(report, mode) {
	if (!['pristine', 'adapted'].includes(mode))
		throw new Error(`Invalid Virtual browser mode: ${mode}`);
	return collectTests(report.suites ?? [], (spec) => {
		const file = spec.file.replaceAll('\\', '/');
		const relative = file.includes('/')
			? file
			: `${mode === 'pristine' ? 'upstream/e2e/app/test' : 'tests/upstream/browser/test'}/${file}`;
		return `${PACKAGE_PATH}/${relative}`;
	});
}

export function runBrowserSuite(
	mode,
	{
		repoRoot = repoRootDefault,
		reportPath = join(tmpdir(), `octane-virtual-browser-${mode}-${randomUUID()}.json`),
	} = {},
) {
	if (!['pristine', 'adapted'].includes(mode))
		throw new Error(`Invalid Virtual browser mode: ${mode}`);
	verifyMaterializedUpstreamEvidence(repoRoot, PACKAGE_PATH);
	const result = spawnSync(
		process.execPath,
		[
			resolve(repoRoot, PACKAGE_PATH, 'node_modules/@playwright/test/cli.js'),
			'test',
			'--config',
			resolve(repoRoot, PACKAGE_PATH, 'tests/browser-playwright.config.ts'),
			'--reporter=json',
		],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				OCTANE_VIRTUAL_BROWSER_MODE: mode,
				PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
			},
			encoding: 'utf8',
			maxBuffer: 32 * 1024 * 1024,
			timeout: 180_000,
		},
	);
	if (result.error) throw result.error;
	if (!existsSync(reportPath))
		throw new Error(
			`Virtual browser runner exited ${result.status} without a report: ${result.stdout ?? ''}${result.stderr ?? ''}`,
		);
	const report = JSON.parse(readFileSync(reportPath, 'utf8'));
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		report,
		identities: browserTestIdentities(report, mode),
	};
}

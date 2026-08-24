import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyMaterializedUpstreamEvidence } from './materialized-upstream-lib.mjs';

export const PRISTINE_SUITE_CONFIG_RELATIVE_PATH = 'audit/pristine-suite.json';

/**
 * Typed configuration for the common pristine-suite runner: assemble a scratch
 * root from the lock-pinned upstream bytes (plus optional port-authored
 * overlays and inline files), run the package's pristine Vitest config against
 * it, and map the report back to portable upstream identities. A runner that
 * cannot be expressed this way (a different test runner, bespoke report
 * parsing) keeps its own script; this engine replaces the copied-and-renamed
 * majority.
 */
export function loadPristineSuiteConfig(repoRoot, packagePath) {
	const configPath = path.resolve(repoRoot, packagePath, PRISTINE_SUITE_CONFIG_RELATIVE_PATH);
	if (!existsSync(configPath)) {
		throw new Error(
			`missing pristine suite config: ${packagePath}/${PRISTINE_SUITE_CONFIG_RELATIVE_PATH}`,
		);
	}
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	if (config.schemaVersion !== 1) {
		throw new Error(`pristine suite config schemaVersion must be 1: ${config.schemaVersion}`);
	}
	for (const field of ['project', 'vitestConfig', 'rootEnvVar']) {
		if (typeof config[field] !== 'string' || !config[field]) {
			throw new Error(`pristine suite config must declare ${field}`);
		}
	}
	if (!Array.isArray(config.copy) || config.copy.length === 0) {
		throw new Error('pristine suite config must copy at least one pinned root');
	}
	for (const entry of [
		...config.copy,
		...(config.overlay ? [config.overlay] : []),
		...Object.keys(config.inlineFiles ?? {}),
	]) {
		if (typeof entry !== 'string' || !entry || entry.startsWith('/') || entry.includes('..')) {
			throw new Error(`pristine suite config path is not package-relative: ${String(entry)}`);
		}
	}
	return config;
}

export function pristineIdentitiesFromReport(report, { repoRoot, packagePath }) {
	const identities = [];
	const scratchPattern = new RegExp(`^${packagePath}/\\.pristine-upstream-[^/]+/`, 'u');
	for (const suite of report.testResults ?? []) {
		const relativeFile = toPortablePath(path.relative(repoRoot, path.resolve(suite.name)));
		const portable = relativeFile.replace(scratchPattern, `${packagePath}/upstream/`);
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

export function runConfiguredPristineSuite(
	repoRoot,
	packagePath,
	{
		reportPath = path.join(
			tmpdir(),
			`octane-pristine-${path.basename(packagePath)}-${process.pid}.json`,
		),
	} = {},
) {
	const config = loadPristineSuiteConfig(repoRoot, packagePath);
	const packageRoot = path.resolve(repoRoot, packagePath);
	const upstreamRoot = path.join(packageRoot, 'upstream');
	verifyMaterializedUpstreamEvidence(repoRoot, packagePath);
	// The scratch prefix lives inside the package so report paths rewrite to
	// the stable portable upstream/ prefix the inventories are recorded in.
	const runRoot = mkdtempSync(path.join(packageRoot, '.pristine-upstream-'));
	try {
		for (const copyRoot of config.copy) {
			cpSync(path.join(upstreamRoot, copyRoot), path.join(runRoot, copyRoot), {
				recursive: true,
			});
		}
		if (config.overlay) {
			cpSync(path.join(packageRoot, config.overlay), runRoot, { recursive: true });
		}
		for (const [relativePath, contents] of Object.entries(config.inlineFiles ?? {})) {
			const target = path.join(runRoot, ...relativePath.split('/'));
			mkdirSync(path.dirname(target), { recursive: true });
			writeFileSync(target, typeof contents === 'string' ? contents : JSON.stringify(contents));
		}
		const result = spawnSync(
			path.join(packageRoot, 'node_modules/.bin/vitest'),
			[
				'run',
				'--config',
				path.join(packageRoot, config.vitestConfig),
				'--reporter=json',
				`--outputFile=${reportPath}`,
			],
			{
				cwd: packageRoot,
				env: {
					...process.env,
					CI: process.env.CI ?? 'true',
					[config.rootEnvVar]: runRoot,
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
			identities: pristineIdentitiesFromReport(report, { repoRoot, packagePath }),
		};
	} finally {
		rmSync(runRoot, { recursive: true, force: true });
	}
}

export function inventoryFromIdentities(identities, { project, roots }) {
	const idOccurrences = new Map();
	const tests = identities
		.filter((test) => test.status === 'passed')
		.map((test) => {
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
		project,
		roots,
		files: [...new Set(tests.map((test) => test.file))].sort(),
		tests,
		snapshots: 0,
	};
}

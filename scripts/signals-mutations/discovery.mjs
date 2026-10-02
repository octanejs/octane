import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { mutationRoot } from './runner.mjs';

// Check the complete configuration, including ordinary octane/octane-prod
// projects that are not constructed by scopedSignalsProjects.
export function mutationOwners(config, file) {
	const temporaryRoot = resolve(tmpdir(), 'octane-signals-mutations');
	mkdirSync(temporaryRoot, { recursive: true });
	const directory = mkdtempSync(resolve(temporaryRoot, 'discovery-'));
	const reportFile = resolve(directory, 'files.json');
	try {
		const result = spawnSync(
			process.execPath,
			[
				resolve(mutationRoot, 'node_modules/vitest/vitest.mjs'),
				'list',
				'--config',
				config,
				file,
				'--filesOnly',
				`--json=${reportFile}`,
			],
			{
				cwd: mutationRoot,
				windowsHide: true,
				detached: false,
				encoding: 'utf8',
				timeout: 60_000,
				maxBuffer: 1_048_576,
			},
		);
		if (result.error || result.status !== 0)
			throw new Error(`Mutation discovery failed: ${result.error ?? result.stderr}`);
		if (statSync(reportFile).size > 1_048_576)
			throw new Error('Mutation discovery report is too large');
		const files = JSON.parse(readFileSync(reportFile, 'utf8'));
		return files.map((entry) => entry.projectName);
	} finally {
		if (dirname(resolve(directory)) !== temporaryRoot)
			throw new Error('Unexpected mutation discovery directory');
		rmSync(directory, { recursive: true, force: true });
	}
}

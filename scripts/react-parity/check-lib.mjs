import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { isVitestLane, requiredExecutableLanes } from './harness-lib.mjs';
import { createBalancedShardPlan, parseShard } from './shard-lib.mjs';
import { verifyBatchedVitestShardResult } from './vitest-batch-lib.mjs';

// Relative scheduling units only. Most runners pay a process/module startup;
// one-worker Playwright lanes additionally scale with their declared cases.
const ESTIMATED_LANE_STARTUP_WEIGHT = 5;

export function buildHarnessArgv(harnessPath, relativeFile) {
	return [harnessPath, 'run-required-non-vitest', '--manifest', relativeFile];
}

export function buildParityVitestArgv(configPath, shardValue = '1/1', reportPath) {
	const shard = parseShard(shardValue);
	return [
		'node_modules/vitest/vitest.mjs',
		'run',
		'--config',
		configPath,
		'--reporter=./scripts/react-parity/vitest-json-reporter.mjs',
		'--reporter=./scripts/react-parity/vitest-unhandled-reporter.mjs',
		...(reportPath ? [`--outputFile=${reportPath}`] : []),
		...(shard.total === 1 ? [] : [`--shard=${shard.value}`]),
	];
}

export async function runRequiredVitestLanes({
	lanes,
	repo,
	configPath = 'vitest.react-parity.config.js',
	shard: shardValue = '1/1',
	reportPath,
	spawnProcess = spawn,
}) {
	const shard = parseShard(shardValue);
	const startedAt = Date.now();
	console.log(`starting parity-wide Vitest shard ${shard.value} (${lanes.length} required lanes)`);
	// Vite and plugins also write to stdout. Keep diagnostics visible and read
	// only the reporter's fresh file, never a previous run's archived result.
	const runDirectory = mkdtempSync(join(tmpdir(), 'octane-react-parity-vitest-'));
	const runReportPath = join(runDirectory, 'report.json');
	try {
		if (reportPath) rmSync(reportPath, { force: true });
		const { code, signal } = await new Promise((resolve, reject) => {
			const child = spawnProcess(
				process.execPath,
				buildParityVitestArgv(configPath, shard.value, runReportPath),
				{ cwd: repo, stdio: 'inherit', env: process.env },
			);
			child.once('error', reject);
			child.once('close', (code, signal) => resolve({ code, signal }));
		});
		let report;
		try {
			try {
				report = readFileSync(runReportPath, 'utf8');
			} catch (error) {
				throw new Error(`Vitest did not produce a readable JSON report: ${error.message}`);
			}
			verifyBatchedVitestShardResult(lanes, report, repo);
		} catch (error) {
			throw new Error(
				`parity-wide Vitest run failed after ${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${error.message}`,
			);
		}
		if (code !== 0 || signal) {
			throw new Error(
				`parity-wide Vitest run failed ${signal ? `with signal ${signal}` : `with exit code ${code}`}`,
			);
		}
		if (reportPath) {
			mkdirSync(dirname(reportPath), { recursive: true });
			writeFileSync(reportPath, report);
		}
		console.log(
			`completed parity-wide Vitest shard ${shard.value} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
		);
	} finally {
		rmSync(runDirectory, { recursive: true, force: true });
	}
}

function inventoryTestCount(lane, root) {
	if (!lane.execution?.inventory) return 0;
	const inventory = JSON.parse(readFileSync(resolve(root, lane.execution.inventory), 'utf8'));
	return inventory.tests?.length ?? 0;
}

export function estimateRequiredNonVitestManifestWeight(manifest, root) {
	return requiredExecutableLanes(manifest)
		.filter((lane) => !isVitestLane(lane))
		.reduce(
			(total, lane) =>
				total +
				ESTIMATED_LANE_STARTUP_WEIGHT +
				(lane.execution?.kind === 'playwright-full'
					? inventoryTestCount(lane, root)
					: lane.files.length),
			0,
		);
}

export function createRequiredNonVitestManifestShardPlan(entries, root, shardCount) {
	return createBalancedShardPlan(
		entries.map(({ relativeFile, manifest }) => ({
			id: relativeFile,
			weight: estimateRequiredNonVitestManifestWeight(manifest, root),
			relativeFile,
		})),
		shardCount,
	);
}

export function runRequiredNonVitestBindingManifest({
	relativeFile,
	harnessPath,
	repo,
	spawnProcess = spawn,
}) {
	return new Promise((resolve, reject) => {
		const child = spawnProcess(process.execPath, buildHarnessArgv(harnessPath, relativeFile), {
			cwd: repo,
			stdio: 'inherit',
		});
		child.once('error', reject);
		child.once('close', (code, signal) => {
			if (code === 0) resolve();
			else {
				reject(
					new Error(
						`${relativeFile} parity lanes failed ${signal ? `with signal ${signal}` : `with exit code ${code}`}`,
					),
				);
			}
		});
	});
}

export async function runRequiredNonVitestBindingLanes({
	relativeFiles,
	harnessPath,
	repo,
	concurrency = 1,
	runManifest = (relativeFile) =>
		runRequiredNonVitestBindingManifest({ relativeFile, harnessPath, repo }),
}) {
	if (!Array.isArray(relativeFiles)) throw new TypeError('relativeFiles must be an array');
	if (!Number.isInteger(concurrency) || concurrency < 1)
		throw new TypeError('concurrency must be a positive integer');

	const startedAt = Date.now();
	const workerCount = Math.min(concurrency, relativeFiles.length);
	console.log(
		`starting non-Vitest parity queue (${relativeFiles.length} manifests, ${workerCount} workers)`,
	);
	let nextIndex = 0;
	let firstFailure;
	async function worker() {
		while (!firstFailure) {
			const index = nextIndex++;
			if (index >= relativeFiles.length) return;
			const relativeFile = relativeFiles[index];
			const manifestStartedAt = Date.now();
			console.log(`starting parity manifest: ${relativeFile}`);
			try {
				await runManifest(relativeFile);
				console.log(
					`completed parity manifest: ${relativeFile} in ${((Date.now() - manifestStartedAt) / 1000).toFixed(1)}s`,
				);
			} catch (error) {
				firstFailure ??= error;
			}
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, relativeFiles.length) }, () => worker()),
	);
	if (firstFailure) throw firstFailure;
	console.log(
		`completed non-Vitest parity queue in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
	);
}

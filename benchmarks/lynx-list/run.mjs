// Deterministic, Node-only allocation benchmark for Octane's native Lynx list.
// It bundles the real TypeScript host implementation, drives it through a fake
// Element PAPI, and reports source-level cell counts. This is not a device
// memory or layout benchmark; Android/iOS evidence remains a separate gate.

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const rawIterations = process.argv[2] ?? '1';
const iterations = Number(rawIterations);

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-list-'));
const bundlePath = path.join(tempDir, 'workload.mjs');

function countStat(value, samples) {
	return {
		score: value,
		median: value,
		min: value,
		mean: value,
		p95: value,
		sd: 0,
		rme: 0,
		warmupRatio: 1,
		samples,
	};
}

function stableSignature(result) {
	return JSON.stringify({
		physicalCells: result.physicalCells,
		createdCells: result.createdCells,
		reusedCells: result.reusedCells,
		semanticChecksum: result.semanticChecksum,
		remainingCellsAfterTeardown: result.remainingCellsAfterTeardown,
		lateCallbackSign: result.lateCallbackSign,
	});
}

let payload;
try {
	await build({
		absWorkingDir: REPO,
		entryPoints: [path.join(__dirname, 'workload.ts')],
		outfile: bundlePath,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"' },
	});
	const workload = await import(pathToFileURL(bundlePath).href);
	const lynxRuns = [];
	const eagerRuns = [];
	const failures = [];
	for (let iteration = 0; iteration < iterations; iteration++) {
		const lynx = workload.runLynxListAllocationWorkload();
		const eager = workload.runEagerListAllocationReference();
		lynxRuns.push(lynx);
		eagerRuns.push(eager);
		for (const failure of lynx.failures) failures.push(`run ${iteration + 1}: ${failure}`);
		if (eager.semanticChecksum !== lynx.expectedChecksum) {
			failures.push(
				`run ${iteration + 1}: eager checksum ${eager.semanticChecksum} did not match ${lynx.expectedChecksum}.`,
			);
		}
	}

	const lynx = lynxRuns[0];
	const eager = eagerRuns[0];
	const lynxSignature = stableSignature(lynx);
	for (let iteration = 1; iteration < lynxRuns.length; iteration++) {
		if (stableSignature(lynxRuns[iteration]) !== lynxSignature) {
			failures.push(`run ${iteration + 1}: deterministic Lynx counters changed between runs.`);
		}
	}
	for (let iteration = 1; iteration < eagerRuns.length; iteration++) {
		if (eagerRuns[iteration].physicalCells !== eager.physicalCells) {
			failures.push(`run ${iteration + 1}: eager reference cell count changed between runs.`);
		}
	}

	payload = {
		suite: 'lynx-list',
		iterations,
		targets: [
			{
				name: 'octane-lynx',
				ops: {
					physical_cells: countStat(lynx.physicalCells, iterations),
					created_cells: countStat(lynx.createdCells, iterations),
					reused_cells: countStat(lynx.reusedCells, iterations),
					remaining_cells_after_teardown: countStat(lynx.remainingCellsAfterTeardown, iterations),
				},
				meta: lynx,
			},
			{
				name: 'eager-list-model',
				ops: {
					physical_cells: countStat(eager.physicalCells, iterations),
					created_cells: countStat(eager.physicalCells, iterations),
				},
				meta: eager,
			},
		],
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};

	console.log(
		`Octane Lynx: ${lynx.logicalItems} logical items, ${lynx.physicalCells} physical cells, ` +
			`${lynx.reusedCells} reuses, ${lynx.remainingCellsAfterTeardown} cells after teardown`,
	);
	console.log(
		`Eager reference: ${eager.logicalItems} logical items, ${eager.physicalCells} physical cells`,
	);
	console.log(`allocation ratio: ${(lynx.physicalCells / eager.physicalCells).toFixed(3)}x eager`);
	if (failures.length !== 0) process.exitCode = 1;
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'lynx-list', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}

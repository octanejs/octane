import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { buildLynxRenderWorkload } from './build.mjs';

// The weekly Bench job is the only other place this workload runs, so a Lynx
// transport change that leaves it speaking an old wire surfaces there weeks
// later as a harness failure. This builds the same production bundles once.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-render-contract-'));
let bundles;
let workload;
// A Lynx page creates one root per realm, and first-screen adoption is defined
// for that first root, so each one-shot scenario gets fresh module instances.
let instance = 0;
async function freshLayers() {
	instance++;
	const [background, main] = await Promise.all([
		import(`${pathToFileURL(bundles.background).href}?instance=${instance}`),
		import(`${pathToFileURL(bundles.main).href}?instance=${instance}`),
	]);
	return { background, main };
}
try {
	bundles = await buildLynxRenderWorkload(outDir);
	workload = await import(pathToFileURL(bundles.background).href);
	// Import every instance the tests use before the bundles are deleted.
	for (let index = 0; index < 3; index++) await freshLayers();
	instance = 0;
} finally {
	fs.rmSync(outDir, { recursive: true, force: true });
}

const rows = 100;

test('drains a reentrant commit burst over the encoded transport wire', () => {
	const count = 200;
	const result = workload.runReentrantCommits(count);
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.acknowledgements, count + 2);
	assert.equal(result.completions, count + 2);
	assert.equal(result.finalVersion, count + 2);
	assert.equal(result.finalId, `queued-${count - 1}`);
});

test('mounts keyed rows as one compiled program run with one compact acknowledgement', async () => {
	const result = await workload.runCreateRows(rows);
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.createdElements, rows * 9 + 8);
	assert.equal(result.eventTokens, rows * 2);
	assert.equal(result.transport.programCommands, rows);
	assert.equal(result.transport.programRuns, 1);
	assert.equal(result.transport.sharedPrograms, 1);
	assert.equal(result.transport.compactAcknowledgements, 1);
	assert.deepEqual(result.renders, { background: 1, main: 0 });
	assert.ok(result.wire.bytesToMain > 0 && result.wire.framesToMain > 0);
});

test('paints the first screen on the main thread with the same visible tree', async () => {
	const reference = await workload.runCreateRows(rows);
	const { background, main } = await freshLayers();
	const result = await background.runFirstScreen(rows, main, { countCalls: true });
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.reachableChecksum, reference.reachableChecksum);
	assert.equal(result.createdElements, reference.createdElements);
	assert.equal(result.eventTokens, reference.eventTokens);
	assert.deepEqual(result.renders, { background: 0, main: 1 });
	assert.equal(result.wire.framesToMain, 0);
	assert.ok(result.papiCalls.__CreateView > 0);
});

test('adopts the first screen without replacing a host and routes taps to the background', async () => {
	const reference = await workload.runCreateRows(rows);
	const { background, main } = await freshLayers();
	const result = await background.runAdoption(rows, main);
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.hostsCreatedDuringAdoption, 0);
	assert.equal(result.retainedIdentity, true);
	assert.equal(result.firstScreenChecksum, reference.reachableChecksum);
	assert.equal(result.reachableChecksum, reference.reachableChecksum);
	assert.equal(result.adoptedTapHandled, true);
	assert.deepEqual(result.renders, { background: 1, main: 0 });
});

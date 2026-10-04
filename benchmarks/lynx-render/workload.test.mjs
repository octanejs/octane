import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { buildLynxRenderWorkload } from './build.mjs';

// The weekly Bench job is the only other place this workload runs, so a Lynx
// transport change that leaves it speaking an old wire surfaces there weeks
// later as a harness failure. This builds the same production bundle once.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-render-contract-'));
let workload;
try {
	workload = await import(pathToFileURL(await buildLynxRenderWorkload(outDir)).href);
} finally {
	fs.rmSync(outDir, { recursive: true, force: true });
}

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
	const rows = 100;
	const result = await workload.runCreateRows(rows);
	assert.deepEqual(result.diagnostics, []);
	assert.equal(result.createdElements, rows * 9 + 8);
	assert.equal(result.eventTokens, rows * 2);
	assert.equal(result.transport.programCommands, rows);
	assert.equal(result.transport.programRuns, 1);
	assert.equal(result.transport.sharedPrograms, 1);
	assert.equal(result.transport.compactAcknowledgements, 1);
});

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import test from 'node:test';
import { runVitestCommand, verifyLaneRunResult } from './harness-lib.mjs';

const lane = {
	id: 'report-probe',
	files: [
		{
			path: 'probe.test.ts',
			role: 'test',
			cases: [{ fullName: 'report evidence passes' }],
		},
	],
};
const report = (status) => ({
	testResults: [
		{
			name: '/repo/probe.test.ts',
			assertionResults: [{ fullName: 'report evidence passes', status }],
		},
	],
});
const run = (source) => runVitestCommand(process.execPath, ['-e', source, '--'], process.cwd());

test('validates report files independently of startup logs and cleans them up', async () => {
	const result = await run(`
		const fs = require('node:fs');
		const path = process.argv[process.argv.indexOf('--outputFile') + 1];
		console.log('Vite startup notice probe');
		console.log(path);
		fs.writeFileSync(path, ${JSON.stringify(JSON.stringify(report('passed')))});
	`);
	assert.equal(result.exitCode, 0);
	assert.match(result.stdout, /^Vite startup notice probe\n/);
	assert.equal(verifyLaneRunResult(lane, result.report, '/repo'), true);
	const path = result.stdout.trim().split('\n')[1];
	assert.equal(existsSync(path), false);
	assert.equal(existsSync(dirname(path)), false);
});

test('preserves nonzero exits and rejects failed or malformed report evidence', async () => {
	const result = await run(`
		const fs = require('node:fs');
		const path = process.argv[process.argv.indexOf('--outputFile') + 1];
		fs.writeFileSync(path, ${JSON.stringify(JSON.stringify(report('failed')))});
		process.exitCode = 1;
	`);
	assert.equal(result.exitCode, 1);
	assert.throws(() => verifyLaneRunResult(lane, result.report, '/repo'));
	const malformed = await run(`
		const fs = require('node:fs');
		fs.writeFileSync(process.argv[process.argv.indexOf('--outputFile') + 1], '{broken');
	`);
	assert.throws(() => verifyLaneRunResult(lane, malformed.report, '/repo'), SyntaxError);
});

test('rejects a missing report without substituting stdout and cleans up after failure', async () => {
	await assert.rejects(
		run(`process.stdout.write(${JSON.stringify(JSON.stringify(report('passed')))});`),
		(error) => {
			assert.equal(error.code, 'ENOENT');
			assert.equal(existsSync(dirname(error.path)), false);
			return true;
		},
	);
});

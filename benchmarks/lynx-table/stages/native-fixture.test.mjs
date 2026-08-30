import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const benchmarkRoot = path.resolve(import.meta.dirname, '..');
const appRoot = path.join(benchmarkRoot, 'app/src');

test('runs the real table workload when Native does not expose MessageChannel', () => {
	const output = execFileSync(
		process.execPath,
		[
			'--import=data:text/javascript,delete%20globalThis.MessageChannel',
			path.join(benchmarkRoot, 'run.mjs'),
			'1',
		],
		{
			cwd: path.resolve(benchmarkRoot, '../..'),
			encoding: 'utf8',
			env: { ...process.env, LYNX_TABLE_SCALES: '1000' },
		},
	);

	assert.match(output, /rows=\s*1000/);
	assert.match(output, /updateStorm=50c\/5000/);
	assert.match(output, /selectStorm=30c\/60/);
});

test('keeps the Native startup receipt behind render ACK, two frames, and semantic state', () => {
	const entry = fs.readFileSync(path.join(appRoot, 'index.ts'), 'utf8');
	const app = fs.readFileSync(path.join(appRoot, 'App.lynx.tsrx'), 'utf8');

	assert.match(entry, /protocol: 'lynx-native-startup-v1'/);
	assert.match(entry, /void rendering\.then\([\s\S]*commitAckMs = Date\.now\(\)/);
	assert.match(
		entry,
		/lynx\.requestAnimationFrame\([\s\S]*lynx\.requestAnimationFrame\([\s\S]*__LYNX_BENCH_STARTUP__ = receipt/,
	);
	assert.match(entry, /kind: 'octane-root\.render'/);
	assert.match(entry, /postState,/);
	for (const [field, expression] of Object.entries({
		rowCount: 'current.length',
		firstId: 'current[0]?.id ?? null',
		secondId: 'current[1]?.id ?? null',
		thirdId: 'current[2]?.id ?? null',
		row998Id: 'current[998]?.id ?? null',
		firstLabel: 'current[0]?.label ?? null',
		selectedId: 'selectedRef.current ?? null',
	})) {
		assert.ok(app.includes(`${field}: ${expression}`), `missing ${field} snapshot evidence`);
	}
});

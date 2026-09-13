import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
test('records the package runner once while preserving a nested pristine suite report', (t) => {
	const root = mkdtempSync(path.join(tmpdir(), 'binding-nested-suite-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const reports = path.join(root, 'reports');
	mkdirSync(reports);
	const vitest = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
	const hook = new URL('./package-test-reporter-hook.mjs', import.meta.url).href;
	const childReport = path.join(root, 'child.json');
	writeFileSync(
		path.join(root, 'parent.config.mjs'),
		"export default {test:{globals:true,include:['parent.test.js'],maxWorkers:1}};",
	);
	writeFileSync(
		path.join(root, 'child.config.mjs'),
		"export default {test:{globals:true,include:['child.test.js'],maxWorkers:1}};",
	);
	writeFileSync(
		path.join(root, 'child.test.js'),
		"test('pristine behavior',()=>expect(1).toBe(1));",
	);
	const childArgs = [
		vitest,
		'run',
		'--root',
		root,
		'--config',
		path.join(root, 'child.config.mjs'),
		'--reporter=json',
		`--outputFile=${childReport}`,
	];
	writeFileSync(
		path.join(root, 'parent.test.js'),
		`import {spawnSync} from 'node:child_process';import {readFileSync} from 'node:fs';test('delegated suite',()=>{const run=spawnSync(process.execPath,${JSON.stringify(childArgs)},{encoding:'utf8',env:process.env});expect(run.status,run.stdout+run.stderr).toBe(0);expect(JSON.parse(readFileSync(${JSON.stringify(childReport)},'utf8')).numPassedTests).toBe(1)});`,
	);
	const run = spawnSync(
		process.execPath,
		[vitest, 'run', '--root', root, '--config', path.join(root, 'parent.config.mjs')],
		{
			encoding: 'utf8',
			env: {
				...process.env,
				NODE_OPTIONS: `--import=${hook}`,
				REACT_PORT_TEST_REPORT_DIR: reports,
			},
			timeout: 30000,
		},
	);
	assert.equal(run.status, 0, run.stdout + run.stderr);
	assert.equal(readdirSync(reports).filter((file) => file.endsWith('.invocation.json')).length, 1);
	assert.equal(readdirSync(reports).filter((file) => file.endsWith('.report.json')).length, 1);
	assert.equal(JSON.parse(readFileSync(childReport, 'utf8')).numPassedTests, 1);
});
for (const form of ['equals', 'separate', 'json']) {
	test(`preserves an existing ${form} report path for nested test runners`, (t) => {
		const root = mkdtempSync(path.join(tmpdir(), 'binding-nested-report-'));
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const reports = path.join(root, 'evidence');
		mkdirSync(reports);
		writeFileSync(
			path.join(root, 'vitest.config.mjs'),
			"export default {test:{globals:true,include:['pass.test.js'],maxWorkers:1}};",
		);
		writeFileSync(path.join(root, 'pass.test.js'), "test('nested suite',()=>{expect(1).toBe(1)});");
		const original = path.join(root, 'pristine.json');
		const outputArgs =
			form === 'equals'
				? [`--outputFile=${original}`]
				: form === 'json'
					? [`--outputFile.json=${original}`]
					: ['--outputFile', original];
		const run = spawnSync(
			process.execPath,
			[
				'--import',
				new URL('./package-test-reporter-hook.mjs', import.meta.url).href,
				path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs'),
				'run',
				'--root',
				root,
				'--config',
				path.join(root, 'vitest.config.mjs'),
				'--reporter=json',
				...outputArgs,
			],
			{
				encoding: 'utf8',
				env: { ...process.env, REACT_PORT_TEST_REPORT_DIR: reports },
				timeout: 30000,
			},
		);
		assert.equal(run.status, 0, run.stdout + run.stderr);
		const expected = JSON.parse(readFileSync(original, 'utf8'));
		assert.equal(expected.numPassedTests, 1);
		const files = readdirSync(reports).filter((file) => file.endsWith('.report.json'));
		assert.equal(files.length, 1);
		assert.deepEqual(JSON.parse(readFileSync(path.join(reports, files[0]), 'utf8')), expected);
	});
}
test('a failed Vitest assertion remains visible alongside its machine report', (t) => {
	const root = mkdtempSync(path.join(tmpdir(), 'binding-visible-failure-'));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const reports = path.join(root, 'reports');
	mkdirSync(reports);
	writeFileSync(
		path.join(root, 'vitest.config.mjs'),
		"export default {test:{globals:true,include:['failure.test.js'],maxWorkers:1}};",
	);
	writeFileSync(
		path.join(root, 'failure.test.js'),
		"test('visible binding failure',()=>{expect('actual contract').toBe('required contract')});",
	);
	const run = spawnSync(
		process.execPath,
		[
			'--import',
			new URL('./package-test-reporter-hook.mjs', import.meta.url).href,
			path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs'),
			'run',
			'--root',
			root,
			'--config',
			path.join(root, 'vitest.config.mjs'),
		],
		{
			encoding: 'utf8',
			env: { ...process.env, REACT_PORT_TEST_REPORT_DIR: reports },
			timeout: 30000,
		},
	);
	assert.equal(run.status, 1);
	assert.match(run.stdout + run.stderr, /visible binding failure/);
	assert.match(run.stdout + run.stderr, /required contract/);
	const reportFile = readdirSync(reports).find((file) => file.endsWith('.report.json'));
	assert.ok(reportFile);
	const report = JSON.parse(readFileSync(path.join(reports, reportFile), 'utf8'));
	assert.equal(report.success, false);
	assert.equal(report.numFailedTests, 1);
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, realpath, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { verifyBatchedVitestResult } from './vitest-batch-lib.mjs';

test('the actual JSON reporter distinguishes one shared test file in two Vitest projects', async (t) => {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'parity-project-report-')));
	t.after(() => rm(root, { recursive: true, force: true }));
	const repoRoot = resolve(import.meta.dirname, '../..');
	await symlink(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
	await writeFile(
		join(root, 'vitest.config.mjs'),
		`export default { test: { projects: [
  { test: { name: 'first', include: ['suite.test.mjs'], environment: 'node' } },
  { test: { name: 'second', include: ['suite.test.mjs'], environment: 'node' } }
] } };`,
	);
	await writeFile(
		join(root, 'suite.test.mjs'),
		`import { it } from 'vitest'; it('shared assertion', () => {});`,
	);
	const output = join(root, 'report.json');
	await promisify(execFile)(
		process.execPath,
		[
			join(repoRoot, 'node_modules/vitest/vitest.mjs'),
			'run',
			'--reporter',
			join(repoRoot, 'scripts/react-parity/vitest-json-reporter.mjs'),
			'--outputFile',
			output,
		],
		{ cwd: root },
	);
	const report = await readFile(output, 'utf8');
	assert.deepEqual(
		JSON.parse(report)
			.testResults.map((suite) => suite.projectName)
			.sort(),
		['first', 'second'],
	);
	const lanes = ['first', 'second'].map((project) => ({
		id: project,
		project,
		files: [{ path: 'suite.test.mjs', role: 'test', cases: [{ fullName: 'shared assertion' }] }],
	}));
	assert.equal(verifyBatchedVitestResult(lanes, report, root), true);
});

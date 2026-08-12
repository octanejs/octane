import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	buildParityVitestProjects,
	verifyBatchedVitestResult,
	verifyBatchedVitestShardResult,
} from './vitest-batch-lib.mjs';

function lane(id, project, file, fullName = `${id} works`) {
	return {
		id,
		project,
		files: [{ path: file, role: 'test', cases: [{ fullName }] }],
	};
}

test('narrows each parity project to its lane files and test identities', () => {
	const lanes = [
		lane('first-lane', 'first', 'packages/first/first.test.ts'),
		lane('second-lane', 'second', 'packages/second/second.test.ts'),
	];
	const baseProjects = [
		{
			testExecution: { group: 'react-parity' },
			test: {
				name: 'first',
				include: ['packages/first/**/*.test.ts'],
				environment: 'jsdom',
			},
		},
		{
			test: {
				name: 'second',
				include: ['packages/second/**/*.test.ts'],
				fileParallelism: false,
				testTimeout: 30_000,
			},
		},
	];

	const projects = buildParityVitestProjects({ baseProjects, lanes, root: '/repo' });
	assert.equal(projects.length, 2);
	assert.equal(projects[0].testExecution, undefined);
	assert.deepEqual(projects[0].test.include, ['packages/first/first.test.ts']);
	assert.equal(projects[0].test.environment, 'jsdom');
	assert.match('first-lane works', projects[0].test.testNamePattern);
	assert.equal(projects[0].test.testTimeout, undefined);
	assert.equal(projects[1].test.fileParallelism, false);
	assert.equal(projects[1].test.testTimeout, 30_000);
});

test('applies a manifest file-parallelism override without fixing worker count', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-vitest-batch-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await writeFile(
		join(root, 'inventory.json'),
		JSON.stringify({ files: ['packages/browser/browser.test.ts'] }),
	);
	const selectedLane = {
		...lane('browser-lane', 'browser', 'packages/browser/browser.test.ts'),
		execution: {
			kind: 'vitest-full',
			inventory: 'inventory.json',
			fileParallelism: true,
		},
	};
	const [project] = buildParityVitestProjects({
		baseProjects: [{ test: { name: 'browser', fileParallelism: false } }],
		lanes: [selectedLane],
		root,
	});
	assert.equal(project.test.fileParallelism, true);
	assert.equal(project.test.maxWorkers, undefined);
	assert.equal(project.test.testTimeout, undefined);
});

test('combines native file-shard reports before exact lane verification', () => {
	const lanes = [
		lane('first-lane', 'first', 'packages/first/first.test.ts'),
		lane('second-lane', 'second', 'packages/second/second.test.ts'),
	];
	const reports = lanes.map((selectedLane) =>
		JSON.stringify({
			testResults: [
				{
					name: `/repo/${selectedLane.files[0].path}`,
					assertionResults: [
						{ fullName: selectedLane.files[0].cases[0].fullName, status: 'passed' },
						{ fullName: `${selectedLane.id} unselected`, status: 'pending' },
					],
				},
			],
		}),
	);

	assert.deepEqual(verifyBatchedVitestShardResult(lanes, reports[0], '/repo').testResults, [
		JSON.parse(reports[0]).testResults[0],
	]);
	assert.equal(verifyBatchedVitestResult(lanes, reports, '/repo'), true);
	assert.throws(
		() => verifyBatchedVitestResult(lanes, reports.slice(0, 1), '/repo'),
		/did not execute every declared test identity exactly once/,
	);
	assert.throws(
		() => verifyBatchedVitestResult(lanes, [...reports, reports[0]], '/repo'),
		/did not execute every declared test identity exactly once/,
	);
	const undeclaredPassed = JSON.parse(reports[0]);
	undeclaredPassed.testResults[0].assertionResults[1].status = 'passed';
	assert.throws(
		() => verifyBatchedVitestShardResult(lanes, JSON.stringify(undeclaredPassed), '/repo'),
		/executed undeclared test.*\[passed\]/,
	);
});

test('rejects projects or files selected by multiple parity lanes', () => {
	const baseProjects = [{ test: { name: 'first' } }, { test: { name: 'second' } }];
	assert.throws(
		() =>
			buildParityVitestProjects({
				baseProjects,
				lanes: [
					lane('one', 'first', 'packages/one.test.ts'),
					lane('two', 'first', 'packages/two.test.ts'),
				],
				root: '/repo',
			}),
		/more than one required parity lane/,
	);
	assert.throws(
		() =>
			buildParityVitestProjects({
				baseProjects,
				lanes: [
					lane('one', 'first', 'packages/shared.test.ts'),
					lane('two', 'second', 'packages/shared.test.ts'),
				],
				root: '/repo',
			}),
		/selected by both one and two/,
	);
});

test('partitions one Vitest JSON report and verifies every lane exactly', () => {
	const lanes = [
		lane('first-lane', 'first', 'packages/first/first.test.ts'),
		lane('second-lane', 'second', 'packages/second/second.test.ts'),
	];
	const stdout = JSON.stringify({
		testResults: lanes.map((selectedLane) => ({
			name: `/repo/${selectedLane.files[0].path}`,
			assertionResults: [{ fullName: selectedLane.files[0].cases[0].fullName, status: 'passed' }],
		})),
	});

	assert.equal(verifyBatchedVitestResult(lanes, stdout, '/repo'), true);
	assert.throws(
		() =>
			verifyBatchedVitestResult(
				lanes,
				JSON.stringify({
					testResults: [
						...JSON.parse(stdout).testResults,
						{
							name: '/repo/packages/extra.test.ts',
							assertionResults: [],
						},
					],
				}),
				'/repo',
			),
		/executed undeclared file packages\/extra\.test\.ts/,
	);
	const failed = JSON.parse(stdout);
	failed.testResults[0].assertionResults[0] = {
		...failed.testResults[0].assertionResults[0],
		status: 'failed',
		failureMessages: ['test timed out after 5000ms'],
	};
	assert.throws(
		() => verifyBatchedVitestResult(lanes, JSON.stringify(failed), '/repo'),
		/test timed out after 5000ms/,
	);
	assert.throws(
		() => verifyBatchedVitestShardResult(lanes, JSON.stringify(failed), '/repo'),
		/parity-wide Vitest shard contains non-passing tests/,
	);
});

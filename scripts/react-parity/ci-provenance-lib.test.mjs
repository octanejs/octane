import assert from 'node:assert/strict';
import test from 'node:test';

import {
	buildExecutionMatrix,
	entriesFromReceipt,
	planReactParityCi,
} from './ci-provenance-lib.mjs';

const hash = (character) => `sha256:${character.repeat(64)}`;
const current = {
	schemaVersion: 1,
	always: [],
	entries: [
		{
			manifest: 'packages/alpha/audit/react-parity.json',
			receipt: 'packages/alpha/audit/react-parity.receipts.json',
			lane: 'alpha-runtime',
			inputSha256: hash('a'),
		},
		{
			manifest: 'packages/alpha/audit/react-parity.json',
			receipt: 'packages/alpha/audit/react-parity.receipts.json',
			lane: 'alpha-types',
			inputSha256: hash('b'),
		},
		{
			manifest: 'packages/beta/audit/react-parity.json',
			receipt: 'packages/beta/audit/react-parity.receipts.json',
			lane: 'beta-runtime',
			inputSha256: hash('c'),
		},
	],
};

test('groups only unproven hashes by package', () => {
	const plan = buildExecutionMatrix(current, [current.entries[0], current.entries[2]]);
	assert.equal(plan.hasWork, true);
	assert.equal(plan.inherited, 2);
	assert.deepEqual(plan.matrix.include, [
		{
			package: 'packages/alpha',
			manifest: 'packages/alpha/audit/react-parity.json',
			lanes: ['alpha-types'],
		},
	]);
});

test('keeps non-receipted Octane lanes in every phase-one execution plan', () => {
	const withOctane = {
		...current,
		always: [
			{
				manifest: 'packages/alpha/audit/react-parity.json',
				lane: 'alpha-adapted',
			},
		],
	};
	const plan = buildExecutionMatrix(withOctane, current.entries);
	assert.equal(plan.hasWork, true);
	assert.deepEqual(plan.matrix.include[0].lanes, ['alpha-adapted']);
});

test('fails safe to executing every lane without trusted provenance', () => {
	const plan = buildExecutionMatrix(current, []);
	assert.equal(plan.hasWork, true);
	assert.equal(plan.inherited, 0);
	assert.deepEqual(
		plan.matrix.include.map(({ package: packageName, lanes }) => [packageName, lanes]),
		[
			['packages/alpha', ['alpha-runtime', 'alpha-types']],
			['packages/beta', ['beta-runtime']],
		],
	);
});

test('uses a non-executing placeholder matrix when every hash is proven', () => {
	const plan = buildExecutionMatrix(current, current.entries);
	assert.equal(plan.hasWork, false);
	assert.equal(plan.inherited, 3);
	assert.deepEqual(plan.matrix.include, [{ package: 'none', manifest: 'none', lanes: [] }]);
});

test('reads lane hashes from a successful commit receipt', () => {
	assert.deepEqual(
		entriesFromReceipt('packages/alpha/audit/react-parity.receipts.json', {
			schemaVersion: 1,
			fingerprintVersion: 1,
			manifest: 'packages/alpha/audit/react-parity.json',
			lanes: { 'alpha-runtime': { inputSha256: hash('a') } },
		}),
		[current.entries[0]],
	);
});

test('inherits hashes only from a successful provenance job and committed receipt', async () => {
	const run = {
		id: 7,
		conclusion: 'success',
		event: 'push',
		head_branch: 'main',
		head_repository: { full_name: 'octanejs/octane' },
		head_sha: 'a'.repeat(40),
		updated_at: '2026-08-01T00:00:00Z',
	};
	const listJobsForWorkflowRun = async () => {};
	const listPullRequestsAssociatedWithCommit = async () => {};
	const receipts = new Map(
		current.entries.map((entry) => [
			entry.receipt,
			{
				schemaVersion: 1,
				fingerprintVersion: 1,
				manifest: entry.manifest,
				lanes: Object.fromEntries(
					current.entries
						.filter((candidate) => candidate.receipt === entry.receipt)
						.map((candidate) => [candidate.lane, { inputSha256: candidate.inputSha256 }]),
				),
			},
		]),
	);
	const github = {
		paginate: async (method) => {
			if (method === listJobsForWorkflowRun)
				return [{ name: 'React parity provenance', conclusion: 'success' }];
			if (method === listPullRequestsAssociatedWithCommit) return [];
			throw new Error('unexpected pagination method');
		},
		rest: {
			actions: {
				listJobsForWorkflowRun,
				listWorkflowRuns: async () => ({ data: { workflow_runs: [run] } }),
			},
			repos: {
				listPullRequestsAssociatedWithCommit,
				getContent: async ({ path }) => ({
					data: {
						encoding: 'base64',
						content: Buffer.from(JSON.stringify(receipts.get(path))).toString('base64'),
					},
				}),
			},
		},
	};
	const context = {
		eventName: 'push',
		payload: { repository: { default_branch: 'main' } },
		repo: { owner: 'octanejs', repo: 'octane' },
		sha: 'b'.repeat(40),
	};

	const plan = await planReactParityCi({ github, context, currentPlan: current });
	assert.equal(plan.hasWork, false);
	assert.equal(plan.inherited, current.entries.length);
});

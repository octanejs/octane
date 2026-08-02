import assert from 'node:assert/strict';
import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
	canonicalJson,
	compareReceipt,
	computeManifestFingerprints,
	createReceiptDocument,
	resolvedDependencyGraph,
	runStaleReceiptLanes,
} from './receipts-lib.mjs';

const digest = (character) => `sha256:${character.repeat(64)}`;

function lockfile() {
	return {
		lockfileVersion: '9.0',
		importers: {
			'packages/example': {
				devDependencies: { runner: { version: '1.0.0(peer@2.0.0)' } },
			},
		},
		packages: {
			'runner@1.0.0': { resolution: { integrity: 'runner-integrity' } },
			'dependency@3.0.0': { resolution: { integrity: 'dependency-integrity' } },
			'unrelated@9.0.0': { resolution: { integrity: 'unrelated-integrity' } },
		},
		snapshots: {
			'runner@1.0.0(peer@2.0.0)': { dependencies: { dependency: '3.0.0' } },
			'dependency@3.0.0': {},
			'unrelated@9.0.0': {},
		},
	};
}

test('derives only the resolved transitive dependency closure', () => {
	const value = lockfile();
	const graph = resolvedDependencyGraph(value, [{ name: 'runner', version: '1.0.0' }]);
	assert.deepEqual(
		graph.nodes.map(({ key }) => key),
		['dependency@3.0.0', 'runner@1.0.0(peer@2.0.0)'],
	);
	const before = canonicalJson(graph);
	value.packages['unrelated@9.0.0'].resolution.integrity = 'changed-but-unrelated';
	assert.equal(
		canonicalJson(resolvedDependencyGraph(value, [{ name: 'runner', version: '1.0.0' }])),
		before,
	);
	value.importers['packages/example'].devDependencies.runner.version = '9.0.0';
	assert.equal(
		canonicalJson(resolvedDependencyGraph(value, [{ name: 'runner', version: '1.0.0' }])),
		before,
		'package declarations must not select receipt dependencies',
	);
	value.packages['dependency@3.0.0'].resolution.integrity = 'changed-and-relevant';
	assert.notEqual(
		canonicalJson(resolvedDependencyGraph(value, [{ name: 'runner', version: '1.0.0' }])),
		before,
	);
});

test('requires the exact pristine lane set and detects stale hashes', () => {
	const expected = {
		node: '24.18.0',
		lanes: {
			'pristine-runtime': { inputSha256: digest('a') },
			'pristine-types': { inputSha256: digest('b') },
		},
	};
	const receipt = createReceiptDocument(
		'packages/example/audit/react-parity.json',
		expected.node,
		expected.lanes,
	);
	assert.deepEqual(compareReceipt(receipt, 'packages/example/audit/react-parity.json', expected), {
		stale: [],
		current: true,
	});
	receipt.lanes['pristine-types'].inputSha256 = digest('c');
	assert.deepEqual(compareReceipt(receipt, 'packages/example/audit/react-parity.json', expected), {
		stale: ['pristine-types'],
		current: false,
	});
	delete receipt.lanes['pristine-runtime'];
	assert.throws(
		() => compareReceipt(receipt, 'packages/example/audit/react-parity.json', expected),
		/receipt lane set does not match/,
	);
});

test('does not require an empty receipt from a manifest without pristine lanes', async () => {
	const manifest = {
		environments: { node: { node: '24.18.0' } },
		lanes: [
			{
				id: 'adapted-runtime',
				type: 'adapted-octane',
				oracle: 'required',
				environment: 'node',
			},
		],
	};
	assert.deepEqual(
		await computeManifestFingerprints(
			'packages/example/audit/react-parity.json',
			undefined,
			manifest,
		),
		{ manifest, node: null, lanes: {} },
	);
});

test('does not write a receipt when an eligible lane fails', async () => {
	const root = await mkdtemp(join(tmpdir(), 'react-parity-receipt-'));
	const receiptPath = 'packages/example/audit/react-parity.receipts.json';
	const lane = {
		id: 'pristine-runtime',
		type: 'pristine-upstream',
		oracle: 'required',
		available: true,
		environment: 'node',
	};
	const expected = {
		manifest: { lanes: [lane], environments: { node: {} } },
		node: '24.18.0',
		lanes: { [lane.id]: { inputSha256: digest('a') } },
	};
	await assert.rejects(
		() =>
			runStaleReceiptLanes({
				root,
				manifestPaths: ['packages/example/audit/react-parity.json'],
				statusForManifest: async () => ({
					receiptPath,
					expected,
					stale: [lane.id],
				}),
				verifyEnvironment: async () => {},
				execute: async () => {
					throw new Error('test failed');
				},
			}),
		/test failed/,
	);
	await assert.rejects(access(join(root, receiptPath)));
});

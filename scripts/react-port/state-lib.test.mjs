import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { createEvidenceMatrix } from './evidence-lib.mjs';
import {
	acquireBatchLock,
	createBatchManifest,
	detectWorktreeCollisions,
	invalidateChangedEvidence,
	releaseBatchLock,
	reconcileBatchManifest,
	transitionNodeState,
	validateBatchManifest,
	writeManifestAtomically,
} from './state-lib.mjs';

function fixtureManifest() {
	return createBatchManifest({
		batchId: 'fixture-batch',
		inventoryFingerprint: 'inventory-a',
		executionUnits: [['pkg:base'], ['pkg:leaf'], ['pkg:other']],
		actionableExecutionUnits: [['pkg:leaf']],
		executionOrder: ['pkg:base', 'pkg:leaf', 'pkg:other'],
		nodes: {
			'pkg:base': { state: 'verified', evidenceFingerprint: 'base-a', dependsOn: [] },
			'pkg:leaf': { state: 'verified', evidenceFingerprint: 'leaf-a', dependsOn: ['pkg:base'] },
			'pkg:other': { state: 'verified', evidenceFingerprint: 'other-a', dependsOn: [] },
		},
		baseline: { 'packages/fixture/package.json': 'hash-a' },
	});
}

describe('batch state', () => {
	test('persists graph execution metadata and resumes schema-v1 manifests that predate it', () => {
		const next = fixtureManifest();
		assert.deepEqual(next.executionUnits, [['pkg:base'], ['pkg:leaf'], ['pkg:other']]);
		assert.deepEqual(next.actionableExecutionUnits, [['pkg:leaf']]);
		assert.deepEqual(next.executionOrder, ['pkg:base', 'pkg:leaf', 'pkg:other']);

		const legacy = structuredClone(next);
		delete legacy.executionUnits;
		delete legacy.actionableExecutionUnits;
		delete legacy.executionOrder;
		assert.equal(validateBatchManifest(legacy), legacy);

		const resumed = reconcileBatchManifest(legacy, next);
		assert.deepEqual(resumed.executionUnits, next.executionUnits);
		assert.deepEqual(resumed.actionableExecutionUnits, next.actionableExecutionUnits);
		assert.deepEqual(resumed.executionOrder, next.executionOrder);
		assert.deepEqual(resumed.resume.invalidated, []);

		const divergent = structuredClone(next);
		divergent.executionOrder = ['pkg:other', 'pkg:leaf', 'pkg:base'];
		assert.throws(
			() => validateBatchManifest(divergent),
			/executionOrder must match executionUnits/i,
		);
	});

	test('rejects unknown schemas and non-monotonic transitions', () => {
		assert.throws(() => validateBatchManifest({ schemaVersion: 2 }), /newer schema/i);
		const manifest = createBatchManifest({
			batchId: 'transition',
			inventoryFingerprint: 'inventory',
			nodes: { 'pkg:x': { state: 'resolved', evidenceFingerprint: 'same', dependsOn: [] } },
		});
		transitionNodeState(manifest, 'pkg:x', 'licensed', { evidenceFingerprint: 'same' });
		assert.throws(
			() => transitionNodeState(manifest, 'pkg:x', 'verified', { evidenceFingerprint: 'same' }),
			/transition/i,
		);
	});

	test('invalidates only changed evidence and its dependents', () => {
		const manifest = fixtureManifest();
		const invalidated = invalidateChangedEvidence(manifest, {
			'pkg:base': 'base-b',
			'pkg:leaf': 'leaf-a',
			'pkg:other': 'other-a',
		});

		assert.deepEqual(invalidated, ['pkg:base', 'pkg:leaf']);
		assert.equal(manifest.nodes['pkg:base'].state, 'resolved');
		assert.equal(manifest.nodes['pkg:leaf'].state, 'resolved');
		assert.equal(manifest.nodes['pkg:other'].state, 'verified');
	});

	test('preserves completed nodes only when their plan and upstream evidence are unchanged', () => {
		const previous = fixtureManifest();
		for (const node of Object.values(previous.nodes))
			node.nodeFingerprint = `${node.evidenceFingerprint}-plan`;
		const next = fixtureManifest();
		for (const node of Object.values(next.nodes))
			node.nodeFingerprint = `${node.evidenceFingerprint}-plan`;
		next.nodes['pkg:base'].evidenceFingerprint = 'base-b';
		next.nodes['pkg:base'].state = 'ready';
		next.nodes['pkg:leaf'].state = 'ready';

		const resumed = reconcileBatchManifest(previous, next);
		assert.equal(resumed.nodes['pkg:base'].state, 'ready');
		assert.equal(resumed.nodes['pkg:leaf'].state, 'ready');
		assert.equal(resumed.nodes['pkg:other'].state, 'verified');
		assert.deepEqual(resumed.resume.invalidated, ['pkg:base', 'pkg:leaf']);
	});

	test('invalidates stale verified binding evidence while preserving current and non-binding nodes', () => {
		const implementationActions = ['create-binding', 'extend-binding', 'adopt-binding'];
		const nodes = Object.fromEntries(
			implementationActions.map((action) => [
				`pkg:${action}`,
				{
					state: 'ready',
					action,
					nodeFingerprint: `${action}-plan`,
					evidenceFingerprint: `${action}-evidence`,
					dependsOn: [],
				},
			]),
		);
		nodes['pkg:verified-binding'] = {
			state: 'ready',
			action: 'create-binding',
			nodeFingerprint: 'verified-binding-plan',
			evidenceFingerprint: 'verified-binding-evidence',
			dependsOn: [],
		};
		nodes['pkg:current-binding'] = {
			state: 'ready',
			action: 'create-binding',
			nodeFingerprint: 'current-binding-plan',
			evidenceFingerprint: 'current-binding-evidence',
			dependsOn: [],
		};
		nodes['pkg:reuse-binding'] = {
			state: 'verified',
			action: 'reuse-binding',
			nodeFingerprint: 'reuse-binding-plan',
			evidenceFingerprint: 'reuse-binding-evidence',
			dependsOn: [],
		};
		nodes['pkg:clean-room'] = {
			state: 'verified',
			action: 'reimplement-in-parent',
			nodeFingerprint: 'clean-room-plan',
			evidenceFingerprint: 'clean-room-evidence',
			dependsOn: [],
		};
		const next = createBatchManifest({
			batchId: 'legacy-evidence',
			inventoryFingerprint: 'inventory',
			nodes,
		});
		const previous = structuredClone(next);
		for (const action of implementationActions) {
			previous.nodes[`pkg:${action}`].state = 'verified';
		}
		previous.nodes['pkg:create-binding'].evidence = { readiness: { status: 'verified' } };
		previous.nodes['pkg:extend-binding'].evidenceMatrix = { schemaVersion: 1, gates: {} };
		Object.assign(previous.nodes['pkg:adopt-binding'], {
			evidenceMatrix: { schemaVersion: 1, gates: {} },
			evidence: { readiness: { status: 'blocked' } },
		});
		Object.assign(previous.nodes['pkg:verified-binding'], {
			state: 'verified',
			evidenceMatrix: {
				schemaVersion: 1,
				categories: ['thin-core'],
				gates: {
					typecheck: {
						id: 'typecheck',
						status: 'passed',
						allowInapplicable: false,
					},
				},
			},
			evidence: { readiness: { status: 'verified' } },
		});
		const currentMatrix = createEvidenceMatrix({
			categories: ['thin-core'],
			preflightArtifact: 'manifest.json',
		});
		for (const gate of Object.values(currentMatrix.gates)) gate.status = 'passed';
		Object.assign(previous.nodes['pkg:current-binding'], {
			state: 'verified',
			evidenceMatrix: currentMatrix,
			evidence: { readiness: { status: 'verified' } },
		});

		const resumed = reconcileBatchManifest(previous, next);

		for (const action of implementationActions) {
			assert.equal(resumed.nodes[`pkg:${action}`].state, 'ready');
		}
		assert.equal(resumed.nodes['pkg:verified-binding'].state, 'ready');
		assert.equal(resumed.nodes['pkg:current-binding'].state, 'verified');
		assert.equal(resumed.nodes['pkg:reuse-binding'].state, 'verified');
		assert.equal(resumed.nodes['pkg:clean-room'].state, 'verified');
		assert.deepEqual(
			resumed.resume.invalidated,
			[...implementationActions.map((action) => `pkg:${action}`), 'pkg:verified-binding'].sort(),
		);
	});

	test('detects overlapping writes without treating unrelated worktree changes as collisions', () => {
		assert.deepEqual(
			detectWorktreeCollisions({
				plannedPaths: ['packages/fixture/package.json'],
				baseline: {
					'packages/fixture/package.json': 'old',
					'docs/unrelated.md': 'old-doc',
				},
				current: {
					'packages/fixture/package.json': 'changed',
					'docs/unrelated.md': 'changed-doc',
				},
			}),
			['packages/fixture/package.json'],
		);
	});

	test('uses one-writer locks and atomic manifest replacement', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'react-port-state-'));
		const lock = await acquireBatchLock(directory, { owner: 'test-owner' });
		await assert.rejects(() => acquireBatchLock(directory, { owner: 'second-owner' }), /locked/i);

		const manifest = fixtureManifest();
		await writeManifestAtomically(directory, manifest, { owner: 'test-owner' });
		assert.deepEqual(
			JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')),
			manifest,
		);
		await assert.rejects(() => stat(path.join(directory, 'manifest.json.tmp')));
		await releaseBatchLock(lock);
	});

	test('recovers a stale lock only through the explicit recovery path', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'react-port-stale-lock-'));
		await acquireBatchLock(directory, { owner: 'abandoned', now: 1_000 });
		await assert.rejects(
			() => acquireBatchLock(directory, { owner: 'replacement', now: 10_000, staleAfterMs: 1_000 }),
			/locked/i,
		);
		const replacement = await acquireBatchLock(directory, {
			owner: 'replacement',
			now: 10_000,
			staleAfterMs: 1_000,
			allowStaleRecovery: true,
		});
		assert.ok((await readdir(directory)).some((file) => file.startsWith('.lock.stale.')));
		await releaseBatchLock(replacement);
	});
});

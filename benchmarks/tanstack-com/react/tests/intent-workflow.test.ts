import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	defineWorkflowRuntime,
	every,
	inMemoryWorkflowExecutionStore,
	materializeWorkflowSchedules,
} from '@tanstack/workflow-runtime';
import type { WorkflowExecutionStore } from '@tanstack/workflow-runtime';
import { createIntentProcessWorkflow } from '../src/utils/intent-workflows.server';
import type {
	IntentProcessResult,
	IntentSyncOperations,
	IntentVersionProcessResult,
} from '../src/utils/intent-sync.server';

test('duplicate scheduled invocation with the same bucket is idempotent', async () => {
	let selectCalls = 0;
	let processCalls = 0;
	const store = inMemoryWorkflowExecutionStore();
	const { processSchedule, processWorkflow, runtime } = createTestIntentRuntime({
		store,
		operations: {
			...noopOperations,
			selectPendingIntentVersions: async () => {
				selectCalls++;
				return [{ id: 1, packageName: '@example/pkg', version: '1.0.0' }];
			},
			processIntentVersion: async () => {
				processCalls++;
				return {
					packageName: '@example/pkg',
					version: '1.0.0',
					status: 'synced',
					skillCount: 1,
				};
			},
		},
	});
	const now = Date.UTC(2026, 4, 26, 12, 0, 0);

	await materializeWorkflowSchedules(runtime, { now });
	const first = await runtime.sweep({ now, includeEvents: false });
	await materializeWorkflowSchedules(runtime, { now });
	const second = await runtime.sweep({ now, includeEvents: false });

	const processRun = first.scheduled.find((run) => run.workflowId === processWorkflow.id);
	assert.ok(processRun);
	assert.equal(processRun.runId, `${processWorkflow.id}:${processSchedule.id}:${now}`);
	assert.equal(second.scheduled.length, 0);
	assert.equal(selectCalls, 1);
	assert.equal(processCalls, 1);
});

test('failed package version step does not prevent other versions from processing', async () => {
	const goodResult: IntentVersionProcessResult = {
		packageName: '@example/good',
		version: '1.0.0',
		status: 'synced',
		skillCount: 1,
	};
	const badResult: IntentVersionProcessResult = {
		packageName: '@example/bad',
		version: '1.0.0',
		status: 'failed',
		error: 'tarball failed',
	};
	const laterResult: IntentVersionProcessResult = {
		packageName: '@example/later',
		version: '1.0.0',
		status: 'synced',
		skillCount: 2,
	};
	const expected: IntentProcessResult = {
		processed: 2,
		failed: 1,
		deferred: 0,
		results: [goodResult, badResult, laterResult],
	};
	const { processWorkflow, runtime } = createTestIntentRuntime({
		store: inMemoryWorkflowExecutionStore(),
		operations: {
			...noopOperations,
			selectPendingIntentVersions: async () => [
				{ id: 1, packageName: '@example/good', version: '1.0.0' },
				{ id: 2, packageName: '@example/bad', version: '1.0.0' },
				{ id: 3, packageName: '@example/later', version: '1.0.0' },
			],
			processIntentVersion: async (versionId: number) => {
				if (versionId === 1) return goodResult;
				if (versionId === 2) throw new Error('tarball failed');
				return laterResult;
			},
		},
	});

	const result = await runtime.startRun({
		workflowId: processWorkflow.id,
		runId: 'intent-process:test-partial-failure',
		input: { source: 'admin' },
		now: Date.UTC(2026, 4, 26, 12, 15, 0),
		includeEvents: false,
	});

	assert.equal(result.kind, 'completed');
	assert.ok(result.run);
	assert.deepEqual(result.run.output, expected);
});

test('process workflow continues from queue state across scheduled invocations', async () => {
	const queue = [
		{ id: 1, packageName: '@example/one', version: '1.0.0' },
		{ id: 2, packageName: '@example/two', version: '1.0.0' },
	];
	const processed: Array<string> = [];
	const store = inMemoryWorkflowExecutionStore();
	const operations: IntentSyncOperations = {
		...noopOperations,
		selectPendingIntentVersions: async () => {
			const next = queue.shift();
			return next ? [next] : [];
		},
		processIntentVersion: async (versionId: number) => {
			const packageName = versionId === 1 ? '@example/one' : '@example/two';
			const version = '1.0.0';
			processed.push(`${packageName}@${version}`);
			return {
				packageName,
				version,
				status: 'synced',
				skillCount: 1,
			};
		},
	};
	const first = createTestIntentRuntime({
		store,
		operations,
	});
	const second = createTestIntentRuntime({
		store,
		operations,
	});
	const firstBucket = Date.UTC(2026, 4, 26, 12, 0, 0);
	const secondBucket = Date.UTC(2026, 4, 26, 12, 15, 0);

	await materializeWorkflowSchedules(first.runtime, { now: firstBucket });
	await first.runtime.sweep({ now: firstBucket, includeEvents: false });
	await materializeWorkflowSchedules(second.runtime, { now: secondBucket });
	await second.runtime.sweep({ now: secondBucket, includeEvents: false });

	const runs = await store.listRuns({
		workflowId: first.processWorkflow.id,
		limit: 10,
	});

	assert.deepEqual(processed, ['@example/one@1.0.0', '@example/two@1.0.0']);
	assert.equal(runs.length, 2);
});

const noopOperations: IntentSyncOperations = {
	discoverIntentPackages: async () => ({
		packagesDiscovered: 0,
		githubCandidates: 0,
		packagesVerified: 0,
		versionsEnqueued: 0,
		errors: [],
	}),
	selectPendingIntentVersions: async () => [],
	processIntentVersion: async () => {
		throw new Error('No test version configured');
	},
};

function createTestIntentRuntime(options: {
	operations: IntentSyncOperations;
	store?: WorkflowExecutionStore;
}) {
	const processWorkflow = createIntentProcessWorkflow(options.operations);
	const processSchedule = {
		id: 'intent-process-every-15m',
		schedule: every.minutes(15),
		overlapPolicy: 'skip',
		input: {
			source: 'schedule',
		},
	} as const;

	return {
		processSchedule,
		processWorkflow,
		runtime: defineWorkflowRuntime({
			store: options.store ?? inMemoryWorkflowExecutionStore(),
			workflows: {
				[processWorkflow.id]: {
					load: async () => processWorkflow,
					schedules: [processSchedule],
				},
			},
		}),
	};
}

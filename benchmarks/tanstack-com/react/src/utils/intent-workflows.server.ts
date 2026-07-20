import { createWorkflow } from '@tanstack/workflow-core';
import type { StepOptions } from '@tanstack/workflow-core';
import { every } from '@tanstack/workflow-runtime';
import type { WorkflowRegistrationMap } from '@tanstack/workflow-runtime';
import { z } from 'zod';
import {
	defaultIntentSyncOperations,
	summarizeIntentProcessResults,
} from '~/utils/intent-sync.server';
import type { IntentSyncOperations, IntentVersionProcessResult } from '~/utils/intent-sync.server';

const intentDiscoverInputSchema = z.object({
	source: z.enum(['schedule', 'admin']).default('schedule'),
});

const PROCESS_WORKFLOW_DEFAULT_MAX_DURATION_MS = 4 * 60 * 1000;
const PROCESS_WORKFLOW_MAX_DURATION_MS = 4 * 60 * 1000;
const PROCESS_WORKFLOW_MIN_REMAINING_MS = 30_000;
const PROCESS_WORKFLOW_SELECT_LIMIT = 50;

const intentProcessInputSchema = z.object({
	maxDurationMs: z
		.number()
		.int()
		.positive()
		.max(PROCESS_WORKFLOW_MAX_DURATION_MS)
		.default(PROCESS_WORKFLOW_DEFAULT_MAX_DURATION_MS),
	source: z.enum(['schedule', 'admin']).default('schedule'),
});

const discoverStepOptions = {
	retry: { maxAttempts: 2, backoff: 'exponential', baseMs: 1_000 },
	timeout: 10 * 60 * 1000,
} satisfies StepOptions;

const selectPendingVersionsStepOptions = {
	timeout: 30_000,
} satisfies StepOptions;

const processVersionStepOptions = {
	timeout: 2 * 60 * 1000,
} satisfies StepOptions;

export const INTENT_DISCOVER_WORKFLOW_ID = 'intent-discover-workflow';
export const INTENT_PROCESS_WORKFLOW_ID = 'intent-process-workflow';
export const INTENT_DISCOVER_SCHEDULE_ID = 'intent-discover-every-6h';
export const INTENT_PROCESS_SCHEDULE_ID = 'intent-process-every-15m';

function createIntentDiscoverWorkflow(
	operations: IntentSyncOperations = defaultIntentSyncOperations,
) {
	return createWorkflow({
		id: INTENT_DISCOVER_WORKFLOW_ID,
		input: intentDiscoverInputSchema,
	}).handler((ctx) =>
		ctx.step(
			'discover-intent-packages',
			() => operations.discoverIntentPackages(),
			discoverStepOptions,
		),
	);
}

export function createIntentProcessWorkflow(
	operations: IntentSyncOperations = defaultIntentSyncOperations,
) {
	return createWorkflow({
		id: INTENT_PROCESS_WORKFLOW_ID,
		input: intentProcessInputSchema,
	}).handler(async (ctx) => {
		const deadline = Date.now() + ctx.input.maxDurationMs;
		const attemptedIds = new Set<number>();
		const results: Array<IntentVersionProcessResult> = [];
		let deferred = 0;
		let selectIteration = 0;
		let shouldContinue = true;

		while (shouldContinue && hasProcessBudget(deadline)) {
			const versions = await ctx.step(
				`select-pending-versions:${selectIteration}`,
				() =>
					operations.selectPendingIntentVersions({
						limit: PROCESS_WORKFLOW_SELECT_LIMIT,
						excludeIds: [...attemptedIds],
					}),
				selectPendingVersionsStepOptions,
			);
			selectIteration++;

			if (versions.length === 0) break;

			const unattemptedVersions = versions.filter((version) => !attemptedIds.has(version.id));
			if (unattemptedVersions.length === 0) break;

			for (let index = 0; index < unattemptedVersions.length; index++) {
				if (!hasProcessBudget(deadline)) {
					deferred += unattemptedVersions.length - index;
					shouldContinue = false;
					break;
				}

				const version = unattemptedVersions[index]!;
				attemptedIds.add(version.id);

				try {
					results.push(
						await ctx.step(
							`process-version:${version.id}`,
							() => operations.processIntentVersion(version.id),
							processVersionStepOptions,
						),
					);
				} catch (error) {
					results.push({
						packageName: version.packageName,
						version: version.version,
						status: 'failed',
						error: getErrorMessage(error),
					});
				}
			}

			if (versions.length < PROCESS_WORKFLOW_SELECT_LIMIT) break;
		}

		return summarizeIntentProcessResults(results, { deferred });
	});
}

const intentDiscoverWorkflow = createIntentDiscoverWorkflow();
const intentProcessWorkflow = createIntentProcessWorkflow();

export const intentWorkflowRegistrations = {
	[intentDiscoverWorkflow.id]: {
		load: async () => intentDiscoverWorkflow,
		schedules: [
			{
				id: INTENT_DISCOVER_SCHEDULE_ID,
				schedule: every.hours(6),
				overlapPolicy: 'skip',
				input: { source: 'schedule' },
			},
		],
	},
	[intentProcessWorkflow.id]: {
		load: async () => intentProcessWorkflow,
		schedules: [
			{
				id: INTENT_PROCESS_SCHEDULE_ID,
				schedule: every.minutes(15),
				overlapPolicy: 'skip',
				input: {
					maxDurationMs: PROCESS_WORKFLOW_DEFAULT_MAX_DURATION_MS,
					source: 'schedule',
				},
			},
		],
	},
} satisfies WorkflowRegistrationMap;

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function hasProcessBudget(deadline: number): boolean {
	return Date.now() + PROCESS_WORKFLOW_MIN_REMAINING_MS < deadline;
}

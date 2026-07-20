import { defineWorkflowRuntime } from '@tanstack/workflow-runtime';
import { createDrizzlePostgresWorkflowStore } from '@tanstack/workflow-store-drizzle-postgres';
import { workflowRuns, workflowSchedules } from '@tanstack/workflow-store-drizzle-postgres';
import { and, eq, inArray, isNull, lte, notInArray, or, sql } from 'drizzle-orm';
import { db } from '~/db/client';
import { intentWorkflowRegistrations } from '~/utils/intent-workflows.server';

export const workflowExecutionStore = createDrizzlePostgresWorkflowStore({ db });

export const workflowRuntime = defineWorkflowRuntime({
	store: workflowExecutionStore,
	workflows: {
		...intentWorkflowRegistrations,
	},
});

const DEFAULT_STALE_RUN_MS = 60 * 60 * 1000;
const STALE_RUN_ERROR_NAME = 'StaleWorkflowRunError';
const STALE_RUN_ERROR_CODE = 'STALE_WORKFLOW_RUN';

export interface WorkflowRuntimeRunHealth {
	runId: string;
	workflowId: string;
	status: string;
	updatedAt: Date;
	leaseExpiresAt: Date | null;
}

export interface WorkflowRuntimeScheduleHealth {
	scheduleId: string;
	workflowId: string;
	enabled: boolean;
	nextFireAt: Date | null;
	updatedAt: Date;
}

export interface WorkflowRuntimeHealth {
	checkedAt: Date;
	staleRunMs: number;
	staleRuns: Array<WorkflowRuntimeRunHealth>;
	unregisteredSchedules: Array<WorkflowRuntimeScheduleHealth>;
	schedules: Array<WorkflowRuntimeScheduleHealth>;
	latestRuns: Array<{
		runId: string;
		workflowId: string;
		status: string;
		updatedAt: Date;
	}>;
	statusCounts: Array<{
		status: string;
		count: number;
	}>;
}

export interface WorkflowRuntimeReconcileResult {
	staleRunsMarkedErrored: number;
	unregisteredSchedulesDeleted: number;
	staleRuns: Array<WorkflowRuntimeRunHealth>;
	unregisteredSchedules: Array<WorkflowRuntimeScheduleHealth>;
}

export async function getWorkflowRuntimeHealth(options?: {
	now?: number;
	staleRunMs?: number;
}): Promise<WorkflowRuntimeHealth> {
	const now = options?.now ?? Date.now();
	const staleRunMs = options?.staleRunMs ?? DEFAULT_STALE_RUN_MS;
	const [staleRuns, unregisteredSchedules, schedules, latestRuns, statusCounts] = await Promise.all(
		[
			listStaleWorkflowRuns({ now, staleRunMs }),
			listUnregisteredWorkflowSchedules(),
			listRegisteredWorkflowSchedules(),
			listLatestRegisteredWorkflowRuns(),
			listRegisteredWorkflowRunStatusCounts(),
		],
	);

	return {
		checkedAt: new Date(now),
		staleRunMs,
		staleRuns,
		unregisteredSchedules,
		schedules,
		latestRuns,
		statusCounts,
	};
}

export async function reconcileWorkflowRuntimeStore(options?: {
	now?: number;
	staleRunMs?: number;
}): Promise<WorkflowRuntimeReconcileResult> {
	const now = options?.now ?? Date.now();
	const staleRunMs = options?.staleRunMs ?? DEFAULT_STALE_RUN_MS;
	const [staleRuns, unregisteredSchedules] = await Promise.all([
		listStaleWorkflowRuns({ now, staleRunMs }),
		listUnregisteredWorkflowSchedules(),
	]);

	await Promise.all(
		staleRuns.map((run) =>
			workflowExecutionStore.markRunErrored({
				runId: run.runId,
				code: STALE_RUN_ERROR_CODE,
				now,
				error: {
					name: STALE_RUN_ERROR_NAME,
					message: `Workflow run was marked stale after ${Math.round(
						staleRunMs / 60_000,
					)} minutes without an active lease.`,
				},
			}),
		),
	);

	const deletedSchedules = await deleteUnregisteredWorkflowSchedules();

	return {
		staleRunsMarkedErrored: staleRuns.length,
		unregisteredSchedulesDeleted: deletedSchedules.length,
		staleRuns,
		unregisteredSchedules,
	};
}

async function listStaleWorkflowRuns(options: { now: number; staleRunMs: number }) {
	const rows = await db
		.select({
			runId: workflowRuns.runId,
			workflowId: workflowRuns.workflowId,
			status: workflowRuns.status,
			updatedAt: workflowRuns.updatedAt,
			leaseExpiresAt: workflowRuns.leaseExpiresAt,
		})
		.from(workflowRuns)
		.where(getStaleRunWhere(options))
		.orderBy(workflowRuns.updatedAt);

	return rows.map((row) => ({
		runId: row.runId,
		workflowId: row.workflowId,
		status: row.status,
		updatedAt: new Date(row.updatedAt),
		leaseExpiresAt: row.leaseExpiresAt ? new Date(row.leaseExpiresAt) : null,
	}));
}

async function listUnregisteredWorkflowSchedules() {
	const rows = await db
		.select({
			scheduleId: workflowSchedules.scheduleId,
			workflowId: workflowSchedules.workflowId,
			enabled: workflowSchedules.enabled,
			nextFireAt: workflowSchedules.nextFireAt,
			updatedAt: workflowSchedules.updatedAt,
		})
		.from(workflowSchedules)
		.where(getUnregisteredScheduleWhere())
		.orderBy(workflowSchedules.workflowId, workflowSchedules.scheduleId);

	return rows.map(toScheduleHealth);
}

async function listRegisteredWorkflowSchedules() {
	const scheduleIds = getRegisteredWorkflowScheduleIds();
	if (scheduleIds.length === 0) return [];

	const rows = await db
		.select({
			scheduleId: workflowSchedules.scheduleId,
			workflowId: workflowSchedules.workflowId,
			enabled: workflowSchedules.enabled,
			nextFireAt: workflowSchedules.nextFireAt,
			updatedAt: workflowSchedules.updatedAt,
		})
		.from(workflowSchedules)
		.where(inArray(workflowSchedules.scheduleId, scheduleIds))
		.orderBy(workflowSchedules.workflowId, workflowSchedules.scheduleId);

	return rows.map(toScheduleHealth);
}

async function listLatestRegisteredWorkflowRuns() {
	const runs = await Promise.all(
		getRegisteredWorkflowIds().map((workflowId) =>
			workflowExecutionStore.listRuns({
				workflowId,
				limit: 1,
			}),
		),
	);

	return runs.flat().map((run) => ({
		runId: run.runId,
		workflowId: run.workflowId,
		status: run.status,
		updatedAt: new Date(run.updatedAt),
	}));
}

async function listRegisteredWorkflowRunStatusCounts() {
	const workflowIds = getRegisteredWorkflowIds();
	if (workflowIds.length === 0) return [];

	return db
		.select({
			status: workflowRuns.status,
			count: sql<number>`count(*)::int`,
		})
		.from(workflowRuns)
		.where(inArray(workflowRuns.workflowId, workflowIds))
		.groupBy(workflowRuns.status)
		.orderBy(workflowRuns.status);
}

async function deleteUnregisteredWorkflowSchedules() {
	return db.delete(workflowSchedules).where(getUnregisteredScheduleWhere()).returning({
		scheduleId: workflowSchedules.scheduleId,
		workflowId: workflowSchedules.workflowId,
	});
}

function getRegisteredWorkflowIds() {
	return Object.keys(workflowRuntime.workflows);
}

function getRegisteredWorkflowScheduleIds() {
	return Object.entries(workflowRuntime.workflows).flatMap(([workflowId, registration]) =>
		(registration.schedules ?? []).map(
			(schedule, index) => schedule.id ?? `${workflowId}:${index}`,
		),
	);
}

function getStaleRunWhere(options: { now: number; staleRunMs: number }) {
	const registeredWorkflowIds = getRegisteredWorkflowIds();
	const staleBefore = options.now - options.staleRunMs;

	return and(
		inArray(workflowRuns.status, ['running', 'queued']),
		lte(workflowRuns.updatedAt, staleBefore),
		or(
			notInArray(workflowRuns.workflowId, registeredWorkflowIds),
			and(
				eq(workflowRuns.status, 'running'),
				or(isNull(workflowRuns.leaseExpiresAt), lte(workflowRuns.leaseExpiresAt, options.now)),
			),
		),
	);
}

function getUnregisteredScheduleWhere() {
	const workflowIds = getRegisteredWorkflowIds();
	const scheduleIds = getRegisteredWorkflowScheduleIds();

	return or(
		notInArray(workflowSchedules.workflowId, workflowIds),
		notInArray(workflowSchedules.scheduleId, scheduleIds),
	);
}

function toScheduleHealth(row: {
	scheduleId: string;
	workflowId: string;
	enabled: boolean;
	nextFireAt: number | null;
	updatedAt: number;
}): WorkflowRuntimeScheduleHealth {
	return {
		scheduleId: row.scheduleId,
		workflowId: row.workflowId,
		enabled: row.enabled,
		nextFireAt: row.nextFireAt ? new Date(row.nextFireAt) : null,
		updatedAt: new Date(row.updatedAt),
	};
}

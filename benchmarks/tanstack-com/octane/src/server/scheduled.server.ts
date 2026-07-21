import { materializeWorkflowSchedules } from '@tanstack/workflow-runtime';
import { pruneStaleCacheRows } from '~/utils/github-content-cache.server';
import { refreshHomepageNpmStatsSummary } from '~/utils/homepage-npm-stats.server';
import { refreshGitHubOrgStats } from '~/utils/stats.functions';
import { reconcileWorkflowRuntimeStore, workflowRuntime } from '~/utils/workflow-runtime.server';

const CONTENT_CACHE_PRUNE_CRON = '0 9 * * *';
const STATS_REFRESH_CRON = '0 */6 * * *';
const WORKFLOW_SWEEP_CRON = '* * * * *';
const WORKFLOW_SWEEP_MAX_DURATION_MS = 25_000;

export async function runScheduledTasks(cron: string, scheduledTime: number) {
	switch (cron) {
		case CONTENT_CACHE_PRUNE_CRON:
			await runContentCachePrune(scheduledTime);
			return;
		case STATS_REFRESH_CRON:
			await Promise.all([
				runGitHubStatsRefresh(scheduledTime),
				runHomepageNpmStatsSummaryRefresh(scheduledTime),
			]);
			return;
		case WORKFLOW_SWEEP_CRON:
			await runWorkflowSweep(cron, scheduledTime);
			return;
		default:
			console.warn(`[scheduled] No task registered for cron: ${cron}`);
	}
}

async function runWorkflowSweep(cron: string, scheduledTime: number) {
	const startTime = Date.now();
	console.log('[workflow-sweep] Starting workflow sweep...');

	try {
		const reconciliation = await reconcileWorkflowRuntimeStore();
		const materialized = await materializeWorkflowSchedules(workflowRuntime, {
			now: scheduledTime,
		});
		const sweep = await workflowRuntime.sweep({
			now: scheduledTime,
			leaseOwner: `cloudflare:${cron}:${scheduledTime}`,
			maxDurationMs: WORKFLOW_SWEEP_MAX_DURATION_MS,
			maxScheduledRuns: 10,
			maxTimers: 10,
			includeEvents: false,
		});
		const duration = Date.now() - startTime;

		console.log(
			`[workflow-sweep] Completed in ${duration}ms - staleRuns: ${reconciliation.staleRunsMarkedErrored}, prunedSchedules: ${reconciliation.unregisteredSchedulesDeleted}, materialized: ${materialized.length}, scheduled: ${JSON.stringify(sweep.summary.scheduled)}, timers: ${JSON.stringify(sweep.summary.timers)}, remaining: ${sweep.remainingMayExist}`,
		);
		console.log('[workflow-sweep] Scheduled time:', new Date(scheduledTime).toISOString());
	} catch (error) {
		logScheduledError('workflow-sweep', startTime, error);
	}
}

async function runContentCachePrune(scheduledTime: number) {
	const startTime = Date.now();
	console.log('[prune-content-cache] Starting prune...');

	try {
		const result = await pruneStaleCacheRows();
		const duration = Date.now() - startTime;

		console.log(
			`[prune-content-cache] Completed in ${duration}ms - deleted ${result.githubContentDeleted} content entries (${result.githubContentNegativesDeleted} negatives), ${result.docsArtifactDeleted} artifact entries (cutoff: ${result.cutoff.toISOString()}, negativeCutoff: ${result.negativeCutoff.toISOString()})`,
		);
		console.log('[prune-content-cache] Scheduled time:', new Date(scheduledTime).toISOString());
	} catch (error) {
		logScheduledError('prune-content-cache', startTime, error);
	}
}

async function runGitHubStatsRefresh(scheduledTime: number) {
	const startTime = Date.now();
	console.log('[refresh-github-stats] Starting GitHub stats refresh...');

	try {
		const org = 'tanstack';
		const { orgStats, libraryResults, libraryErrors } = await refreshGitHubOrgStats(org);
		const duration = Date.now() - startTime;

		console.log(
			`[refresh-github-stats] Completed in ${duration}ms - GitHub Org: ${orgStats.starCount.toLocaleString()} stars, Libraries: ${
				libraryResults.length
			} refreshed, ${libraryErrors.length} failed`,
		);
		console.log('[refresh-github-stats] Scheduled time:', new Date(scheduledTime).toISOString());
	} catch (error) {
		logScheduledError('refresh-github-stats', startTime, error);
	}
}

async function runHomepageNpmStatsSummaryRefresh(scheduledTime: number) {
	const startTime = Date.now();
	console.log('[refresh-homepage-npm-stats] Starting NPM stats summary refresh...');

	try {
		const summary = await refreshHomepageNpmStatsSummary();
		const duration = Date.now() - startTime;

		console.log(
			`[refresh-homepage-npm-stats] Completed in ${duration}ms - total: ${summary.totalDownloads.toLocaleString()} across ${summary.totalPackageCount} packages, weekly: ${summary.weeklyDownloads.toLocaleString()} across ${summary.weeklyPackageCount} packages`,
		);
		console.log(
			'[refresh-homepage-npm-stats] Scheduled time:',
			new Date(scheduledTime).toISOString(),
		);
	} catch (error) {
		logScheduledError('refresh-homepage-npm-stats', startTime, error);
	}
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function logScheduledError(task: string, startTime: number, error: unknown) {
	const duration = Date.now() - startTime;
	const errorMessage = getErrorMessage(error);
	const errorStack = error instanceof Error ? error.stack : undefined;

	console.error(`[${task}] Failed after ${duration}ms:`, errorMessage);
	if (errorStack) {
		console.error(`[${task}] Stack:`, errorStack);
	}
}

/**
 * Admin server functions for managing the Intent skills registry.
 * All functions require the 'admin' capability.
 */

import { randomUUID } from 'node:crypto';
import { db } from '~/db/client';
import { intentPackages, intentPackageVersions, intentSkills } from '~/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { requireCapability } from './auth.server';
import { fetchPackument, selectVersionsToSync, extractSkillsFromTarball } from './intent.server';
import {
	upsertIntentPackage,
	getKnownVersions,
	enqueuePackageVersion,
	replaceSkillsForVersion,
	markVersionSynced,
} from './intent-db.server';
import {
	INTENT_DISCOVER_WORKFLOW_ID,
	INTENT_PROCESS_WORKFLOW_ID,
	intentWorkflowRegistrations,
} from '~/utils/intent-workflows.server';
import { intentDiscoveryResultSchema, intentProcessResultSchema } from '~/utils/intent-sync.server';
import {
	getWorkflowRuntimeHealth,
	reconcileWorkflowRuntimeStore,
	workflowExecutionStore,
	workflowRuntime,
} from '~/utils/workflow-runtime.server';
import type { WorkflowRuntimeRunResult } from '@tanstack/workflow-runtime';

// ---------------------------------------------------------------------------
// Stats / overview
// ---------------------------------------------------------------------------

export async function getIntentAdminStats() {
	await requireCapability({ data: { capability: 'admin' } });

	const [
		totalPackages,
		verifiedPackages,
		pendingVersions,
		failedVersions,
		syncedVersions,
		totalSkills,
	] = await Promise.all([
		db.select({ count: sql<number>`count(*)::int` }).from(intentPackages),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentPackages)
			.where(eq(intentPackages.verified, true)),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentPackageVersions)
			.where(eq(intentPackageVersions.syncStatus, 'pending')),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentPackageVersions)
			.where(eq(intentPackageVersions.syncStatus, 'failed')),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentPackageVersions)
			.where(eq(intentPackageVersions.syncStatus, 'synced')),
		db.select({ count: sql<number>`count(*)::int` }).from(intentSkills),
	]);

	return {
		totalPackages: totalPackages[0]?.count ?? 0,
		verifiedPackages: verifiedPackages[0]?.count ?? 0,
		pendingVersions: pendingVersions[0]?.count ?? 0,
		failedVersions: failedVersions[0]?.count ?? 0,
		syncedVersions: syncedVersions[0]?.count ?? 0,
		totalSkills: totalSkills[0]?.count ?? 0,
	};
}

export async function listIntentWorkflowRuns() {
	await requireCapability({ data: { capability: 'admin' } });

	const runs = await Promise.all(
		Object.keys(intentWorkflowRegistrations).map((workflowId) =>
			workflowExecutionStore.listRuns({
				workflowId,
				limit: 5,
			}),
		),
	);

	return runs
		.flat()
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 10)
		.map((run) => ({
			runId: run.runId,
			workflowId: run.workflowId,
			workflowVersion: run.workflowVersion,
			status: run.status,
			waitingFor: run.waitingFor?.signalName,
			wakeAt: run.wakeAt ? new Date(run.wakeAt) : null,
			createdAt: new Date(run.createdAt),
			updatedAt: new Date(run.updatedAt),
		}));
}

export async function getIntentWorkflowHealth() {
	await requireCapability({ data: { capability: 'admin' } });

	return getWorkflowRuntimeHealth();
}

export async function repairIntentWorkflowStore() {
	await requireCapability({ data: { capability: 'admin' } });

	return reconcileWorkflowRuntimeStore();
}

// ---------------------------------------------------------------------------
// Package list (all known packages with status)
// ---------------------------------------------------------------------------

export async function listIntentPackages() {
	await requireCapability({ data: { capability: 'admin' } });

	const packages = await db.query.intentPackages.findMany({
		orderBy: [desc(intentPackages.lastSyncedAt)],
	});

	// Attach per-package version counts by status
	const versionCounts = await db
		.select({
			packageName: intentPackageVersions.packageName,
			syncStatus: intentPackageVersions.syncStatus,
			count: sql<number>`count(*)::int`,
		})
		.from(intentPackageVersions)
		.groupBy(intentPackageVersions.packageName, intentPackageVersions.syncStatus);

	const countsByPkg = new Map<string, { pending: number; synced: number; failed: number }>();
	for (const row of versionCounts) {
		const existing = countsByPkg.get(row.packageName) ?? {
			pending: 0,
			synced: 0,
			failed: 0,
		};
		if (row.syncStatus === 'pending') existing.pending = row.count;
		else if (row.syncStatus === 'synced') existing.synced = row.count;
		else if (row.syncStatus === 'failed') existing.failed = row.count;
		countsByPkg.set(row.packageName, existing);
	}

	return packages.map((pkg) => ({
		...pkg,
		versions: countsByPkg.get(pkg.name) ?? {
			pending: 0,
			synced: 0,
			failed: 0,
		},
	}));
}

// ---------------------------------------------------------------------------
// Failed versions (for targeted retry)
// ---------------------------------------------------------------------------

export async function listFailedVersions() {
	await requireCapability({ data: { capability: 'admin' } });

	return db.query.intentPackageVersions.findMany({
		where: eq(intentPackageVersions.syncStatus, 'failed'),
		orderBy: [desc(intentPackageVersions.createdAt)],
	});
}

// ---------------------------------------------------------------------------
// Trigger: run discovery phase (same logic as the scheduled function)
// ---------------------------------------------------------------------------

export async function triggerIntentDiscover() {
	await requireCapability({ data: { capability: 'admin' } });

	const result = await workflowRuntime.startRun({
		workflowId: INTENT_DISCOVER_WORKFLOW_ID,
		runId: createAdminRunId(INTENT_DISCOVER_WORKFLOW_ID),
		input: { source: 'admin' },
		includeEvents: false,
	});

	return intentDiscoveryResultSchema.parse(getCompletedWorkflowOutput(result));
}

// ---------------------------------------------------------------------------
// Trigger: process pending versions using the same time budget as scheduled runs
// ---------------------------------------------------------------------------

export async function triggerIntentProcess() {
	await requireCapability({ data: { capability: 'admin' } });

	const result = await workflowRuntime.startRun({
		workflowId: INTENT_PROCESS_WORKFLOW_ID,
		runId: createAdminRunId(INTENT_PROCESS_WORKFLOW_ID),
		input: {
			source: 'admin',
		},
		includeEvents: false,
	});

	return intentProcessResultSchema.parse(getCompletedWorkflowOutput(result));
}

// ---------------------------------------------------------------------------
// Trigger: retry a specific failed version by id
// ---------------------------------------------------------------------------

export async function retryIntentVersion({ data }: { data: any }) {
	await requireCapability({ data: { capability: 'admin' } });

	const version = await db.query.intentPackageVersions.findFirst({
		where: eq(intentPackageVersions.id, data.versionId),
	});

	if (!version) throw new Error(`Version ${data.versionId} not found`);
	if (!version.tarballUrl) throw new Error('No tarball URL recorded for this version');

	// Reset to pending so the process trigger picks it up, or process inline
	const skills = await extractSkillsFromTarball(version.tarballUrl);
	await replaceSkillsForVersion(version.id, skills);
	await markVersionSynced(version.id, skills.length);

	return { skillCount: skills.length };
}

// ---------------------------------------------------------------------------
// Discover intent-compatible packages via GitHub code search.
// Finds repos with @tanstack/intent in package.json, resolves npm package
// names, and enqueues any that have SKILL.md files in their published tarball.
// ---------------------------------------------------------------------------

export async function discoverViaGitHub() {
	await requireCapability({ data: { capability: 'admin' } });

	const token = process.env.GITHUB_AUTH_TOKEN;
	if (!token) throw new Error('GITHUB_AUTH_TOKEN not set');

	const ghHeaders = {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github.v3+json',
	};

	// Search GitHub for package.json files referencing @tanstack/intent
	const searchRes = await fetch(
		'https://api.github.com/search/code?q=%22%40tanstack%2Fintent%22+filename%3Apackage.json&per_page=100',
		{ headers: ghHeaders },
	);
	if (!searchRes.ok) throw new Error(`GitHub search failed: ${searchRes.status}`);
	const searchData = (await searchRes.json()) as {
		total_count: number;
		items: Array<{
			path: string;
			repository: { full_name: string };
			url: string;
		}>;
	};

	// Deduplicate: one package.json per repo+path
	const seen = new Set<string>();
	const candidates: Array<{ repo: string; path: string }> = [];
	for (const item of searchData.items) {
		const key = `${item.repository.full_name}|${item.path}`;
		if (!seen.has(key)) {
			seen.add(key);
			candidates.push({ repo: item.repository.full_name, path: item.path });
		}
	}

	const results = {
		searched: candidates.length,
		checkedOnNpm: 0,
		hadSkills: 0,
		enqueued: 0,
		skipped: 0,
		errors: [] as Array<string>,
	};

	for (const { repo, path } of candidates) {
		try {
			// Fetch the package.json content from GitHub
			const contentRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
				headers: ghHeaders,
			});
			if (!contentRes.ok) continue;
			const contentData = (await contentRes.json()) as {
				content?: string;
				encoding?: string;
			};
			if (!contentData.content) continue;

			const pkgJson = JSON.parse(Buffer.from(contentData.content, 'base64').toString('utf-8')) as {
				name?: string;
				private?: boolean;
			};

			const pkgName = pkgJson.name;
			if (!pkgName || pkgJson.private) continue;

			results.checkedOnNpm++;

			// Check NPM for the package and its latest tarball
			const npmRes = await fetch(
				`https://registry.npmjs.org/${encodeURIComponent(pkgName)}/latest`,
			);
			if (!npmRes.ok) continue; // not published

			const npmMeta = (await npmRes.json()) as {
				version?: string;
				dist?: { tarball?: string };
			};
			const version = npmMeta.version;
			const tarballUrl = npmMeta.dist?.tarball;
			if (!version || !tarballUrl) continue;

			// Peek at tarball for SKILL.md files (stream headers only)
			const skills = await extractSkillsFromTarball(tarballUrl);
			if (skills.length === 0) {
				results.skipped++;
				continue;
			}

			results.hadSkills++;

			// Seed into DB
			await upsertIntentPackage({ name: pkgName, verified: true });

			const knownVersions = await getKnownVersions(pkgName);
			const packument = await fetchPackument(pkgName);
			const versionsToEnqueue = selectVersionsToSync(packument, knownVersions);

			for (const v of versionsToEnqueue) {
				await enqueuePackageVersion({
					packageName: pkgName,
					version: v.version,
					tarballUrl: v.tarball,
					publishedAt: v.publishedAt,
				});
				results.enqueued++;
			}
		} catch (err) {
			results.errors.push(`${repo}/${path}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return results;
}

// ---------------------------------------------------------------------------
// Manually seed a specific package by name, bypassing keyword discovery.
// Useful for packages that ship skills but haven't yet published the keyword.
// ---------------------------------------------------------------------------

export async function seedIntentPackage({ data }: { data: any }) {
	await requireCapability({ data: { capability: 'admin' } });

	const packument = await fetchPackument(data.name);
	const latestVersion = packument['dist-tags'].latest;
	if (!latestVersion) throw new Error(`No latest version found for ${data.name}`);

	await upsertIntentPackage({ name: data.name, verified: true });

	const knownVersions = await getKnownVersions(data.name);
	const versionsToEnqueue = selectVersionsToSync(packument, knownVersions);

	let versionsEnqueued = 0;
	for (const { version, tarball, publishedAt } of versionsToEnqueue) {
		await enqueuePackageVersion({
			packageName: data.name,
			version,
			tarballUrl: tarball,
			publishedAt,
		});
		versionsEnqueued++;
	}

	return { versionsEnqueued };
}

// ---------------------------------------------------------------------------
// Delete a package and all its versions/skills
// ---------------------------------------------------------------------------

export async function deleteIntentPackage({ data }: { data: any }) {
	await requireCapability({ data: { capability: 'admin' } });

	await db.delete(intentPackages).where(eq(intentPackages.name, data.name));

	return { deleted: true };
}

// ---------------------------------------------------------------------------
// Reset failed versions back to pending (bulk retry)
// ---------------------------------------------------------------------------

export async function resetFailedVersions() {
	await requireCapability({ data: { capability: 'admin' } });

	const result = await db
		.update(intentPackageVersions)
		.set({ syncStatus: 'pending', failureReason: null })
		.where(eq(intentPackageVersions.syncStatus, 'failed'))
		.returning({ id: intentPackageVersions.id });

	return { resetCount: result.length };
}

function createAdminRunId(workflowId: string) {
	return `${workflowId}:admin:${Date.now()}:${randomUUID()}`;
}

function getCompletedWorkflowOutput(result: WorkflowRuntimeRunResult): unknown {
	if (result.kind !== 'completed' || !result.run) {
		throw new Error(`Workflow ${result.workflowId ?? 'unknown'} did not complete: ${result.kind}`);
	}

	return result.run.output;
}

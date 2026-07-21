/**
 * Database operations for the Intent registry.
 * Server-only. Import only inside server function handlers or scheduled functions.
 */

import { db } from '~/db/client';
import {
	intentPackages,
	intentPackageVersions,
	intentSkills,
	intentSkillContent,
} from '~/db/schema';
import { eq, desc, sql, and, inArray, or, ilike, notInArray } from 'drizzle-orm';
import type {
	IntentPackage,
	IntentPackageVersion,
	IntentSkill,
	IntentSkillContent,
	NewIntentPackage,
	NewIntentSkill,
	NewIntentSkillContent,
} from '~/db/schema';
import type { ParsedSkill } from './intent.server';

export type { IntentPackage, IntentPackageVersion, IntentSkill, IntentSkillContent };

export interface IntentLatestVersionSkillSummary {
	packageName: string;
	latestVersion: string;
	publishedAt: Date | null;
	skillNames: Array<string>;
	frameworks: Array<string>;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAllVerifiedPackages(): Promise<Array<IntentPackage>> {
	return db.query.intentPackages.findMany({
		where: eq(intentPackages.verified, true),
		orderBy: [desc(intentPackages.lastSyncedAt)],
	});
}

export async function getPackageByName(name: string): Promise<IntentPackage | undefined> {
	return db.query.intentPackages.findFirst({
		where: eq(intentPackages.name, name),
	});
}

// Returns all versions for a package that have been fully synced, newest-first
export async function getPackageVersions(
	packageName: string,
): Promise<Array<IntentPackageVersion>> {
	return db.query.intentPackageVersions.findMany({
		where: and(
			eq(intentPackageVersions.packageName, packageName),
			eq(intentPackageVersions.syncStatus, 'synced'),
		),
		orderBy: [desc(intentPackageVersions.publishedAt)],
	});
}

// Set of ALL known version strings for a package regardless of sync status.
// Used during discovery to avoid inserting duplicate pending entries.
export async function getKnownVersions(packageName: string): Promise<Set<string>> {
	const rows = await db
		.select({ version: intentPackageVersions.version })
		.from(intentPackageVersions)
		.where(eq(intentPackageVersions.packageName, packageName));
	return new Set(rows.map((r) => r.version));
}

// Pull up to `limit` pending versions ordered by createdAt (FIFO queue).
// Also includes 'failed' rows so they get retried each cycle.
export interface PendingIntentVersion {
	id: number;
	packageName: string;
	version: string;
	tarballUrl: string | null;
}

export async function getPendingVersions(
	limit: number,
	options?: { excludeIds?: Array<number> },
): Promise<Array<PendingIntentVersion>> {
	const where = and(
		inArray(intentPackageVersions.syncStatus, ['pending', 'failed']),
		options?.excludeIds?.length
			? notInArray(intentPackageVersions.id, options.excludeIds)
			: undefined,
	);

	return db
		.select({
			id: intentPackageVersions.id,
			packageName: intentPackageVersions.packageName,
			version: intentPackageVersions.version,
			tarballUrl: intentPackageVersions.tarballUrl,
		})
		.from(intentPackageVersions)
		.where(where)
		.orderBy(intentPackageVersions.createdAt)
		.limit(limit);
}

export interface IntentVersionForProcessing extends PendingIntentVersion {
	syncStatus: string;
	skillCount: number;
}

export async function getVersionForProcessing(
	id: number,
): Promise<IntentVersionForProcessing | undefined> {
	const rows = await db
		.select({
			id: intentPackageVersions.id,
			packageName: intentPackageVersions.packageName,
			version: intentPackageVersions.version,
			tarballUrl: intentPackageVersions.tarballUrl,
			syncStatus: intentPackageVersions.syncStatus,
			skillCount: intentPackageVersions.skillCount,
		})
		.from(intentPackageVersions)
		.where(eq(intentPackageVersions.id, id))
		.limit(1);

	return rows[0];
}

export async function getSkillsForVersion(
	packageVersionId: number,
): Promise<Array<IntentSkill & { content: string }>> {
	const rows = await db
		.select({
			id: intentSkills.id,
			packageVersionId: intentSkills.packageVersionId,
			name: intentSkills.name,
			description: intentSkills.description,
			type: intentSkills.type,
			framework: intentSkills.framework,
			requires: intentSkills.requires,
			skillPath: intentSkills.skillPath,
			contentHash: intentSkills.contentHash,
			lineCount: intentSkills.lineCount,
			content: intentSkillContent.content,
		})
		.from(intentSkills)
		.innerJoin(intentSkillContent, eq(intentSkills.contentHash, intentSkillContent.contentHash))
		.where(eq(intentSkills.packageVersionId, packageVersionId));
	return rows;
}

export async function getLatestIntentVersionSkillSummaries(): Promise<
	Array<IntentLatestVersionSkillSummary>
> {
	const latestVersions = db
		.selectDistinctOn([intentPackageVersions.packageName], {
			id: intentPackageVersions.id,
			packageName: intentPackageVersions.packageName,
			latestVersion: intentPackageVersions.version,
			publishedAt: intentPackageVersions.publishedAt,
		})
		.from(intentPackageVersions)
		.innerJoin(intentPackages, eq(intentPackageVersions.packageName, intentPackages.name))
		.where(and(eq(intentPackages.verified, true), eq(intentPackageVersions.syncStatus, 'synced')))
		.orderBy(
			intentPackageVersions.packageName,
			sql`${intentPackageVersions.publishedAt} desc nulls last`,
			desc(intentPackageVersions.id),
		)
		.as('latest_versions');

	return db
		.select({
			packageName: latestVersions.packageName,
			latestVersion: latestVersions.latestVersion,
			publishedAt: latestVersions.publishedAt,
			skillNames: sql<Array<string>>`
        coalesce(
          jsonb_agg(${intentSkills.name} order by ${intentSkills.name})
            filter (where ${intentSkills.name} is not null),
          '[]'::jsonb
        )
      `,
			frameworks: sql<Array<string>>`
        coalesce(
          jsonb_agg(distinct ${intentSkills.framework} order by ${intentSkills.framework})
            filter (where ${intentSkills.framework} is not null),
          '[]'::jsonb
        )
      `,
		})
		.from(latestVersions)
		.leftJoin(intentSkills, eq(intentSkills.packageVersionId, latestVersions.id))
		.groupBy(latestVersions.packageName, latestVersions.latestVersion, latestVersions.publishedAt);
}

// Lightweight query for diffing: only name + contentHash, no content body join
export async function getSkillFingerprintsForVersion(
	packageVersionId: number,
): Promise<Array<{ name: string; contentHash: string }>> {
	return db
		.select({
			name: intentSkills.name,
			contentHash: intentSkills.contentHash,
		})
		.from(intentSkills)
		.where(eq(intentSkills.packageVersionId, packageVersionId));
}

// Aggregate stats for the registry hero banner
export async function getIntentRegistryStats(): Promise<{
	packageCount: number;
	skillCount: number;
	versionCount: number;
}> {
	const [pkgCount, skillCount, versionCount] = await Promise.all([
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentPackages)
			.where(eq(intentPackages.verified, true)),
		// Count skills only for the latest published synced version per verified package.
		// Uses DISTINCT ON (package_name) ordered by published_at desc to get the true
		// latest version rather than max(id) which picks by insertion order.
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentSkills)
			.where(
				inArray(
					intentSkills.packageVersionId,
					db
						.selectDistinctOn([intentPackageVersions.packageName], {
							id: intentPackageVersions.id,
						})
						.from(intentPackageVersions)
						.innerJoin(intentPackages, eq(intentPackageVersions.packageName, intentPackages.name))
						.where(
							and(
								eq(intentPackages.verified, true),
								eq(intentPackageVersions.syncStatus, 'synced'),
							),
						)
						.orderBy(intentPackageVersions.packageName, desc(intentPackageVersions.publishedAt)),
				),
			),
		db
			.select({ count: sql<number>`count(*)::int` })
			.from(intentPackageVersions)
			.innerJoin(intentPackages, eq(intentPackageVersions.packageName, intentPackages.name))
			.where(
				and(eq(intentPackages.verified, true), eq(intentPackageVersions.syncStatus, 'synced')),
			),
	]);
	return {
		packageCount: pkgCount[0]?.count ?? 0,
		skillCount: skillCount[0]?.count ?? 0,
		versionCount: versionCount[0]?.count ?? 0,
	};
}

// Search verified packages by name
export async function searchPackagesByName(query: string): Promise<Array<IntentPackage>> {
	return db.query.intentPackages.findMany({
		where: and(eq(intentPackages.verified, true), ilike(intentPackages.name, `%${query}%`)),
		orderBy: [desc(intentPackages.lastSyncedAt)],
	});
}

export interface SkillSearchResult {
	skillId: number;
	skillName: string;
	description: string | null;
	type: string | null;
	framework: string | null;
	packageName: string;
	version: string;
	versionId: number;
	contentHash: string;
	lineCount: number;
}

// Search skills across all verified+synced packages by name, description, or content
export async function searchSkills(query: string, limit = 50): Promise<Array<SkillSearchResult>> {
	const pattern = `%${query}%`;
	const rows = await db
		.select({
			skillId: intentSkills.id,
			skillName: intentSkills.name,
			description: intentSkills.description,
			type: intentSkills.type,
			framework: intentSkills.framework,
			packageName: intentPackageVersions.packageName,
			version: intentPackageVersions.version,
			versionId: intentPackageVersions.id,
			contentHash: intentSkills.contentHash,
			lineCount: intentSkills.lineCount,
		})
		.from(intentSkills)
		.innerJoin(intentPackageVersions, eq(intentSkills.packageVersionId, intentPackageVersions.id))
		.innerJoin(intentPackages, eq(intentPackageVersions.packageName, intentPackages.name))
		.innerJoin(intentSkillContent, eq(intentSkills.contentHash, intentSkillContent.contentHash))
		.where(
			and(
				eq(intentPackages.verified, true),
				eq(intentPackageVersions.syncStatus, 'synced'),
				or(
					ilike(intentSkills.name, pattern),
					ilike(intentSkills.description, pattern),
					ilike(intentSkillContent.content, pattern),
				),
			),
		)
		.orderBy(intentPackageVersions.packageName, intentSkills.name)
		.limit(limit);
	return rows;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function upsertIntentPackage(pkg: NewIntentPackage): Promise<void> {
	await db
		.insert(intentPackages)
		.values(pkg)
		.onConflictDoUpdate({
			target: intentPackages.name,
			set: {
				verified: pkg.verified,
				lastSyncedAt: new Date(),
			},
		});
}

// Queue a version for tarball processing. Noop if it's already known
// (whether pending, synced, or failed) -- we never downgrade a synced version.
export async function enqueuePackageVersion(record: {
	packageName: string;
	version: string;
	tarballUrl: string;
	publishedAt: Date | null;
}): Promise<void> {
	await db
		.insert(intentPackageVersions)
		.values({
			packageName: record.packageName,
			version: record.version,
			tarballUrl: record.tarballUrl,
			publishedAt: record.publishedAt,
			syncStatus: 'pending',
			skillCount: 0,
		})
		.onConflictDoNothing({
			target: [intentPackageVersions.packageName, intentPackageVersions.version],
		});
}

// Mark a version as successfully synced with its skill count
export async function markVersionSynced(id: number, skillCount: number): Promise<void> {
	await db
		.update(intentPackageVersions)
		.set({
			syncStatus: 'synced',
			skillCount,
			syncedAt: new Date(),
			failureReason: null,
		})
		.where(eq(intentPackageVersions.id, id));
}

// Mark a version as failed with a reason (will be retried next cycle)
export async function markVersionFailed(id: number, reason: string): Promise<void> {
	await db
		.update(intentPackageVersions)
		.set({ syncStatus: 'failed', failureReason: reason })
		.where(eq(intentPackageVersions.id, id));
}

// Insert deduplicated skill content (noop if hash already exists)
async function insertSkillContent(record: NewIntentSkillContent): Promise<void> {
	await db
		.insert(intentSkillContent)
		.values(record)
		.onConflictDoNothing({ target: intentSkillContent.contentHash });
}

// Replace all skills for a version: delete existing rows then bulk insert.
// Versions are processed once (pending -> synced) so re-processing is rare
// (only on retries or manual re-seeds). Delete-then-insert is simpler than upsert.
export async function replaceSkillsForVersion(
	packageVersionId: number,
	skills: Array<ParsedSkill>,
): Promise<void> {
	// Content rows are content-addressed and shared across versions — always insert, never delete
	for (const skill of skills) {
		await insertSkillContent({
			contentHash: skill.contentHash,
			content: skill.content,
		});
	}

	// Replace skill metadata rows for this version
	await db.delete(intentSkills).where(eq(intentSkills.packageVersionId, packageVersionId));

	if (skills.length === 0) return;

	await db.insert(intentSkills).values(
		skills.map((s): NewIntentSkill => ({
			packageVersionId,
			name: s.name,
			description: s.description,
			type: s.type ?? null,
			framework: s.framework ?? null,
			requires: s.requires ?? null,
			skillPath: s.skillPath || null,
			contentHash: s.contentHash,
			lineCount: s.lineCount,
		})),
	);
}

// Mark a package as verified and update lastSyncedAt
export async function markPackageVerified(name: string): Promise<void> {
	await db
		.update(intentPackages)
		.set({ verified: true, lastSyncedAt: new Date() })
		.where(eq(intentPackages.name, name));
}

// Bump lastSyncedAt to now for a given package (used to throttle background refreshes)
export async function touchPackageSyncTime(name: string): Promise<void> {
	await db
		.update(intentPackages)
		.set({ lastSyncedAt: new Date() })
		.where(eq(intentPackages.name, name));
}

/**
 * Database operations for stats caching
 * This file contains server-only code that uses the database.
 * It should only be imported inside server function handlers.
 */

import { db } from '~/db/client';
import { githubStatsCache, npmDownloadChunks, ossStatsCache } from '~/db/schema';
import type { OssStatsCache } from '~/db/schema';
import { desc, eq, gte, inArray, and, lte } from 'drizzle-orm';
import type { GitHubStats, NpmStats, OSSStatsWithDelta } from './stats.types';
import type { HomepageNpmStatsSummary } from './homepage-npm-stats.server';

type OssStatsScopeType = 'org' | 'library';

type OssStatsRowInput = {
	github: GitHubStats;
	previousGithub?: GitHubStats | null;
	githubUpdatedAt?: Date;
	npm: NpmStats;
	npmPackageCount?: number;
	npmUpdatedAt?: Date;
	scopeKey: string;
	scopeType: OssStatsScopeType;
	timeDelta?: number;
};

function isGitHubStats(value: unknown): value is GitHubStats {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof Reflect.get(value, 'starCount') === 'number' &&
		typeof Reflect.get(value, 'contributorCount') === 'number'
	);
}

function getGitHubStats(value: unknown): GitHubStats {
	if (isGitHubStats(value)) {
		return value;
	}

	return {
		starCount: 0,
		contributorCount: 0,
	};
}

function calculateGithubDelta(current: GitHubStats, previous: GitHubStats | null) {
	if (!previous) {
		return {};
	}

	return {
		githubDeltaStarCount: current.starCount - previous.starCount,
		githubDeltaContributorCount: current.contributorCount - previous.contributorCount,
		githubDeltaDependentCount:
			current.dependentCount !== undefined && previous.dependentCount !== undefined
				? current.dependentCount - previous.dependentCount
				: null,
		githubDeltaForkCount:
			current.forkCount !== undefined && previous.forkCount !== undefined
				? current.forkCount - previous.forkCount
				: null,
	};
}

function mapOssStatsRow(row: OssStatsCache): OSSStatsWithDelta {
	return {
		github: {
			contributorCount: row.githubContributorCount,
			dependentCount: row.githubDependentCount ?? undefined,
			forkCount: row.githubForkCount ?? undefined,
			repositoryCount: row.githubRepositoryCount ?? undefined,
			starCount: row.githubStarCount,
		},
		npm: {
			ratePerDay: row.npmRatePerDay ?? undefined,
			totalDownloads: row.npmTotalDownloads,
			updatedAt: row.npmUpdatedAt?.getTime(),
		},
		delta:
			row.githubDeltaStarCount !== null ||
			row.githubDeltaContributorCount !== null ||
			row.githubDeltaDependentCount !== null ||
			row.githubDeltaForkCount !== null
				? {
						github: {
							contributorCount: row.githubDeltaContributorCount ?? undefined,
							dependentCount: row.githubDeltaDependentCount ?? undefined,
							forkCount: row.githubDeltaForkCount ?? undefined,
							starCount: row.githubDeltaStarCount ?? undefined,
						},
					}
				: undefined,
		timeDelta: row.timeDeltaMs ?? undefined,
	};
}

export async function getCachedOssStats(
	scopeType: OssStatsScopeType,
	scopeKey: string,
): Promise<OSSStatsWithDelta | null> {
	try {
		const row = await db.query.ossStatsCache.findFirst({
			where: and(eq(ossStatsCache.scopeType, scopeType), eq(ossStatsCache.scopeKey, scopeKey)),
		});

		return row ? mapOssStatsRow(row) : null;
	} catch (error) {
		console.error(`[OSS Stats Cache] Error reading ${scopeType}:${scopeKey}:`, error);
		return null;
	}
}

export async function upsertOssStatsCacheRow({
	github,
	previousGithub,
	githubUpdatedAt,
	npm,
	npmPackageCount,
	npmUpdatedAt,
	scopeKey,
	scopeType,
	timeDelta,
}: OssStatsRowInput): Promise<void> {
	const now = new Date();

	await db
		.insert(ossStatsCache)
		.values({
			scopeType,
			scopeKey,
			githubStarCount: github.starCount,
			githubContributorCount: github.contributorCount,
			githubDependentCount: github.dependentCount ?? null,
			githubForkCount: github.forkCount ?? null,
			githubRepositoryCount: github.repositoryCount ?? null,
			...calculateGithubDelta(github, previousGithub ?? null),
			githubUpdatedAt: githubUpdatedAt ?? now,
			npmTotalDownloads: npm.totalDownloads,
			npmRatePerDay: npm.ratePerDay ?? null,
			npmPackageCount: npmPackageCount ?? 0,
			npmUpdatedAt: npmUpdatedAt ?? now,
			timeDeltaMs: timeDelta ?? null,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [ossStatsCache.scopeType, ossStatsCache.scopeKey],
			set: {
				githubStarCount: github.starCount,
				githubContributorCount: github.contributorCount,
				githubDependentCount: github.dependentCount ?? null,
				githubForkCount: github.forkCount ?? null,
				githubRepositoryCount: github.repositoryCount ?? null,
				...calculateGithubDelta(github, previousGithub ?? null),
				githubUpdatedAt: githubUpdatedAt ?? now,
				npmTotalDownloads: npm.totalDownloads,
				npmRatePerDay: npm.ratePerDay ?? null,
				npmPackageCount: npmPackageCount ?? 0,
				npmUpdatedAt: npmUpdatedAt ?? now,
				timeDeltaMs: timeDelta ?? null,
				updatedAt: now,
			},
		});
}

function getExistingOssNpmStats(row: OssStatsCache | undefined) {
	return {
		npm: {
			totalDownloads: row?.npmTotalDownloads ?? 0,
			ratePerDay: row?.npmRatePerDay ?? undefined,
			updatedAt: row?.npmUpdatedAt?.getTime(),
		} satisfies NpmStats,
		packageCount: row?.npmPackageCount ?? 0,
		updatedAt: row?.npmUpdatedAt,
	};
}

function getOrgNpmStatsFromSummary(
	summary: HomepageNpmStatsSummary | null,
	existing: OssStatsCache | undefined,
) {
	if (!summary) {
		return getExistingOssNpmStats(existing);
	}

	return {
		npm: {
			totalDownloads: summary.totalDownloads,
			ratePerDay: summary.weeklyRatePerDay,
			updatedAt: summary.updatedAt,
		},
		packageCount: summary.totalPackageCount,
		updatedAt: new Date(summary.updatedAt),
	};
}

function getLibraryNpmStatsFromSummary({
	existing,
	libraryId,
	summary,
}: {
	existing: OssStatsCache | undefined;
	libraryId: string;
	summary: HomepageNpmStatsSummary | null;
}) {
	const librarySummary = summary?.librarySummaries.find((item) => item.libraryId === libraryId);

	if (!librarySummary) {
		return getExistingOssNpmStats(existing);
	}

	return {
		npm: {
			totalDownloads: librarySummary.totalDownloads,
			updatedAt: librarySummary.updatedAt,
		},
		packageCount: librarySummary.packageCount,
		updatedAt: new Date(librarySummary.updatedAt),
	};
}

function getOssScopeCacheKey(scopeType: string, scopeKey: string) {
	return `${scopeType}:${scopeKey}`;
}

export async function rebuildOssStatsCache(org: string = 'tanstack') {
	const now = new Date();
	const { libraries } = await import('~/libraries');
	const { getHomepageNpmStatsSummary } = await import('./homepage-npm-stats.server');

	const [githubCacheRows, ossCacheRows, npmSummary] = await Promise.all([
		db.query.githubStatsCache.findMany(),
		db.query.ossStatsCache.findMany(),
		getHomepageNpmStatsSummary(),
	]);

	const githubCacheEntries: Array<[string, (typeof githubCacheRows)[number]]> = githubCacheRows.map(
		(row) => [row.cacheKey, row],
	);
	const ossCacheEntries: Array<[string, OssStatsCache]> = ossCacheRows.map((row) => [
		getOssScopeCacheKey(row.scopeType, row.scopeKey),
		row,
	]);
	const githubCacheMap = new Map(githubCacheEntries);
	const ossCacheMap = new Map(ossCacheEntries);

	const orgGithubRow = githubCacheMap.get(`org:${org}`);
	const orgGithubStats = getGitHubStats(orgGithubRow?.stats);
	const orgPreviousGithubStats = orgGithubRow?.previousStats
		? getGitHubStats(orgGithubRow.previousStats)
		: null;
	const orgTimeDelta = orgGithubRow?.updatedAt
		? orgGithubRow.updatedAt.getTime() - orgGithubRow.createdAt.getTime()
		: undefined;
	const orgNpmStats = getOrgNpmStatsFromSummary(
		npmSummary,
		ossCacheMap.get(getOssScopeCacheKey('org', org)),
	);

	await upsertOssStatsCacheRow({
		github: orgGithubStats,
		previousGithub: orgPreviousGithubStats,
		githubUpdatedAt: orgGithubRow?.updatedAt ?? now,
		npm: orgNpmStats.npm,
		npmPackageCount: orgNpmStats.packageCount,
		npmUpdatedAt: orgNpmStats.updatedAt ?? now,
		scopeKey: org,
		scopeType: 'org',
		timeDelta: orgTimeDelta,
	});

	for (const library of libraries) {
		const githubRow = githubCacheMap.get(library.repo);
		const githubStats = getGitHubStats(githubRow?.stats);
		const previousGithubStats = githubRow?.previousStats
			? getGitHubStats(githubRow.previousStats)
			: null;
		const timeDelta = githubRow?.updatedAt
			? githubRow.updatedAt.getTime() - githubRow.createdAt.getTime()
			: undefined;
		const libraryNpmStats = getLibraryNpmStatsFromSummary({
			existing: ossCacheMap.get(getOssScopeCacheKey('library', library.id)),
			libraryId: library.id,
			summary: npmSummary,
		});

		await upsertOssStatsCacheRow({
			github: githubStats,
			previousGithub: previousGithubStats,
			githubUpdatedAt: githubRow?.updatedAt ?? now,
			npm: libraryNpmStats.npm,
			npmPackageCount: libraryNpmStats.packageCount,
			npmUpdatedAt: libraryNpmStats.updatedAt ?? now,
			scopeKey: library.id,
			scopeType: 'library',
			timeDelta,
		});
	}
}

/**
 * Get cached GitHub stats if available and not expired
 */
export async function getCachedGitHubStats(cacheKey: string): Promise<{
	stats: GitHubStats;
	previousStats: GitHubStats | null;
	timeDeltaMs: number;
} | null> {
	try {
		const cached = await db.query.githubStatsCache.findFirst({
			where: eq(githubStatsCache.cacheKey, cacheKey),
		});

		if (cached && cached.expiresAt > new Date()) {
			const stats = cached.stats as GitHubStats;
			const previousStats = cached.previousStats ? (cached.previousStats as GitHubStats) : null;

			// Calculate time delta from updatedAt and previousUpdatedAt
			let timeDeltaMs = 60 * 60 * 1000; // Default 1 hour
			if (previousStats && cached.updatedAt) {
				// If we have previous stats, calculate time delta
				// We'll use the time between updates as an approximation
				timeDeltaMs = cached.updatedAt.getTime() - cached.createdAt.getTime();
			}

			return {
				stats,
				previousStats,
				timeDeltaMs,
			};
		}

		return null;
	} catch (error) {
		console.error('[GitHub Stats Cache] Error reading cache:', error);
		return null;
	}
}

/**
 * Get expired GitHub stats cache if available (for fallback when cache is expired)
 */
export async function getExpiredGitHubStats(cacheKey: string): Promise<{
	stats: GitHubStats;
	previousStats: GitHubStats | null;
	timeDeltaMs: number;
} | null> {
	try {
		const cached = await db.query.githubStatsCache.findFirst({
			where: eq(githubStatsCache.cacheKey, cacheKey),
		});

		if (cached) {
			const stats = cached.stats as GitHubStats;
			const previousStats = cached.previousStats ? (cached.previousStats as GitHubStats) : null;

			// Calculate time delta from updatedAt and previousUpdatedAt
			let timeDeltaMs = 60 * 60 * 1000; // Default 1 hour
			if (previousStats && cached.updatedAt) {
				timeDeltaMs = cached.updatedAt.getTime() - cached.createdAt.getTime();
			}

			return {
				stats,
				previousStats,
				timeDeltaMs,
			};
		}

		return null;
	} catch (error) {
		console.error('[GitHub Stats Cache] Error reading expired cache:', error);
		return null;
	}
}

/**
 * Store GitHub stats in cache, preserving previous stats for rate calculation
 */
export async function setCachedGitHubStats(
	cacheKey: string,
	stats: GitHubStats,
	ttlHours: number = 24,
): Promise<void> {
	try {
		const expiresAt = new Date();
		expiresAt.setHours(expiresAt.getHours() + ttlHours);
		const now = new Date();

		console.log(
			`[GitHub Stats Cache] Attempting to save cache for ${cacheKey} with stats:`,
			JSON.stringify(stats, null, 2),
		);

		const existing = await db.query.githubStatsCache.findFirst({
			where: eq(githubStatsCache.cacheKey, cacheKey),
		});

		const existingStats = getGitHubStats(existing?.stats);
		const previousStats = existing?.previousStats ? getGitHubStats(existing.previousStats) : null;
		const mergedStats: GitHubStats = {
			starCount: stats.starCount,
			contributorCount: 0,
			dependentCount: 0,
			forkCount: stats.forkCount ?? existingStats.forkCount ?? previousStats?.forkCount,
			repositoryCount:
				stats.repositoryCount ?? existingStats.repositoryCount ?? previousStats?.repositoryCount,
		};

		if (existing) {
			// Move current stats to previous, store new stats as current
			await db
				.update(githubStatsCache)
				.set({
					previousStats: existing.stats,
					stats: mergedStats,
					expiresAt,
					updatedAt: now,
				})
				.where(eq(githubStatsCache.cacheKey, cacheKey));
			console.log(
				`[GitHub Stats Cache] ✓ Updated cache for ${cacheKey} (expires at ${expiresAt.toISOString()})`,
			);
		} else {
			// First time - no previous stats yet
			await db.insert(githubStatsCache).values({
				cacheKey,
				stats: mergedStats,
				previousStats: null,
				expiresAt,
			});
			console.log(
				`[GitHub Stats Cache] ✓ Created cache for ${cacheKey} (expires at ${expiresAt.toISOString()})`,
			);
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorStack = error instanceof Error ? error.stack : undefined;
		console.error(`[GitHub Stats Cache] ✗ Error writing cache for ${cacheKey}:`, errorMessage);
		if (errorStack) {
			console.error(`[GitHub Stats Cache] Stack trace:`, errorStack);
		}
		// Re-throw the error so the caller knows it failed
		// This allows the refresh function to track failures properly
		throw error;
	}
}

/**
 * NPM Download Chunks Cache
 * These functions cache historical date range downloads to avoid repeated API calls
 * and rate limiting. Chunks that are completely in the past are immutable and cached forever.
 */

export interface NpmDownloadChunkData {
	packageName: string;
	dateFrom: string; // YYYY-MM-DD
	dateTo: string; // YYYY-MM-DD
	binSize: string; // 'daily', 'weekly', 'monthly'
	totalDownloads: number;
	dailyData: Array<{ day: string; downloads: number }>;
	isImmutable: boolean;
}

function isNpmDailyDownloadPoint(value: unknown): value is { day: string; downloads: number } {
	return (
		!!value &&
		typeof value === 'object' &&
		typeof Reflect.get(value, 'day') === 'string' &&
		typeof Reflect.get(value, 'downloads') === 'number'
	);
}

function getNpmDailyDownloadData(value: unknown) {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(isNpmDailyDownloadPoint);
}

/**
 * Get the freshest cached daily chunks that cover a date window.
 *
 * Recent landing-page stats should be derived from cached daily data instead
 * of requiring an exact rolling range row, since the cache may store broader
 * windows like month-to-date or year-to-date.
 */
export async function getLatestNpmDownloadChunksCoveringRange({
	dateFrom,
	dateTo,
	packageNames,
}: {
	dateFrom: string;
	dateTo: string;
	packageNames: Array<string>;
}): Promise<Map<string, NpmDownloadChunkData>> {
	const results = new Map<string, NpmDownloadChunkData>();

	if (packageNames.length === 0) {
		return results;
	}

	try {
		const rows = await db
			.select()
			.from(npmDownloadChunks)
			.where(
				and(
					inArray(npmDownloadChunks.packageName, packageNames),
					eq(npmDownloadChunks.binSize, 'daily'),
					lte(npmDownloadChunks.dateFrom, dateFrom),
					gte(npmDownloadChunks.dateTo, dateTo),
				),
			)
			.orderBy(desc(npmDownloadChunks.dateTo), desc(npmDownloadChunks.updatedAt));

		for (const row of rows) {
			if (results.has(row.packageName)) {
				continue;
			}

			results.set(row.packageName, {
				packageName: row.packageName,
				dateFrom: row.dateFrom,
				dateTo: row.dateTo,
				binSize: row.binSize,
				totalDownloads: row.totalDownloads,
				dailyData: getNpmDailyDownloadData(row.dailyData),
				isImmutable: row.isImmutable,
			});
		}

		return results;
	} catch (error) {
		console.error('[NPM Download Chunks] Error reading latest ranges:', error);
		return results;
	}
}

/**
 * Batch fetch multiple npm download chunks in a single query
 * Much more efficient than calling getCachedNpmDownloadChunk individually
 * Returns a map of cache key -> chunk data
 */
export async function getBatchNpmDownloadChunks(
	requests: Array<{
		packageName: string;
		dateFrom: string;
		dateTo: string;
		binSize: string;
	}>,
): Promise<Map<string, NpmDownloadChunkData & { updatedAt?: string; createdAt?: string }>> {
	const results = new Map<
		string,
		NpmDownloadChunkData & { updatedAt?: string; createdAt?: string }
	>();

	if (requests.length === 0) {
		return results;
	}

	try {
		const { or } = await import('drizzle-orm');

		// Build a complex OR condition that matches all requested chunks
		const conditions = requests.map((req) =>
			and(
				eq(npmDownloadChunks.packageName, req.packageName),
				eq(npmDownloadChunks.dateFrom, req.dateFrom),
				eq(npmDownloadChunks.dateTo, req.dateTo),
				eq(npmDownloadChunks.binSize, req.binSize),
			),
		);

		// Single query to fetch all chunks at once
		const cached = await db.query.npmDownloadChunks.findMany({
			where: or(...conditions),
		});

		// Process all cached results
		for (const chunk of cached) {
			// Check if chunk is expired (only for mutable chunks)
			const isValid = chunk.isImmutable || (chunk.expiresAt && chunk.expiresAt > new Date());

			if (isValid || !chunk.expiresAt) {
				// Include even expired chunks if they have data (can be used as fallback)
				const cacheKey = `${chunk.packageName}|${chunk.dateFrom}|${chunk.dateTo}|${chunk.binSize}`;
				results.set(cacheKey, {
					packageName: chunk.packageName,
					dateFrom: chunk.dateFrom,
					dateTo: chunk.dateTo,
					binSize: chunk.binSize,
					totalDownloads: chunk.totalDownloads,
					dailyData: getNpmDailyDownloadData(chunk.dailyData),
					isImmutable: chunk.isImmutable,
					updatedAt: chunk.updatedAt?.toISOString(),
					createdAt: chunk.createdAt?.toISOString(),
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[NPM Download Chunks] Error reading batch cache:', error);
		return results;
	}
}

/**
 * Get the newest cached chunks that start at the requested range start and end
 * on or before the requested range end.
 *
 * This is only a fallback for transient upstream fetch failures. It lets the
 * stats page keep using yesterday's current-year chunk instead of dropping a
 * series to zero when today's exact cache key has not been written yet.
 */
export async function getLatestNpmDownloadChunksBeforeRangeEnd(
	requests: Array<{
		packageName: string;
		dateFrom: string;
		dateTo: string;
		binSize: string;
	}>,
): Promise<Map<string, NpmDownloadChunkData & { updatedAt?: string; createdAt?: string }>> {
	const results = new Map<
		string,
		NpmDownloadChunkData & { updatedAt?: string; createdAt?: string }
	>();

	if (requests.length === 0) {
		return results;
	}

	try {
		const { or } = await import('drizzle-orm');

		const conditions = requests.map((req) =>
			and(
				eq(npmDownloadChunks.packageName, req.packageName),
				eq(npmDownloadChunks.dateFrom, req.dateFrom),
				lte(npmDownloadChunks.dateTo, req.dateTo),
				eq(npmDownloadChunks.binSize, req.binSize),
			),
		);

		const cached = await db.query.npmDownloadChunks.findMany({
			where: or(...conditions),
			orderBy: [desc(npmDownloadChunks.dateTo), desc(npmDownloadChunks.updatedAt)],
		});

		for (const chunk of cached) {
			for (const req of requests) {
				const cacheKey = `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`;

				if (results.has(cacheKey)) {
					continue;
				}

				if (
					chunk.packageName !== req.packageName ||
					chunk.dateFrom !== req.dateFrom ||
					chunk.dateTo > req.dateTo ||
					chunk.binSize !== req.binSize
				) {
					continue;
				}

				results.set(cacheKey, {
					packageName: chunk.packageName,
					dateFrom: chunk.dateFrom,
					dateTo: chunk.dateTo,
					binSize: chunk.binSize,
					totalDownloads: chunk.totalDownloads,
					dailyData: getNpmDailyDownloadData(chunk.dailyData),
					isImmutable: chunk.isImmutable,
					updatedAt: chunk.updatedAt?.toISOString(),
					createdAt: chunk.createdAt?.toISOString(),
				});
			}
		}

		return results;
	} catch (error) {
		console.error('[NPM Download Chunks] Error reading fallback ranges:', error);
		return results;
	}
}

/**
 * Get a cached npm download chunk if available
 * Returns the chunk data if found and not expired (for mutable chunks)
 * Immutable chunks (isImmutable=true) never expire
 */
export async function getCachedNpmDownloadChunk(
	packageName: string,
	dateFrom: string,
	dateTo: string,
	binSize: string = 'daily',
): Promise<NpmDownloadChunkData | null> {
	try {
		const cached = await db.query.npmDownloadChunks.findFirst({
			where: and(
				eq(npmDownloadChunks.packageName, packageName),
				eq(npmDownloadChunks.dateFrom, dateFrom),
				eq(npmDownloadChunks.dateTo, dateTo),
				eq(npmDownloadChunks.binSize, binSize),
			),
		});

		if (!cached) {
			return null;
		}

		// Immutable chunks never expire
		if (cached.isImmutable) {
			return {
				packageName: cached.packageName,
				dateFrom: cached.dateFrom,
				dateTo: cached.dateTo,
				binSize: cached.binSize,
				totalDownloads: cached.totalDownloads,
				dailyData: getNpmDailyDownloadData(cached.dailyData),
				isImmutable: cached.isImmutable,
			};
		}

		// Mutable chunks (recent data) - check expiration
		if (cached.expiresAt && cached.expiresAt > new Date()) {
			return {
				packageName: cached.packageName,
				dateFrom: cached.dateFrom,
				dateTo: cached.dateTo,
				binSize: cached.binSize,
				totalDownloads: cached.totalDownloads,
				dailyData: getNpmDailyDownloadData(cached.dailyData),
				isImmutable: cached.isImmutable,
			};
		}

		// Expired - return null so it gets refetched
		return null;
	} catch (error) {
		console.error(
			`[NPM Download Chunks] Error reading cache for ${packageName} ${dateFrom}:${dateTo}:`,
			error,
		);
		return null;
	}
}

/**
 * Store an npm download chunk in the cache
 * Chunks are marked as immutable if they end before today
 * Immutable chunks never expire, mutable chunks expire in 6 hours
 */
export async function setCachedNpmDownloadChunk(data: NpmDownloadChunkData): Promise<void> {
	try {
		const now = new Date();
		const today = now.toISOString().split('T')[0];

		// Determine if chunk is immutable (completely in the past)
		const isImmutable = data.dateTo < today;

		// Set expiration: null for immutable, 6 hours for mutable
		const expiresAt = isImmutable ? null : new Date(now.getTime() + 6 * 60 * 60 * 1000);

		// Check if chunk already exists
		const existing = await db.query.npmDownloadChunks.findFirst({
			where: and(
				eq(npmDownloadChunks.packageName, data.packageName),
				eq(npmDownloadChunks.dateFrom, data.dateFrom),
				eq(npmDownloadChunks.dateTo, data.dateTo),
				eq(npmDownloadChunks.binSize, data.binSize),
			),
		});

		if (existing) {
			// Update existing chunk
			await db
				.update(npmDownloadChunks)
				.set({
					totalDownloads: data.totalDownloads,
					dailyData: data.dailyData,
					isImmutable,
					expiresAt,
					updatedAt: now,
				})
				.where(eq(npmDownloadChunks.id, existing.id));

			console.log(
				`[NPM Download Chunks] ✓ Updated ${data.packageName} ${data.dateFrom}:${data.dateTo} (${data.totalDownloads.toLocaleString()} downloads, ${isImmutable ? 'immutable' : 'expires ' + expiresAt?.toISOString()})`,
			);
		} else {
			// Insert new chunk
			await db.insert(npmDownloadChunks).values({
				packageName: data.packageName,
				dateFrom: data.dateFrom,
				dateTo: data.dateTo,
				binSize: data.binSize,
				totalDownloads: data.totalDownloads,
				dailyData: data.dailyData,
				isImmutable,
				expiresAt,
			});

			console.log(
				`[NPM Download Chunks] ✓ Cached ${data.packageName} ${data.dateFrom}:${data.dateTo} (${data.totalDownloads.toLocaleString()} downloads, ${isImmutable ? 'immutable' : 'expires ' + expiresAt?.toISOString()})`,
			);
		}
	} catch (error) {
		console.error(
			`[NPM Download Chunks] ✗ Error caching ${data.packageName} ${data.dateFrom}:${data.dateTo}:`,
			error,
		);
		// Don't throw - caching is best-effort
	}
}

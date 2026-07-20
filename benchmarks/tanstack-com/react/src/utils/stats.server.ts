import { setResponseHeaders } from '@tanstack/react-start/server';

// Re-export pure functions for use in server functions
export { fetchGitHubOwnerStats, fetchGitHubRepoStats } from './stats.functions';

// Re-export types from shared types file
export type {
	Library,
	GitHubStats,
	NpmPackageStats,
	NpmStats,
	OSSStats,
	OSSStatsWithDelta,
	RecentDownloadStats,
	RecentDownloadStatsQueryParams,
	StatsQueryParams,
} from './stats.types';

import type {
	GitHubStats,
	NpmStats,
	RecentDownloadStats,
	RecentDownloadStatsQueryParams,
	OSSStatsWithDelta,
	StatsQueryParams,
} from './stats.types';
import { libraries } from '~/libraries';
import { fetchGitHubOwnerStats, fetchGitHubRepoStats } from './stats.functions';
import {
	applyManualNpmDownloadOutlierCorrections,
	type NpmDailyDownload,
} from './npm-download-outliers';
import { envFunctions } from './env.functions';
import {
	NPM_STATS_START_DATE,
	addUtcDays,
	getNormalizedNpmDownloadChunks,
	getNpmDailyDownloadsFromResponse,
	hasCompleteDailyCoverage,
	toIsoDayUtc,
} from './npm-download-ranges';
import { isNpmPackageName } from './schemas';
import {
	MAX_NPM_STATS_GROUPS,
	MAX_NPM_STATS_PACKAGES_PER_GROUP,
	MAX_NPM_STATS_TOTAL_PACKAGES,
} from './npm-stats-limits';

type NpmDownloadsBulkPackage = {
	hidden?: boolean;
	name: string;
};

type NpmDownloadsBulkGroup = {
	packages: Array<NpmDownloadsBulkPackage>;
};

type NpmDownloadsBulkRequest = {
	packageGroups: Array<NpmDownloadsBulkGroup>;
	startDate: string;
	endDate: string;
};

const MAX_NPM_STATS_CHUNK_FETCH_CONCURRENCY = 8;
const MAX_NPM_STATS_RANGE_DAYS = 12 * 366;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseIsoDay(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

	const date = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(date.getTime())) return null;

	return date.toISOString().substring(0, 10) === value ? date : null;
}

function parseNpmDownloadsBulkRequest(data: unknown): NpmDownloadsBulkRequest {
	if (!isRecord(data)) {
		throw new Error('Invalid npm stats request');
	}

	const rawGroups = data.packageGroups;
	const startDate = data.startDate;
	const endDate = data.endDate;

	if (
		!Array.isArray(rawGroups) ||
		rawGroups.length === 0 ||
		rawGroups.length > MAX_NPM_STATS_GROUPS ||
		typeof startDate !== 'string' ||
		typeof endDate !== 'string'
	) {
		throw new Error('Invalid npm stats request');
	}

	const parsedStart = parseIsoDay(startDate);
	const parsedEnd = parseIsoDay(endDate);
	if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) {
		throw new Error('Invalid npm stats date range');
	}

	const rangeDays = Math.ceil(
		(parsedEnd.getTime() - parsedStart.getTime()) / (24 * 60 * 60 * 1000),
	);
	if (rangeDays > MAX_NPM_STATS_RANGE_DAYS) {
		throw new Error('NPM stats date range is too large');
	}

	let totalPackages = 0;
	const packageGroups = rawGroups.map((rawGroup) => {
		if (!isRecord(rawGroup) || !Array.isArray(rawGroup.packages)) {
			throw new Error('Invalid npm stats package group');
		}

		if (
			rawGroup.packages.length === 0 ||
			rawGroup.packages.length > MAX_NPM_STATS_PACKAGES_PER_GROUP
		) {
			throw new Error('Invalid npm stats package group size');
		}

		const packages = rawGroup.packages.map((rawPackage) => {
			if (!isRecord(rawPackage) || typeof rawPackage.name !== 'string') {
				throw new Error('Invalid npm stats package');
			}

			const name = rawPackage.name.trim();
			if (!isNpmPackageName(name)) {
				throw new Error(`Invalid npm package name: ${name}`);
			}

			return {
				name,
				hidden: typeof rawPackage.hidden === 'boolean' ? rawPackage.hidden : undefined,
			};
		});

		totalPackages += packages.length;
		return { packages };
	});

	if (totalPackages > MAX_NPM_STATS_TOTAL_PACKAGES) {
		throw new Error('Too many npm packages requested');
	}

	return { packageGroups, startDate, endDate };
}

async function mapWithConcurrency<T, TResult>(
	values: Array<T>,
	concurrency: number,
	fn: (value: T) => Promise<TResult>,
) {
	const results = new Array<TResult>(values.length);
	let index = 0;

	const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (index < values.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await fn(values[currentIndex]);
		}
	});

	await Promise.all(workers);

	return results;
}

/**
 * NPM sometimes reports ecosystem-wide zero days.
 *
 * For isolated zero days after a package has active traffic, backfill with the
 * same weekday from the previous week (day - 7), with up to 4 weeks fallback
 * when consecutive anomaly weeks occur.
 */
function backfillZeroAnomalyDays(dailyDownloads: NpmDailyDownload[], today: string) {
	if (dailyDownloads.length < 8) {
		return dailyDownloads;
	}

	const sorted = [...dailyDownloads].sort((a, b) => a.day.localeCompare(b.day));
	const originalByDay = new Map(sorted.map((d) => [d.day, d.downloads] as const));
	const result = sorted.map((d) => ({ ...d }));
	const correctedByDay = new Map(result.map((d) => [d.day, d.downloads] as const));

	let seenNonZero = false;

	for (const point of result) {
		if (point.downloads > 0) {
			seenNonZero = true;
			continue;
		}

		if (!seenNonZero || point.day === today) {
			continue;
		}

		let previousWeekDownloads: number | undefined;
		for (let weeksBack = 1; weeksBack <= 4; weeksBack++) {
			const previousWeekDay = addUtcDays(point.day, -7 * weeksBack);
			const candidate = correctedByDay.get(previousWeekDay);
			if (candidate !== undefined && candidate > 0) {
				previousWeekDownloads = candidate;
				break;
			}
		}

		if (!previousWeekDownloads) {
			continue;
		}

		// Guard against filling true inactivity periods.
		const hasNearbyNonZero = [-3, -2, -1, 1, 2, 3].some((offset) => {
			const nearbyDownloads = originalByDay.get(addUtcDays(point.day, offset));
			return nearbyDownloads !== undefined && nearbyDownloads > 0;
		});

		if (!hasNearbyNonZero) {
			continue;
		}

		point.downloads = previousWeekDownloads;
		correctedByDay.set(point.day, previousWeekDownloads);
	}

	return result;
}

function normalizeNpmDownloadSeries(
	packageName: string,
	dailyDownloads: NpmDailyDownload[],
	today: string,
) {
	const zeroBackfilledDownloads = backfillZeroAnomalyDays(dailyDownloads, today);
	return applyManualNpmDownloadOutlierCorrections(packageName, zeroBackfilledDownloads);
}

/**
 * Server function to get OSS statistics
 * GitHub stats are cached separately. NPM stats prefer the small summary cache
 * and fall back to the bulk NPM stats product cache when needed.
 */
function hasAnyOSSStats(stats: OSSStatsWithDelta | null | undefined): stats is OSSStatsWithDelta {
	return !!stats && (stats.npm.totalDownloads > 0 || stats.github.starCount > 0);
}

function getLastCompletedStatsDay() {
	const today = new Date();
	const lastCompletedDay = new Date(
		Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
	);
	lastCompletedDay.setUTCDate(lastCompletedDay.getUTCDate() - 1);
	return toIsoDayUtc(lastCompletedDay);
}

function getOSSStatsPackageNames(data: StatsQueryParams) {
	if (!data.library) {
		return [
			...new Set(
				libraries.flatMap((library) => {
					if (library.npmPackageNames?.length) {
						return library.npmPackageNames;
					}

					if (library.corePackageName) {
						return [library.corePackageName];
					}

					return [`@tanstack/${library.id}`];
				}),
			),
		];
	}

	if (data.library.npmPackageNames?.length) {
		return data.library.npmPackageNames;
	}

	return [`@tanstack/${data.library.id}`];
}

function sumDailyDownloadsInRange({
	downloads,
	end,
	start,
}: {
	downloads: Array<NpmDailyDownload>;
	end: string;
	start: string;
}) {
	return downloads.reduce((total, point) => {
		if (point.day < start || point.day > end) {
			return total;
		}

		return total + point.downloads;
	}, 0);
}

async function getCachedSummaryNpmStats(data: StatsQueryParams): Promise<NpmStats | null> {
	if (data.library) {
		const { getCachedLibraryNpmStatsSummary } = await import('./homepage-npm-stats.server');
		const librarySummary = await getCachedLibraryNpmStatsSummary(data.library.id);

		return librarySummary
			? {
					totalDownloads: librarySummary.totalDownloads,
					updatedAt: librarySummary.updatedAt,
				}
			: null;
	}

	const { getHomepageNpmStatsSummary } = await import('./homepage-npm-stats.server');
	const summary = await getHomepageNpmStatsSummary();

	return summary
		? {
				totalDownloads: summary.totalDownloads,
				ratePerDay: summary.weeklyRatePerDay,
				updatedAt: summary.updatedAt,
			}
		: null;
}

async function fetchLiveNpmStats(data: StatsQueryParams): Promise<NpmStats> {
	const packageNames = getOSSStatsPackageNames(data);

	if (packageNames.length === 0) {
		return { totalDownloads: 0 };
	}

	const cachedSummaryStats = await getCachedSummaryNpmStats(data);

	if (cachedSummaryStats && cachedSummaryStats.totalDownloads > 0) {
		return cachedSummaryStats;
	}

	const endDate = getLastCompletedStatsDay();
	const statsResults = await fetchNpmDownloadsBulk({
		data: {
			packageGroups: [
				{
					packages: packageNames.map((name) => ({ name })),
				},
			],
			startDate: '2015-01-10',
			endDate,
		},
	});

	const downloads: Array<NpmDailyDownload> = statsResults.flatMap(
		(result: { packages: Array<{ downloads: Array<NpmDailyDownload> }> }) =>
			result.packages.flatMap((pkg) => pkg.downloads),
	);

	const totalDownloads = downloads.reduce((total, point) => total + point.downloads, 0);
	const weekStart = addUtcDays(endDate, -6);
	const weeklyDownloads = sumDailyDownloadsInRange({
		downloads,
		start: weekStart,
		end: endDate,
	});

	return {
		totalDownloads,
		ratePerDay: weeklyDownloads > 0 ? weeklyDownloads / 7 : undefined,
		updatedAt: Date.now(),
	};
}

async function fetchLiveGitHubStats(data: StatsQueryParams): Promise<GitHubStats> {
	if (!data.library) {
		try {
			return await fetchGitHubOwnerStats('tanstack');
		} catch (error) {
			console.warn(
				'[OSS Stats] Live GitHub org fallback failed:',
				error instanceof Error ? error.message : String(error),
			);
			return {
				starCount: 0,
				contributorCount: 0,
				dependentCount: 0,
			};
		}
	}

	if (!data.library?.repo) {
		return {
			starCount: 0,
			contributorCount: 0,
			dependentCount: 0,
		};
	}

	try {
		return await fetchGitHubRepoStats(data.library.repo);
	} catch (error) {
		console.warn(
			`[OSS Stats] Live GitHub fallback failed for ${data.library.repo}:`,
			error instanceof Error ? error.message : String(error),
		);
		return {
			starCount: 0,
			contributorCount: 0,
			dependentCount: 0,
		};
	}
}

async function fetchLiveOSSStats(data: StatsQueryParams): Promise<OSSStatsWithDelta> {
	const [github, npm] = await Promise.all([
		fetchLiveGitHubStats(data),
		fetchLiveNpmStats(data).catch((error) => {
			console.warn(
				'[OSS Stats] Live NPM fallback failed:',
				error instanceof Error ? error.message : String(error),
			);
			return { totalDownloads: 0 };
		}),
	]);

	return {
		github,
		npm,
	};
}

async function mergeCachedSummaryNpmStats(data: StatsQueryParams, stats: OSSStatsWithDelta | null) {
	const npm = await getCachedSummaryNpmStats(data);

	if (!npm) {
		return stats;
	}

	return {
		github: stats?.github ?? {
			starCount: 0,
			contributorCount: 0,
			dependentCount: 0,
		},
		npm,
		delta: stats?.delta,
		timeDelta: stats?.timeDelta,
	} satisfies OSSStatsWithDelta;
}

export async function getOSSStats({
	data,
}: {
	data: StatsQueryParams;
}): Promise<OSSStatsWithDelta> {
	const scopeType = data.library ? 'library' : 'org';
	const scopeKey = data.library?.id ?? 'tanstack';

	// Add HTTP caching headers for better performance
	// Cache for 5 minutes on CDN, allow stale content for up to 1 hour
	setResponseHeaders(
		new Headers({
			'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600, stale-if-error=3600',
			'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
		}),
	);

	let cachedStats: OSSStatsWithDelta | null = null;

	if (envFunctions.DATABASE_URL) {
		const { getCachedOssStats } = await import('./stats-db.server');
		cachedStats = await getCachedOssStats(scopeType, scopeKey);
	}

	const cachedStatsWithSummary = await mergeCachedSummaryNpmStats(data, cachedStats);

	if (hasAnyOSSStats(cachedStatsWithSummary)) {
		return cachedStatsWithSummary;
	}

	if (!data.library) {
		return cachedStatsWithSummary ?? getEmptyOSSStats();
	}

	const liveStats = await fetchLiveOSSStats(data);

	if (hasAnyOSSStats(liveStats)) {
		return liveStats;
	}

	return cachedStatsWithSummary ?? getEmptyOSSStats();
}

function getEmptyOSSStats(): OSSStatsWithDelta {
	return {
		github: {
			starCount: 0,
			contributorCount: 0,
			dependentCount: 0,
		},
		npm: {
			totalDownloads: 0,
		},
	};
}

/**
 * Fetch NPM download data for multiple packages in bulk
 * Optimized to handle all packages in a single request with batch cache lookup
 * and parallel NPM API fetching. Current year data is cached daily.
 */
export async function fetchNpmDownloadsBulkData({ data }: { data: unknown }) {
	const { packageGroups, startDate, endDate } = parseNpmDownloadsBulkRequest(data);

	// Import cache functions
	const {
		getBatchNpmDownloadChunks,
		getLatestNpmDownloadChunksBeforeRangeEnd,
		setCachedNpmDownloadChunk,
	} = await import('./npm-download-cache.server');

	const today = new Date().toISOString().substring(0, 10);
	const currentYear = new Date().getFullYear().toString();

	// Collect all unique package/year combinations needed
	interface ChunkRequest {
		packageName: string;
		year: string;
		startDate: string;
		endDate: string;
		isCurrentYear: boolean;
	}

	type DownloadChunk = {
		packageName: string;
		dateFrom: string;
		dateTo: string;
		binSize: string;
		dailyData: Array<NpmDailyDownload>;
		totalDownloads: number;
		isImmutable: boolean;
		updatedAt?: string;
	};

	function getChunkCacheKey(req: ChunkRequest) {
		return `${req.packageName}|${req.startDate}|${req.endDate}|daily`;
	}

	const chunkRequests: ChunkRequest[] = [];

	for (const group of packageGroups) {
		for (const pkg of group.packages) {
			for (const chunk of getNormalizedNpmDownloadChunks({
				startDate,
				endDate,
				today,
			})) {
				const yearStr = new Date(`${chunk.from}T00:00:00.000Z`).getUTCFullYear().toString();
				chunkRequests.push({
					packageName: pkg.name,
					year: yearStr,
					startDate: chunk.from,
					endDate: chunk.to,
					isCurrentYear: yearStr === currentYear,
				});
			}
		}
	}

	// Batch fetch all chunks from cache
	const cachedChunks = await getBatchNpmDownloadChunks(
		chunkRequests.map((req) => ({
			packageName: req.packageName,
			dateFrom: req.startDate,
			dateTo: req.endDate,
			binSize: 'daily',
		})),
	);

	// Identify chunks that need to be fetched from NPM API
	const chunksToFetch: ChunkRequest[] = [];
	const resultChunks = new Map<string, DownloadChunk>();

	for (const req of chunkRequests) {
		const cacheKey = `${req.packageName}|${req.startDate}|${req.endDate}|daily`;
		const cached = cachedChunks.get(cacheKey);

		if (cached) {
			// For current year, check if cache is from today
			if (req.isCurrentYear && !cached.isImmutable) {
				// Check if the cache was updated today
				const cacheDate = new Date(cached.updatedAt || 0).toISOString().substring(0, 10);
				if (cacheDate === today) {
					// Cache is from today, use it
					resultChunks.set(cacheKey, cached);
					continue;
				}
				// Cache is stale, need to refetch
				chunksToFetch.push(req);
			} else {
				// Immutable historical data, always use cache
				resultChunks.set(cacheKey, cached);
			}
		} else {
			// Not in cache, need to fetch
			chunksToFetch.push(req);
		}
	}

	// Fetch missing chunks from NPM API in parallel
	if (chunksToFetch.length > 0) {
		const fallbackChunks = await getLatestNpmDownloadChunksBeforeRangeEnd(
			chunksToFetch.map((req) => ({
				packageName: req.packageName,
				dateFrom: req.startDate,
				dateTo: req.endDate,
				binSize: 'daily',
			})),
		);

		const fetchedResults = await mapWithConcurrency(
			chunksToFetch,
			MAX_NPM_STATS_CHUNK_FETCH_CONCURRENCY,
			async (req) => {
				const cacheKey = getChunkCacheKey(req);
				const fallbackChunk = fallbackChunks.get(cacheKey);

				try {
					const response = await fetch(
						`https://api.npmjs.org/downloads/range/${req.startDate}:${req.endDate}/${encodeURIComponent(req.packageName)}`,
						{
							headers: {
								Accept: 'application/json',
								'User-Agent': 'TanStack-Stats',
							},
						},
					);

					if (!response.ok) {
						if (response.status === 404) {
							if (fallbackChunk) {
								return {
									key: cacheKey,
									data: fallbackChunk,
								};
							}

							return {
								key: cacheKey,
								data: {
									packageName: req.packageName,
									dateFrom: req.startDate,
									dateTo: req.endDate,
									binSize: 'daily',
									dailyData: [],
									totalDownloads: 0,
									isImmutable: !req.isCurrentYear,
								},
							};
						}
						throw new Error(`NPM API error: ${response.status}`);
					}

					const result = await response.json();
					const downloads = getNpmDailyDownloadsFromResponse(result);

					if (!hasCompleteDailyCoverage(downloads, req.startDate, req.endDate)) {
						throw new Error(
							`NPM API returned incomplete range ${downloads[0]?.day ?? 'empty'}:${downloads.at(-1)?.day ?? 'empty'} for ${req.startDate}:${req.endDate}`,
						);
					}

					const chunkData = {
						packageName: req.packageName,
						dateFrom: req.startDate,
						dateTo: req.endDate,
						binSize: 'daily',
						totalDownloads: downloads.reduce((sum, point) => sum + point.downloads, 0),
						dailyData: downloads,
						isImmutable: !req.isCurrentYear,
					};

					await setCachedNpmDownloadChunk(chunkData);

					return {
						key: cacheKey,
						data: chunkData,
					};
				} catch (error) {
					console.error(`Failed to fetch ${req.packageName} ${req.year}:`, error);

					if (fallbackChunk) {
						console.warn(
							`[NPM Download Chunks] Using fallback ${fallbackChunk.dateFrom}:${fallbackChunk.dateTo} for ${req.packageName} ${req.startDate}:${req.endDate}`,
						);
						return {
							key: cacheKey,
							data: fallbackChunk,
						};
					}

					// Return empty data on error
					return {
						key: cacheKey,
						data: {
							packageName: req.packageName,
							dateFrom: req.startDate,
							dateTo: req.endDate,
							binSize: 'daily',
							dailyData: [],
							totalDownloads: 0,
							isImmutable: !req.isCurrentYear,
						},
					};
				}
			},
		);
		for (const result of fetchedResults) {
			resultChunks.set(result.key, result.data);
		}
	}

	// Organize results by package group
	const results = packageGroups.map((group) => {
		const packages = group.packages.map((pkg) => {
			// Collect all chunks for this package
			const packageChunks: Array<DownloadChunk> = [];

			for (const req of chunkRequests) {
				if (req.packageName === pkg.name) {
					const cacheKey = `${req.packageName}|${req.startDate}|${req.endDate}|daily`;
					const chunk = resultChunks.get(cacheKey);
					if (chunk) {
						packageChunks.push(chunk);
					}
				}
			}

			// Combine all chunks and filter to requested date range
			const allDownloads = packageChunks
				.flatMap((chunk) => chunk.dailyData)
				.filter((d) => {
					const date = new Date(d.day);
					return date >= new Date(startDate) && date <= new Date(endDate);
				})
				.sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

			const correctedDownloads = normalizeNpmDownloadSeries(pkg.name, allDownloads, today);

			return {
				name: pkg.name,
				hidden: pkg.hidden,
				downloads: correctedDownloads,
			};
		});

		return {
			packages,
			start: startDate,
			end: endDate,
			error: null,
		};
	});

	return results;
}

export async function fetchNpmDownloadsBulk({ data }: { data: unknown }) {
	const results = await fetchNpmDownloadsBulkData({ data });

	setResponseHeaders(
		new Headers({
			'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
			'Cloudflare-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
		}),
	);

	return results;
}

/**
 * Fetch NPM download data for a package for a specific chunk
 * Uses standardized year-based chunks for maximum cache reuse
 * GET request with fixed boundaries allows CDN and browser caching
 *
 * Chunk format: YYYY (e.g., "2023" means Jan 1 - Dec 31, 2023)
 * Special chunk "current" means current year to date
 */
export async function fetchNpmDownloadChunk({ data }: { data: any }) {
	const { packageName, year } = data;

	// NPM download statistics only go back to January 10, 2015
	const today = new Date().toISOString().substring(0, 10);
	const currentYear = new Date().getFullYear().toString();

	// Determine date range for this chunk
	let startDate: string;
	let endDate: string;
	const isCurrentYear = year === 'current' || year === currentYear;

	if (year === 'current') {
		// Current year to date
		startDate = `${currentYear}-01-01`;
		endDate = today;
	} else {
		// Full year
		startDate = `${year}-01-01`;
		endDate = `${year}-12-31`;

		// Don't fetch future years
		if (parseInt(year) > parseInt(currentYear)) {
			return {
				start: startDate,
				end: endDate,
				package: packageName,
				year,
				downloads: [],
			};
		}
	}

	// Adjust start date if before npm stats started
	if (startDate < NPM_STATS_START_DATE) {
		startDate = NPM_STATS_START_DATE;
	}

	// Set aggressive cache headers for immutable historical data
	// Current year data changes daily, historical data is immutable
	const cacheMaxAge = isCurrentYear ? 3600 : 31536000; // 1 hour / 1 year
	const cdnMaxAge = isCurrentYear ? 3600 : 31536000; // 1 hour / 1 year

	setResponseHeaders(
		new Headers({
			// Keep CDN and browser TTLs separate so historical data can stay hot at
			// the edge without forcing longer browser freshness.
			'Cloudflare-CDN-Cache-Control': `public, max-age=${cdnMaxAge}${isCurrentYear ? '' : ', stale-while-revalidate=86400'}`,
			'Cache-Control': `public, max-age=${cacheMaxAge}`,
		}),
	);

	// Import cache functions
	const { getCachedNpmDownloadChunk, setCachedNpmDownloadChunk } =
		await import('./npm-download-cache.server');

	// Check R2 cache first
	let cachedChunk;
	try {
		cachedChunk = await getCachedNpmDownloadChunk(packageName, startDate, endDate, 'daily');
	} catch (error) {
		console.warn(`[NPM Download Chunk] Cache lookup error for ${packageName} ${year}:`, error);
	}

	// Use cache if available and immutable
	if (cachedChunk) {
		if (cachedChunk.isImmutable) {
			return {
				start: cachedChunk.dateFrom,
				end: cachedChunk.dateTo,
				package: packageName,
				year,
				downloads: normalizeNpmDownloadSeries(
					packageName,
					cachedChunk.dailyData,
					new Date().toISOString().substring(0, 10),
				),
			};
		}
		// For current year, check if cache is still fresh (within 1 hour)
		// If expired, fall through to fetch fresh data
	}

	// Fetch from NPM API
	try {
		const response = await fetch(
			`https://api.npmjs.org/downloads/range/${startDate}:${endDate}/${encodeURIComponent(packageName)}`,
			{
				headers: {
					Accept: 'application/json',
					'User-Agent': 'TanStack-Stats',
				},
			},
		);

		if (!response.ok) {
			if (response.status === 404) {
				// Package not found or no data for this range
				console.warn(`[NPM Download Chunk] 404 for ${packageName} ${year}`);
				return {
					start: startDate,
					end: endDate,
					package: packageName,
					year,
					downloads: [],
				};
			}
			if (response.status === 429) {
				// Rate limited - use cached data if available
				if (cachedChunk) {
					console.warn(
						`[NPM Download Chunk] Rate limited, using cached data for ${packageName} ${year}`,
					);
					return {
						start: cachedChunk.dateFrom,
						end: cachedChunk.dateTo,
						package: packageName,
						year,
						downloads: cachedChunk.dailyData,
					};
				}
				throw new Error('NPM API rate limit exceeded. Please try again in a moment.');
			}
			throw new Error(`NPM API error for ${packageName} ${year}: ${response.status}`);
		}

		const result = await response.json();
		const downloads = getNpmDailyDownloadsFromResponse(result);

		if (!hasCompleteDailyCoverage(downloads, startDate, endDate)) {
			throw new Error(
				`NPM API returned incomplete range ${downloads[0]?.day ?? 'empty'}:${downloads.at(-1)?.day ?? 'empty'} for ${startDate}:${endDate}`,
			);
		}

		// Cache this chunk
		try {
			const isImmutable = !isCurrentYear;
			await setCachedNpmDownloadChunk({
				packageName,
				dateFrom: startDate,
				dateTo: endDate,
				binSize: 'daily',
				totalDownloads: downloads.reduce((sum: number, d: any) => sum + d.downloads, 0),
				dailyData: downloads,
				isImmutable,
			});
		} catch (error) {
			console.warn(`[NPM Download Chunk] Cache write error for ${packageName} ${year}:`, error);
		}

		return {
			start: startDate,
			end: endDate,
			package: packageName,
			year,
			downloads: normalizeNpmDownloadSeries(
				packageName,
				downloads,
				new Date().toISOString().substring(0, 10),
			),
		};
	} catch (error) {
		// If fetch fails and we have cached data, use that
		if (cachedChunk) {
			console.warn(
				`[NPM Download Chunk] Fetch failed, using cached data for ${packageName} ${year}`,
			);
			return {
				start: cachedChunk.dateFrom,
				end: cachedChunk.dateTo,
				package: packageName,
				year,
				downloads: normalizeNpmDownloadSeries(
					packageName,
					cachedChunk.dailyData,
					new Date().toISOString().substring(0, 10),
				),
			};
		}
		throw error;
	}
}

/**
 * Fetch recent download statistics (daily, weekly, monthly) for a library.
 */
export async function fetchRecentDownloadStats({
	data,
}: {
	data: RecentDownloadStatsQueryParams;
}): Promise<RecentDownloadStats> {
	// Add HTTP caching headers - shorter cache for recent data
	setResponseHeaders(
		new Headers({
			'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
			'Cloudflare-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
		}),
	);

	const {
		getBatchNpmDownloadChunks,
		getLatestNpmDownloadChunksCoveringRange,
		setCachedNpmDownloadChunk,
	} = await import('./npm-download-cache.server');

	let packageNames = data.library.npmPackageNames ?? [];

	if (packageNames.length === 0) {
		packageNames = [`@tanstack/${data.library.id}`];
	}

	const today = new Date();
	const dayInMs = 24 * 60 * 60 * 1000;
	const getDayAgo = (amount: number) => toIsoDayUtc(new Date(today.getTime() - amount * dayInMs));
	const todayStr = toIsoDayUtc(today);
	const lastCompletedDay = getDayAgo(1);

	// Calculate date ranges
	const dailyStart = lastCompletedDay;
	const weeklyStart = getDayAgo(7);
	const previousWeeklyStart = getDayAgo(14);
	const previousWeeklyEnd = getDayAgo(8);
	const monthlyStart = getDayAgo(30);

	const latestCachedChunks = await getLatestNpmDownloadChunksCoveringRange({
		packageNames,
		dateFrom: monthlyStart,
		dateTo: lastCompletedDay,
	});

	if (latestCachedChunks.size > 0) {
		let dailyTotal = 0;
		let previousWeeklyTotal = 0;
		let weeklyTotal = 0;
		let monthlyTotal = 0;

		for (const chunk of latestCachedChunks.values()) {
			const normalizedDownloads = normalizeNpmDownloadSeries(
				chunk.packageName,
				chunk.dailyData,
				todayStr,
			);

			dailyTotal += sumDailyDownloadsInRange({
				downloads: normalizedDownloads,
				start: dailyStart,
				end: lastCompletedDay,
			});
			previousWeeklyTotal += sumDailyDownloadsInRange({
				downloads: normalizedDownloads,
				start: previousWeeklyStart,
				end: previousWeeklyEnd,
			});
			weeklyTotal += sumDailyDownloadsInRange({
				downloads: normalizedDownloads,
				start: weeklyStart,
				end: lastCompletedDay,
			});
			monthlyTotal += sumDailyDownloadsInRange({
				downloads: normalizedDownloads,
				start: monthlyStart,
				end: lastCompletedDay,
			});
		}

		return {
			dailyDownloads: dailyTotal,
			monthlyDownloads: monthlyTotal,
			previousWeeklyDownloads: previousWeeklyTotal,
			sparklineDownloads: [],
			updatedAt: Date.now(),
			weeklyDownloads: weeklyTotal,
		};
	}

	type RecentDownloadPeriod = 'daily' | 'monthly' | 'previousWeekly' | 'weekly';

	type RecentDownloadChunkRequest = {
		binSize: 'daily';
		dateFrom: string;
		dateTo: string;
		packageName: string;
		period: RecentDownloadPeriod;
	};

	type RecentDownloadChunk = {
		packageName: string;
		dateFrom: string;
		dateTo: string;
		binSize: string;
		dailyData: Array<NpmDailyDownload>;
		totalDownloads: number;
		isImmutable: boolean;
		updatedAt?: number | string;
	};

	// Create chunk requests for all packages and time periods
	const chunkRequests: Array<RecentDownloadChunkRequest> = [];
	for (const packageName of packageNames) {
		chunkRequests.push(
			{
				packageName,
				dateFrom: dailyStart,
				dateTo: lastCompletedDay,
				binSize: 'daily',
				period: 'daily',
			},
			{
				packageName,
				dateFrom: weeklyStart,
				dateTo: lastCompletedDay,
				binSize: 'daily',
				period: 'weekly',
			},
			{
				packageName,
				dateFrom: previousWeeklyStart,
				dateTo: previousWeeklyEnd,
				binSize: 'daily',
				period: 'previousWeekly',
			},
			{
				packageName,
				dateFrom: monthlyStart,
				dateTo: lastCompletedDay,
				binSize: 'daily',
				period: 'monthly',
			},
		);
	}

	// Try to get cached data first
	const cachedChunks = await getBatchNpmDownloadChunks(chunkRequests);
	const needsFetch: typeof chunkRequests = [];
	const results = new Map<string, RecentDownloadChunk>();

	// Check what we have in cache vs what needs fetching
	for (const req of chunkRequests) {
		const cacheKey = `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`;
		const cached = cachedChunks.get(cacheKey);

		if (cached) {
			// Check if cache is recent enough (within last hour for recent data)
			const updatedAt = cached.updatedAt ? Date.parse(cached.updatedAt) : 0;
			const isStale = !Number.isFinite(updatedAt) || Date.now() - updatedAt > 60 * 60 * 1000;

			if (!isStale) {
				results.set(cacheKey, cached);
				continue;
			}
		}

		needsFetch.push(req);
	}

	// Fetch missing/stale data from NPM API
	if (needsFetch.length > 0) {
		const fetchPromises = needsFetch.map(async (req) => {
			try {
				const response = await fetch(
					`https://api.npmjs.org/downloads/range/${req.dateFrom}:${req.dateTo}/${encodeURIComponent(req.packageName)}`,
					{
						headers: {
							Accept: 'application/json',
							'User-Agent': 'TanStack-Stats',
						},
					},
				);

				if (!response.ok) {
					if (response.status === 404) {
						// Package not found, return zero data
						return {
							key: `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`,
							data: {
								packageName: req.packageName,
								dateFrom: req.dateFrom,
								dateTo: req.dateTo,
								binSize: req.binSize,
								dailyData: [],
								totalDownloads: 0,
								isImmutable: false,
								updatedAt: Date.now(),
							},
						};
					}
					throw new Error(`NPM API error: ${response.status}`);
				}

				const result = await response.json();
				const downloads = getNpmDailyDownloadsFromResponse(result);

				if (!hasCompleteDailyCoverage(downloads, req.dateFrom, req.dateTo)) {
					throw new Error(
						`NPM API returned incomplete recent range ${downloads[0]?.day ?? 'empty'}:${downloads.at(-1)?.day ?? 'empty'} for ${req.dateFrom}:${req.dateTo}`,
					);
				}

				const chunkData = {
					packageName: req.packageName,
					dateFrom: req.dateFrom,
					dateTo: req.dateTo,
					binSize: req.binSize,
					totalDownloads: downloads.reduce((sum, point) => sum + point.downloads, 0),
					dailyData: downloads,
					isImmutable: false, // Recent data is mutable
					updatedAt: Date.now(),
				};

				await setCachedNpmDownloadChunk(chunkData);

				return {
					key: `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`,
					data: chunkData,
				};
			} catch (error) {
				console.error(`Failed to fetch recent downloads for ${req.packageName}:`, error);
				// Return zero data on error
				return {
					key: `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`,
					data: {
						packageName: req.packageName,
						dateFrom: req.dateFrom,
						dateTo: req.dateTo,
						binSize: req.binSize,
						dailyData: [],
						totalDownloads: 0,
						isImmutable: false,
						updatedAt: Date.now(),
					},
				};
			}
		});

		const fetchResults = await Promise.all(fetchPromises);
		for (const result of fetchResults) {
			results.set(result.key, result.data);
		}
	}

	// Aggregate results by time period
	let dailyTotal = 0;
	let previousWeeklyTotal = 0;
	let weeklyTotal = 0;
	let monthlyTotal = 0;

	for (const req of chunkRequests) {
		const cacheKey = `${req.packageName}|${req.dateFrom}|${req.dateTo}|${req.binSize}`;
		const chunk = results.get(cacheKey);

		if (chunk) {
			const normalizedDownloads = normalizeNpmDownloadSeries(
				req.packageName,
				chunk.dailyData,
				todayStr,
			);
			const downloads = normalizedDownloads.reduce((sum, point) => sum + point.downloads, 0);

			if (req.period === 'daily') {
				dailyTotal += downloads;
			} else if (req.period === 'previousWeekly') {
				previousWeeklyTotal += downloads;
			} else if (req.period === 'weekly') {
				weeklyTotal += downloads;
			} else if (req.period === 'monthly') {
				monthlyTotal += downloads;
			}
		}
	}

	return {
		dailyDownloads: dailyTotal,
		monthlyDownloads: monthlyTotal,
		previousWeeklyDownloads: previousWeeklyTotal,
		sparklineDownloads: [],
		updatedAt: Date.now(),
		weeklyDownloads: weeklyTotal,
	};
}

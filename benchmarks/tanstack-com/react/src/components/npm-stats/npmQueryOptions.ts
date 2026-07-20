import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { BinType, NpmQueryData, PackageGroup, TimeRange, ViewMode } from './shared';
import { fetchNpmDownloadsBulk } from '~/utils/stats-queries.functions';
import {
	formatNpmStatsDate,
	getHistoryStartDate,
	getLatestBucketWindow,
	getUtcDay,
	getUtcToday,
} from './binning';

/**
 * Shared TanStack Query options for fetching NPM download statistics.
 * Used by both the main /stats/npm page and library-specific NPM stats pages.
 */
export function npmQueryOptions({
	packageGroups,
	range,
}: {
	packageGroups: PackageGroup[];
	range: TimeRange;
	viewMode?: ViewMode;
	binType?: BinType;
	bucketOffset?: number;
}) {
	const now = getUtcToday();
	const dateWindow = {
		startDate: getHistoryStartDate(range, now),
		endDate: now,
	};

	return queryOptions({
		queryKey: [
			'npm-stats',
			packageGroups.map((pg) => ({
				packages: pg.packages.map((p) => ({ name: p.name })),
			})),
			range,
		],
		queryFn: async (): Promise<NpmQueryData> => {
			try {
				// Make a single bulk request for all packages
				const results = await fetchNpmDownloadsBulk({
					data: {
						packageGroups: packageGroups.map((pg) => ({
							packages: pg.packages.map((p) => ({
								name: p.name,
								hidden: p.hidden,
							})),
						})),
						startDate: formatNpmStatsDate(dateWindow.startDate),
						endDate: formatNpmStatsDate(dateWindow.endDate),
					},
				});

				// Process results to match the expected format
				return results.map((result: any, groupIndex: number) => {
					let actualStartDate = dateWindow.startDate;

					// Find the earliest non-zero download for this package group
					for (const pkg of result.packages) {
						const firstNonZero = pkg.downloads.find((d: any) => d.downloads > 0);
						if (firstNonZero) {
							const firstNonZeroDate = getUtcDay(new Date(firstNonZero.day));
							if (firstNonZeroDate < actualStartDate) {
								actualStartDate = firstNonZeroDate;
							}
						}
					}

					return {
						packages: result.packages.map((pkg: any) => ({
							...packageGroups[groupIndex]?.packages.find((p) => p.name === pkg.name),
							downloads: pkg.downloads,
						})),
						start: formatNpmStatsDate(actualStartDate),
						end: formatNpmStatsDate(dateWindow.endDate),
						error: result.error ?? undefined,
						actualStartDate,
					};
				});
			} catch (error) {
				console.error('Failed to fetch npm stats:', error);
				// Return error state for all package groups
				return packageGroups.map((packageGroup) => ({
					packages: packageGroup.packages.map((pkg) => ({
						...pkg,
						downloads: [],
					})),
					start: formatNpmStatsDate(dateWindow.startDate),
					end: formatNpmStatsDate(dateWindow.endDate),
					error: 'Failed to fetch package data (see console for details)',
					actualStartDate: dateWindow.startDate,
				}));
			}
		},
		placeholderData: keepPreviousData,
	});
}

export function selectLatestBucketQueryData({
	queryData,
	binType,
	bucketOffset,
	now = getUtcToday(),
}: {
	queryData: NpmQueryData | undefined;
	binType: BinType;
	bucketOffset: number;
	now?: Date;
}) {
	if (!queryData) return undefined;

	const dateWindow = getLatestBucketWindow({ binType, bucketOffset, now });
	const startTime = dateWindow.startDate.getTime();
	const endTime = dateWindow.endDate.getTime();

	return queryData.map((packageGroup) => ({
		...packageGroup,
		packages: packageGroup.packages.map((pkg) => ({
			...pkg,
			downloads: pkg.downloads.filter((download) => {
				const dayTime = getUtcDay(new Date(download.day)).getTime();
				return dayTime >= startTime && dayTime <= endTime;
			}),
		})),
		start: formatNpmStatsDate(dateWindow.startDate),
		end: formatNpmStatsDate(dateWindow.endDate),
		actualStartDate: dateWindow.startDate,
	}));
}

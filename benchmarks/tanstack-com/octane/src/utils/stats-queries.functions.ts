// Bench delta: upstream (stats-queries.functions.upstream.ts.txt) aggregates
// live npm-registry download counts and GitHub star/contributor stats. The
// benchmark serves fixed values so every flavor renders identical numbers:
//   - OSS stats: constant star/download figures (no delta, so the landing
//     stat counters render statically instead of animating from a rate).
//   - Homepage npm summary: `null`, a legitimate upstream state (cache miss)
//     that renders the designed static fallbacks deterministically.
//   - Recent downloads: a fixed 14-day sparkline.
import { createServerFn } from '@octanejs/tanstack-start';
import type {
	RecentDownloadStats,
	OSSStatsWithDelta,
	RecentDownloadStatsQueryParams,
	StatsQueryParams,
} from './stats.types';

export type { StatsQueryParams } from './stats.server';

const FIXED_UPDATED_AT = 1767225600000; // 2026-01-01T00:00:00Z

const FIXED_OSS_STATS: OSSStatsWithDelta = {
	github: {
		starCount: 42_000,
		contributorCount: 800,
		dependentCount: 500_000,
		forkCount: 3_200,
	},
	npm: {
		totalDownloads: 2_500_000_000,
		updatedAt: FIXED_UPDATED_AT,
	},
};

export const getOSSStats = createServerFn({ method: 'POST' })
	.validator((data: StatsQueryParams) => data)
	.handler(async (): Promise<OSSStatsWithDelta> => FIXED_OSS_STATS);

export const getHomepageNpmStatsSummary = createServerFn({
	method: 'GET',
}).handler(async () => null);

export const fetchNpmDownloadsBulk = createServerFn({ method: 'POST' })
	.validator(
		(data: {
			packageGroups: Array<{
				packages: Array<{
					hidden?: boolean;
					name: string;
				}>;
			}>;
			startDate: string;
			endDate: string;
		}) => data,
	)
	.handler(async () => []);

export const fetchRecentDownloadStats = createServerFn({ method: 'POST' })
	.validator((data: RecentDownloadStatsQueryParams) => data)
	.handler(async (): Promise<RecentDownloadStats> => {
		const sparklineDownloads = Array.from({ length: 14 }, (_, i) => ({
			day: `2026-01-${String(i + 1).padStart(2, '0')}`,
			downloads: 400_000 + ((i * 37) % 11) * 12_500,
		}));

		return {
			dailyDownloads: 450_000,
			weeklyDownloads: 3_100_000,
			previousWeeklyDownloads: 3_000_000,
			monthlyDownloads: 13_000_000,
			sparklineDownloads,
			updatedAt: FIXED_UPDATED_AT,
		};
	});

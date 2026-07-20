import * as React from 'react';
import { Suspense } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { BlankErrorBoundary } from '~/components/BlankErrorBoundary';
import { ossStatsQuery } from '~/queries/stats';
import { useNpmDownloadCounter } from '~/hooks/useNpmDownloadCounter';
import { fetchRecentDownloadStats } from '~/utils/stats-queries.functions';
import type { Library } from '~/libraries';

/**
 * Format a number with appropriate suffix (K, M, B)
 */
function formatNumber(num: number): string {
	if (num >= 1_000_000_000) {
		return `${(num / 1_000_000_000).toFixed(1)}B`;
	}
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1_000) {
		return `${(num / 1_000).toFixed(1)}K`;
	}
	return num.toLocaleString();
}

/**
 * Query options for recent download stats
 */
function recentDownloadsQuery(library: Library) {
	return queryOptions({
		queryKey: ['npm-recent-downloads', library.id],
		queryFn: () =>
			fetchRecentDownloadStats({
				data: {
					library: {
						id: library.id,
						repo: library.repo,
						frameworks: library.frameworks,
					},
				},
			}),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

/**
 * Animated counter component for all-time downloads
 */
function AnimatedDownloadCounter({
	npmData,
}: {
	npmData: {
		totalDownloads: number;
		ratePerDay?: number;
		updatedAt?: number;
	};
}) {
	const ref = useNpmDownloadCounter(npmData);
	const initialCount = npmData.totalDownloads ?? 0;
	return (
		<span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>
			{initialCount.toLocaleString()}
		</span>
	);
}

/**
 * Stat card component
 */
function StatCard({
	value,
	label,
	animated,
	npmData,
}: {
	value?: number;
	label: string;
	animated?: boolean;
	npmData?: {
		totalDownloads: number;
		ratePerDay?: number;
		updatedAt?: number;
	};
}) {
	return (
		<div className="flex flex-col items-center text-center">
			<div
				className="text-xl sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white"
				style={{ fontVariantNumeric: 'tabular-nums' }}
			>
				{animated && npmData ? (
					<AnimatedDownloadCounter npmData={npmData} />
				) : (
					formatNumber(value ?? 0)
				)}
			</div>
			<div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">{label}</div>
		</div>
	);
}

/**
 * Content component that fetches and displays NPM stats
 */
function NPMSummaryContent({ library }: { library: Library }) {
	// Fetch all-time stats (includes ratePerDay for animation)
	const { data: ossStats } = useSuspenseQuery(ossStatsQuery({ library }));

	// Fetch recent download stats (daily, weekly, monthly)
	const { data: recentStats } = useSuspenseQuery(recentDownloadsQuery(library));

	return (
		<div className="my-6">
			<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
				View download statistics for TanStack {library.name} packages. Compare different time
				periods and track usage trends.
			</p>

			<p className="text-xs text-gray-400 dark:text-gray-500 my-3 italic">
				*These top summary stats account for core packages, legacy package names, and all framework
				adapters.
			</p>

			<div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4 py-6">
				<StatCard label="All Time Downloads" animated npmData={ossStats.npm} />
				<StatCard value={recentStats.monthlyDownloads} label="Monthly Downloads" />
				<StatCard value={recentStats.weeklyDownloads} label="Weekly Downloads" />
				<StatCard value={recentStats.dailyDownloads} label="Daily Downloads" />
			</div>
		</div>
	);
}

/**
 * Skeleton loading state
 */
function NPMSummarySkeleton() {
	return (
		<div className="mb-6">
			<div className="h-7 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-2" />
			<div className="h-5 w-96 max-w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4" />

			<div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
				{[...Array(4)].map((_, i) => (
					<div key={i} className="flex flex-col items-center">
						<div className="h-9 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
						<div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mt-2" />
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * NPM Summary component showing all-time, monthly, weekly, and daily downloads
 * Uses Suspense for loading state and ErrorBoundary for error handling
 */
export function NPMSummary({ library }: { library: Library }) {
	return (
		<Suspense fallback={<NPMSummarySkeleton />}>
			<BlankErrorBoundary>
				<NPMSummaryContent library={library} />
			</BlankErrorBoundary>
		</Suspense>
	);
}

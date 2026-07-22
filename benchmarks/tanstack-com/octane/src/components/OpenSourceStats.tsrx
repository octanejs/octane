import { useQuery } from '@octanejs/tanstack-query';
import { Link } from '@octanejs/tanstack-router';
import { useRef } from 'octane';
import { type Library } from '~/libraries';
import { homepageNpmStatsSummaryQuery, ossStatsQuery, recentDownloadsQuery } from '~/queries/stats';
import { useNpmDownloadCounter } from '~/hooks/useNpmDownloadCounter';
import { Download, Star, TrendingUp } from '@octanejs/lucide';
import {
	tanStackTotalNpmStatsLibrary,
	tanStackTotalNpmStatsSearch,
} from '~/utils/tanstack-npm-stats';

function formatBillions(value: number) {
	return `${(value / 1000000000).toFixed(2)} Billion`;
}

function WeeklyDownloadCounter({
	ratePerDay,
	weeklyDownloads,
}: {
	ratePerDay?: number;
	weeklyDownloads: number;
}) {
	const startedAtRef = useRef(Date.now());
	const ref = useNpmDownloadCounter({
		totalDownloads: weeklyDownloads,
		ratePerDay,
		updatedAt: startedAtRef.current,
	});

	return <span
		ref={ref}
		style={{ fontVariantNumeric: 'tabular-nums' }}
	>{weeklyDownloads.toLocaleString() as string}</span>;
}

function isValidMetric(value: number | undefined | null): boolean {
	return value !== undefined && value !== null && !Number.isNaN(value) && value > 0 &&
		Number.isFinite(value);
}

function StatValue({ placeholder, children }: { placeholder: string; children?: any }) {
	return <span class="inline-grid [&>*]:col-start-1 [&>*]:row-start-1">
		<span class="invisible" aria-hidden>{placeholder as string}</span>
		<span>{children}</span>
	</span>;
}

type BaseHomeStatLinkProps = {
	children?: any;
	className: string;
	gradientClassName: string;
};

type HomeStatLinkProps =
	| (BaseHomeStatLinkProps & {
			href: string;
			search?: never;
			to?: never;
	  })
	| (BaseHomeStatLinkProps & {
			href?: never;
			search: typeof tanStackTotalNpmStatsSearch;
			to: '/stats/npm';
	  });

function HomeStatLink({
	children,
	className,
	gradientClassName,
	href,
	search,
	to,
}: HomeStatLinkProps) {
	const mergedClassName = `group min-w-0 rounded-r-md border-l-2 px-4 py-2 text-left transition-opacity ${className} ${gradientClassName}`;

	if (to) {
		return <Link to={to} search={search} className={mergedClassName}>{children}</Link>;
	}

	return <a href={href} target="_blank" rel="noreferrer" class={mergedClassName}>{children}</a>;
}

export default function OssStats({ library }: { library?: Library }) {
	const { data: stats, isLoading } = useQuery(ossStatsQuery({ library }));
	const { data: homepageNpmSummary, isLoading: isLoadingHomepageNpmSummary } = useQuery({
		...homepageNpmStatsSummaryQuery(),
		enabled: !library,
	});
	const { data: recentDownloads, isLoading: isLoadingRecentDownloads } = useQuery({
		...recentDownloadsQuery({
			library: library ?? tanStackTotalNpmStatsLibrary,
		}),
		enabled: Boolean(library),
	});

	const totalNpmStats = stats?.npm;
	const npmDownloads = library
		? totalNpmStats?.totalDownloads ?? 0
		: homepageNpmSummary?.totalDownloads ?? 0;
	const starCount = stats?.github?.starCount ?? 0;
	const weeklyDownloads = library
		? recentDownloads?.weeklyDownloads ?? 0
		: homepageNpmSummary?.weeklyDownloads ?? 0;
	const weeklyRatePerDay = library ? undefined : homepageNpmSummary?.weeklyRatePerDay;

	const hasNpmDownloads =
		!((library ? isLoading : isLoadingHomepageNpmSummary)) && isValidMetric(npmDownloads);
	const hasStarCount = !isLoading && isValidMetric(starCount);
	const hasWeeklyDownloads =
		!((library ? isLoadingRecentDownloads : isLoadingHomepageNpmSummary)) &&
			isValidMetric(weeklyDownloads);

	const hasAnyData = hasNpmDownloads || hasWeeklyDownloads || hasStarCount;

	const loading = isLoading || !stats;
	const npmLoading = library
		? isLoading || !totalNpmStats
		: isLoadingHomepageNpmSummary || !homepageNpmSummary;
	const weeklyLoading = library
		? isLoadingRecentDownloads || !recentDownloads
		: isLoadingHomepageNpmSummary || !homepageNpmSummary;

	if (!loading && !npmLoading && !weeklyLoading && !hasAnyData) {
		return null;
	}

	return <div class="mx-auto grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
		{npmLoading || hasNpmDownloads
			? <HomeStatLink
					to="/stats/npm"
					search={tanStackTotalNpmStatsSearch}
					className="border-emerald-500 hover:text-emerald-500"
					gradientClassName="bg-linear-to-r from-transparent to-emerald-500/5"
				>
					<div class="flex min-w-0 items-start gap-3">
						<Download className="mt-1 size-5 shrink-0 transition-colors duration-200" />
						<div class="min-w-0">
							<div
								class="relative text-2xl font-black leading-none tracking-tight transition-colors duration-200"
							>
								<StatValue placeholder="00.00 Billion">
									{hasNpmDownloads ? formatBillions(npmDownloads) : null}
								</StatValue>
							</div>
							<div
								class="mt-1 text-sm font-semibold italic text-zinc-500 transition-colors duration-200 dark:text-zinc-400"
							>
								NPM Downloads
							</div>
						</div>
					</div>
				</HomeStatLink>
			: null}

		{weeklyLoading || hasWeeklyDownloads
			? <HomeStatLink
					to="/stats/npm"
					search={tanStackTotalNpmStatsSearch}
					className="border-cyan-500 hover:text-cyan-500"
					gradientClassName="bg-linear-to-r from-transparent to-cyan-500/5"
				>
					<div class="flex min-w-0 items-start gap-3">
						<TrendingUp className="mt-1 size-5 shrink-0 transition-colors duration-200" />
						<div class="min-w-0">
							<div
								class="relative text-2xl font-black leading-none tracking-tight transition-colors duration-200"
							>
								<StatValue placeholder="00,000,000">
									{hasWeeklyDownloads
										? <WeeklyDownloadCounter
												ratePerDay={weeklyRatePerDay}
												weeklyDownloads={weeklyDownloads}
											/>
										: null}
								</StatValue>
							</div>
							<div
								class="mt-1 text-sm font-semibold italic text-zinc-500 transition-colors duration-200 dark:text-zinc-400"
							>
								Weekly Downloads
							</div>
						</div>
					</div>
				</HomeStatLink>
			: null}

		{loading || hasStarCount
			? <HomeStatLink
					href={library
						? `https://github.com/${library.repo}`
						: 'https://github.com/orgs/TanStack/repositories?q=sort:stars'}
					className="border-yellow-500 hover:text-yellow-500"
					gradientClassName="bg-linear-to-r from-transparent to-yellow-500/5"
				>
					<div class="flex min-w-0 items-start gap-3">
						<Star className="mt-1 size-5 shrink-0 transition-colors duration-200" />
						<div class="min-w-0">
							<div
								class="relative text-2xl font-black leading-none tracking-tight transition-colors duration-200"
							>
								<StatValue placeholder="000,000">
									{hasStarCount ? starCount.toLocaleString() : null}
								</StatValue>
							</div>
							<div
								class="mt-1 text-sm font-semibold italic text-zinc-500 transition-colors duration-200 dark:text-zinc-400"
							>
								GitHub Stars
							</div>
						</div>
					</div>
				</HomeStatLink>
			: null}
	</div>;
}

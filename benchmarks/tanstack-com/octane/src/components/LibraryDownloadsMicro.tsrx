import { useCallback, useEffect, useRef } from 'octane';
import { useQuery } from '@octanejs/tanstack-query';
import { twMerge } from 'tailwind-merge';
import type { LibrarySlim } from '~/libraries';
import { ossStatsQuery, recentDownloadsQuery } from '~/queries/stats';
import type { RecentDownloadStats } from '~/utils/stats.types';

type DownloadPeriod = 'daily' | 'monthly' | 'weekly';

type LibraryDownloadsMicroProps = {
	animateIncreaseTrend?: boolean;
	className?: string;
	label?: string;
	labelClassName?: string;
	library: LibrarySlim;
	period?: DownloadPeriod;
	showTotals?: boolean;
	valueClassName?: string;
};

type AnimatedDownloadData = {
	stats: RecentDownloadStats | undefined;
	totalDownloads: number | undefined;
	trendPerMs: number;
};

const weekInMs = 7 * 24 * 60 * 60 * 1000;
const statsRowClassName = 'grid w-64 max-w-full grid-cols-[minmax(11ch,max-content)_auto] items-baseline gap-1.5 text-sm font-bold text-zinc-600 dark:text-zinc-400';

function hasDownloads(value: number | undefined | null): value is number {
	return value !== undefined && value !== null && value > 0 && Number.isFinite(value);
}

function getRecentDownloadTotal(stats: RecentDownloadStats | undefined, period: DownloadPeriod) {
	if (!stats) {
		return undefined;
	}

	if (period === 'daily') {
		return stats.dailyDownloads;
	}

	if (period === 'weekly') {
		return stats.weeklyDownloads;
	}

	return stats.monthlyDownloads;
}

function getWeeklyIncreaseTrendPerMs(stats: RecentDownloadStats | undefined) {
	if (!stats) {
		return 0;
	}

	if (stats.weeklyDownloads <= 0 || !Number.isFinite(stats.weeklyDownloads)) {
		return 0;
	}

	const weeklyIncrease = stats.weeklyDownloads - stats.previousWeeklyDownloads;
	const positiveIncrease = Math.max(0, weeklyIncrease);

	return (stats.weeklyDownloads + positiveIncrease) / weekInMs;
}

function getAnimatedDownloadTotal({
	stats,
	totalDownloads,
	trendPerMs,
}: {
	stats: RecentDownloadStats | undefined;
	totalDownloads: number | undefined;
	trendPerMs: number;
}) {
	if (!hasDownloads(totalDownloads) || !stats || !trendPerMs) {
		return totalDownloads ?? 0;
	}

	const elapsedMs = Math.max(0, Date.now() - stats.updatedAt);
	return Math.floor(totalDownloads + elapsedMs * trendPerMs);
}

function useAnimatedDownloadValueRef({
	stats,
	totalDownloads,
	trendPerMs,
}: {
	stats: RecentDownloadStats | undefined;
	totalDownloads: number | undefined;
	trendPerMs: number;
}): (node: HTMLSpanElement | null) => void {
	const dataRef = useRef<AnimatedDownloadData>({
		stats,
		totalDownloads,
		trendPerMs,
	});
	const elementRef = useRef<HTMLSpanElement | null>(null);
	const frameRef = useRef<number | undefined>(undefined);
	const lastValueRef = useRef<number | null>(null);

	dataRef.current = {
		stats,
		totalDownloads,
		trendPerMs,
	};

	const getValue = useCallback(() => getAnimatedDownloadTotal(dataRef.current), []);

	const updateText = useCallback(() => {
		const element = elementRef.current;
		if (!element) {
			return;
		}

		const value = getValue();

		if (value === lastValueRef.current) {
			return;
		}

		lastValueRef.current = value;
		element.textContent = value.toLocaleString();
	}, [getValue]);

	const canAnimate = useCallback(() => {
		const data = dataRef.current;

		return data.trendPerMs > 0 && Number.isFinite(data.trendPerMs) && !!elementRef.current;
	}, []);

	const stopFrame = useCallback(() => {
		if (frameRef.current !== undefined) {
			window.cancelAnimationFrame(frameRef.current);
			frameRef.current = undefined;
		}
	}, []);

	const tick = useCallback(() => {
		frameRef.current = undefined;

		if (document.visibilityState === 'hidden' || !canAnimate()) {
			return;
		}

		updateText();
		frameRef.current = window.requestAnimationFrame(tick);
	}, [canAnimate, updateText]);

	const startFrame = useCallback(() => {
		if (!canAnimate() || frameRef.current !== undefined || document.visibilityState === 'hidden') {
			return;
		}

		frameRef.current = window.requestAnimationFrame(tick);
	}, [canAnimate, tick]);

	useEffect(() => {
		updateText();

		if (!canAnimate()) {
			stopFrame();
			return;
		}

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'hidden') {
				stopFrame();
				return;
			}

			updateText();
			startFrame();
		};

		const handleResume = () => {
			updateText();
			startFrame();
		};

		startFrame();
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', handleResume);
		window.addEventListener('pageshow', handleResume);

		return () => {
			stopFrame();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', handleResume);
			window.removeEventListener('pageshow', handleResume);
		};
	}, [canAnimate, startFrame, stats?.updatedAt, stopFrame, totalDownloads, trendPerMs, updateText]);

	return useCallback((node: HTMLSpanElement | null) => {
		elementRef.current = node;

		if (node) {
			updateText();
			startFrame();
			return;
		}

		stopFrame();
	}, [startFrame, stopFrame, updateText]);
}

function getWeeklyTrendDescription(stats: RecentDownloadStats | undefined) {
	if (!stats) {
		return undefined;
	}

	const weeklyIncrease = stats.weeklyDownloads - stats.previousWeeklyDownloads;

	if (weeklyIncrease <= 0 || !Number.isFinite(weeklyIncrease)) {
		return 'ticking at the current weekly download pace';
	}

	return `up ${weeklyIncrease.toLocaleString()} from the previous week`;
}

function formatStatsLabel(label: string) {
	return label.split(' ').map((word) => {
		if (word.toLowerCase() === 'github') {
			return 'GitHub';
		}

		if (word.toLowerCase() === 'npm') {
			return 'NPM';
		}

		return word.charAt(0).toUpperCase() + word.slice(1);
	}).join(' ');
}

function formatAbbreviatedNumber(value: number) {
	const units = [
		{ label: 'Billion', value: 1000000000 },
		{ label: 'Million', value: 1000000 },
		{ label: 'Thousand', value: 1000 },
	];

	const unit = units.find((candidate) => Math.abs(value) >= candidate.value);

	if (!unit) {
		return value.toLocaleString();
	}

	return `${(value / unit.value).toFixed(1)} ${unit.label}`;
}

export function LibraryDownloadsMicro({
	animateIncreaseTrend = false,
	className,
	label = 'monthly npm downloads',
	labelClassName,
	library,
	period = 'monthly',
	showTotals = false,
	valueClassName,
}: LibraryDownloadsMicroProps) {
	const { data: stats } = useQuery(recentDownloadsQuery({ library }));
	const { data: ossStats } = useQuery({
		...ossStatsQuery({ library }),
		enabled: showTotals,
	});
	const totalDownloads = getRecentDownloadTotal(stats, period);
	const trendPerMs =
		animateIncreaseTrend && period === 'weekly' ? getWeeklyIncreaseTrendPerMs(stats) : 0;
	const displayedDownloadsRef = useAnimatedDownloadValueRef({
		stats,
		totalDownloads,
		trendPerMs,
	});
	const hasNpmDownloads = hasDownloads(totalDownloads);
	const weeklyTrendDescription =
		animateIncreaseTrend && period === 'weekly' ? getWeeklyTrendDescription(stats) : undefined;
	const totalDownloadCount = ossStats?.npm?.totalDownloads;
	const starCount = ossStats?.github?.starCount;
	const formattedLabel = formatStatsLabel(label);

	const micro =
		hasNpmDownloads
			? <span
					class={twMerge(
						showTotals
							? statsRowClassName
							: 'inline-flex items-center gap-1.5 text-sm font-bold text-zinc-600 dark:text-zinc-400',
					)}
					title={weeklyTrendDescription}
				>
					<span
						class={twMerge(
							showTotals
								? 'text-left text-zinc-950 dark:text-white'
								: 'relative z-10 text-zinc-950 dark:text-white',
							valueClassName,
						)}
						ref={displayedDownloadsRef}
						style={{ fontVariantNumeric: 'tabular-nums' }}
					>
						{(totalDownloads ?? 0).toLocaleString() as string}
					</span>
					<span class={twMerge(showTotals ? 'whitespace-nowrap' : 'relative z-10', labelClassName)}>
						{formattedLabel as string}
					</span>
				</span>
			: null;

	if (!showTotals) {
		if (!micro) {
			return null;
		}

		return <span
			class={twMerge(
				showTotals ? 'inline-flex flex-col items-start gap-1.5' : undefined,
				className,
			)}
		>{micro}</span>;
	}

	const hasTotalDownloadCount = hasDownloads(totalDownloadCount);
	const hasStarCount = hasDownloads(starCount);
	const weeklyDownloadsRow =
		micro ??
			<span aria-label={label} class={statsRowClassName}>
				<span
					class={twMerge('invisible text-left text-zinc-950 dark:text-white', valueClassName)}
					style={{ fontVariantNumeric: 'tabular-nums' }}
				>
					000,000,000
				</span>
				<span class={twMerge('whitespace-nowrap', labelClassName)}>
					{formattedLabel as string}
				</span>
			</span>;

	return <span class={twMerge('inline-flex flex-col items-start gap-1.5', className)}>
		<span class={statsRowClassName}>
			<span
				class={twMerge(
					'text-left text-zinc-950 dark:text-white',
					!hasTotalDownloadCount ? 'invisible' : undefined,
				)}
				style={{ fontVariantNumeric: 'tabular-nums' }}
			>
				{(hasTotalDownloadCount
					? formatAbbreviatedNumber(totalDownloadCount)
					: '00.0 Million') as string}
			</span>
			<span>Total Downloads</span>
		</span>
		{weeklyDownloadsRow}
		<span class={statsRowClassName}>
			<span
				class={twMerge(
					'text-left text-zinc-950 dark:text-white',
					!hasStarCount ? 'invisible' : undefined,
				)}
				style={{ fontVariantNumeric: 'tabular-nums' }}
			>
				{(hasStarCount ? starCount.toLocaleString() : '0') as string}
			</span>
			<span>GitHub Stars</span>
		</span>
	</span>;
}

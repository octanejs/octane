import * as d3 from 'd3';

import type { BinType, TimeRange } from './shared';

export const NPM_STATS_START_DATE = d3.utcDay(new Date('2015-01-10'));

export const binningOptionsByType = {
	yearly: {
		label: 'Yearly',
		value: 'yearly',
		single: 'year',
		bin: d3.utcYear,
	},
	monthly: {
		label: 'Monthly',
		value: 'monthly',
		single: 'month',
		bin: d3.utcMonth,
	},
	weekly: {
		label: 'Weekly',
		value: 'weekly',
		single: 'week',
		bin: d3.utcWeek,
	},
	daily: {
		label: 'Daily',
		value: 'daily',
		single: 'day',
		bin: d3.utcDay,
	},
} as const satisfies Record<
	BinType,
	{
		label: string;
		value: BinType;
		single: string;
		bin: (date: Date) => Date;
	}
>;

export function getUtcToday() {
	const today = d3.utcDay(new Date());
	today.setHours(0, 0, 0, 0);
	return today;
}

export function getUtcDay(date: Date) {
	return d3.utcDay(date);
}

export function getHistoryStartDate(range: TimeRange, now = getUtcToday()) {
	switch (range) {
		case '7-days':
			return d3.utcDay.offset(now, -7);
		case '30-days':
			return d3.utcDay.offset(now, -30);
		case '90-days':
			return d3.utcDay.offset(now, -90);
		case '180-days':
			return d3.utcDay.offset(now, -180);
		case '365-days':
			return d3.utcDay.offset(now, -365);
		case '730-days':
			return d3.utcDay.offset(now, -730);
		case '1825-days':
			return d3.utcDay.offset(now, -1825);
		case 'all-time':
			return NPM_STATS_START_DATE;
	}
}

export function formatNpmStatsDate(date: Date) {
	return date.toISOString().split('T')[0];
}

export function getLatestBucketWindow({
	binType,
	bucketOffset,
	now = getUtcToday(),
}: {
	binType: BinType;
	bucketOffset: number;
	now?: Date;
}) {
	const binUnit = binningOptionsByType[binType].bin;
	const currentBucketStart = binUnit.floor(now);
	const clampedOffset = Math.min(bucketOffset, 0);
	const startDate = binUnit.offset(currentBucketStart, clampedOffset);
	const nextBucketStart = binUnit.offset(startDate, 1);
	const lastBucketDate = d3.utcDay.offset(nextBucketStart, -1);
	const endDate = lastBucketDate > now ? now : lastBucketDate;

	return {
		startDate,
		endDate,
		nextBucketStart,
	};
}

export function getLatestBucketOffsetBounds({
	binType,
	range,
	now = getUtcToday(),
}: {
	binType: BinType;
	range?: TimeRange;
	now?: Date;
}) {
	const binUnit = binningOptionsByType[binType].bin;
	const currentBucketStart = binUnit.floor(now);
	const rangeStartDate = range ? getHistoryStartDate(range, now) : undefined;
	const firstAvailableDate =
		rangeStartDate && rangeStartDate > NPM_STATS_START_DATE ? rangeStartDate : NPM_STATS_START_DATE;
	const firstBucketStart = binUnit.floor(firstAvailableDate);
	const minOffset = -binUnit.count(firstBucketStart, currentBucketStart);

	return {
		minOffset,
		maxOffset: 0,
	};
}

export function formatLatestBucketLabel({
	binType,
	startDate,
	endDate,
}: {
	binType: BinType;
	startDate: Date;
	endDate: Date;
}) {
	switch (binType) {
		case 'yearly':
			return startDate.toLocaleDateString('en-US', {
				timeZone: 'UTC',
				year: 'numeric',
			});
		case 'monthly':
			return startDate.toLocaleDateString('en-US', {
				timeZone: 'UTC',
				month: 'long',
				year: 'numeric',
			});
		case 'weekly':
			return `${startDate.toLocaleDateString('en-US', {
				timeZone: 'UTC',
				month: 'short',
				day: 'numeric',
			})} - ${endDate.toLocaleDateString('en-US', {
				timeZone: 'UTC',
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			})}`;
		case 'daily':
			return startDate.toLocaleDateString('en-US', {
				timeZone: 'UTC',
				month: 'long',
				day: 'numeric',
				year: 'numeric',
			});
	}
}

export function getLatestBucketOffsetOptions({
	binType,
	range,
	now = getUtcToday(),
}: {
	binType: BinType;
	range?: TimeRange;
	now?: Date;
}) {
	const bounds = getLatestBucketOffsetBounds({ binType, range, now });
	const options: Array<{ offset: number; label: string }> = [];

	for (let bucketOffset = bounds.maxOffset; bucketOffset >= bounds.minOffset; bucketOffset--) {
		const window = getLatestBucketWindow({ binType, bucketOffset, now });

		options.push({
			offset: bucketOffset,
			label: formatLatestBucketLabel({
				binType,
				startDate: window.startDate,
				endDate: window.endDate,
			}),
		});
	}

	return options;
}

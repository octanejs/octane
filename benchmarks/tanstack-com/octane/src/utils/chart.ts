import * as v from 'valibot';
import * as d3 from 'd3';

// All-time floor date for queries
export const ALL_TIME_FLOOR_DATE = new Date('2024-01-01');

// Schemas
export const timeRangeSchema = v.picklist([
	'7-days',
	'30-days',
	'90-days',
	'180-days',
	'365-days',
	'all-time',
]);

export const binTypeSchema = v.picklist(['yearly', 'monthly', 'weekly', 'daily']);

export type TimeRange = v.InferOutput<typeof timeRangeSchema>;
export type BinType = v.InferOutput<typeof binTypeSchema>;

// Time range options with metadata
export const timeRangeOptions = [
	{ value: '7-days', label: '7 Days', days: 7 },
	{ value: '30-days', label: '30 Days', days: 30 },
	{ value: '90-days', label: '90 Days', days: 90 },
	{ value: '180-days', label: '6 Months', days: 180 },
	{ value: '365-days', label: '1 Year', days: 365 },
	{ value: 'all-time', label: 'All Time', days: null },
] as const;

// Binning options with d3 interval functions
export const binningOptions = [
	{ value: 'yearly', label: 'Yearly', bin: d3.utcYear },
	{ value: 'monthly', label: 'Monthly', bin: d3.utcMonth },
	{ value: 'weekly', label: 'Weekly', bin: d3.utcWeek },
	{ value: 'daily', label: 'Daily', bin: d3.utcDay },
] as const;

// Default bin type based on time range
export const defaultBinForRange: Record<TimeRange, BinType> = {
	'7-days': 'daily',
	'30-days': 'daily',
	'90-days': 'weekly',
	'180-days': 'weekly',
	'365-days': 'weekly',
	'all-time': 'weekly',
};

// Convert time range to days count (null for all-time)
export function timeRangeToDays(range: TimeRange): number | null {
	const option = timeRangeOptions.find((r) => r.value === range);
	return option?.days ?? null;
}

// Calculate start date from time range
export function getStartDateFromRange(range: TimeRange): Date {
	const days = timeRangeToDays(range);
	if (days === null) {
		return ALL_TIME_FLOOR_DATE;
	}
	const now = new Date();
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// Get the d3 bin function for a bin type
export function getBinFunction(binType: BinType) {
	const option = binningOptions.find((b) => b.value === binType);
	return option?.bin ?? d3.utcDay;
}

// Get the start of the current (incomplete) bin period
export function getCurrentBinStart(binType: BinType): Date {
	const binFn = getBinFunction(binType);
	return binFn.floor(new Date());
}

// Bin time series data using d3 rollup
export function binTimeSeriesData(
	data: Array<{ date: string; count: number }>,
	binType: BinType,
	options?: { includeIncomplete?: boolean },
): Array<{ date: Date; count: number }> {
	if (data.length === 0) return [];

	const binFn = getBinFunction(binType);
	const includeIncomplete = options?.includeIncomplete ?? true;

	const parsed = data.map((d) => ({
		date: new Date(d.date),
		count: d.count,
	}));

	const binned = d3.rollup(
		parsed,
		(v) => d3.sum(v, (d) => d.count),
		(d) => binFn.floor(d.date),
	);

	const sorted = Array.from(binned, ([date, count]) => ({ date, count })).sort(
		(a, b) => a.date.getTime() - b.date.getTime(),
	);

	// Filter out the current incomplete bin if explicitly requested
	if (!includeIncomplete) {
		const currentBinStart = getCurrentBinStart(binType);
		return sorted.filter((d) => d.date.getTime() < currentBinStart.getTime());
	}

	return sorted;
}

// Format date for display based on bin type
export function formatDateForBin(date: Date, binType: BinType): string {
	switch (binType) {
		case 'yearly':
			return date.toLocaleDateString('en-US', { year: 'numeric' });
		case 'monthly':
			return date.toLocaleDateString('en-US', {
				month: 'short',
				year: 'numeric',
			});
		case 'weekly':
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
			});
		case 'daily':
		default:
			return date.toLocaleDateString('en-US', {
				month: 'short',
				day: 'numeric',
				year: 'numeric',
			});
	}
}

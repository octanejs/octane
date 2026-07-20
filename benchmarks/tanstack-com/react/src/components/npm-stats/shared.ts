import * as v from 'valibot';

import { packageGroupSchema } from '~/routes/stats/npm/-comparisons';
import { defaultColors } from '~/utils/npm-packages';

export type PackageGroup = v.InferOutput<typeof packageGroupSchema>;

export function getPackageGroupLabel(packageGroup: PackageGroup): string {
	return packageGroup.label?.trim() || packageGroup.packages[0]?.name || '';
}

export function hasPackageGroupLabel(packageGroup: PackageGroup): boolean {
	return !!packageGroup.label?.trim();
}

export function isPackageGroupHidden(packageGroup: PackageGroup): boolean {
	if (packageGroup.hidden !== undefined) return packageGroup.hidden;

	if (hasPackageGroupLabel(packageGroup) && !packageGroup.baseline) {
		return false;
	}

	return !!packageGroup.packages[0]?.hidden;
}

export const binTypeSchema = v.picklist(['yearly', 'monthly', 'weekly', 'daily']);
export type BinType = v.InferOutput<typeof binTypeSchema>;

export const transformModeSchema = v.picklist(['none', 'normalize-y']);
export type TransformMode = v.InferOutput<typeof transformModeSchema>;

export const showDataModeSchema = v.picklist(['all', 'complete']);
export type ShowDataMode = v.InferOutput<typeof showDataModeSchema>;

export const latestBarSortSchema = v.picklist(['name', 'value']);
export type LatestBarSort = v.InferOutput<typeof latestBarSortSchema>;

export const defaultPlaybackIntervalMs = 350;
export const maxPlaybackIntervalMs = 60000;
export const playbackIntervalMsSchema = v.pipe(
	v.number(),
	v.integer(),
	v.minValue(1),
	v.maxValue(maxPlaybackIntervalMs),
);

export const barOrientationSchema = v.picklist(['vertical', 'horizontal']);
export type BarOrientation = v.InferOutput<typeof barOrientationSchema>;

export const viewModeSchema = v.picklist(['history', 'latest']);
export type ViewMode = v.InferOutput<typeof viewModeSchema>;

export const chartTypeSchema = v.picklist([
	'line',
	'stacked',
	'stacked-area',
	'stacked-stream',
	'bar',
	'horizontal-bar',
	'stacked-bar',
]);
export type ChartType = v.InferOutput<typeof chartTypeSchema>;

export type TimeRange =
	| '7-days'
	| '30-days'
	| '90-days'
	| '180-days'
	| '365-days'
	| '730-days'
	| '1825-days'
	| 'all-time';

export type NpmQueryData = Array<{
	packages: Array<{
		name?: string;
		hidden?: boolean;
		downloads: Array<{ day: string; downloads: number }>;
	}>;
	start: string;
	end: string;
	error?: string;
	actualStartDate?: Date;
}>;

export const binningOptions = [
	{
		label: 'Yearly',
		value: 'yearly',
		single: 'year',
	},
	{
		label: 'Monthly',
		value: 'monthly',
		single: 'month',
	},
	{
		label: 'Weekly',
		value: 'weekly',
		single: 'week',
	},
	{
		label: 'Daily',
		value: 'daily',
		single: 'day',
	},
] as const;

export const historyChartTypes = [
	{ label: 'Line', value: 'line' },
	{ label: 'Stacked', value: 'stacked' },
	{ label: 'Stacked Area', value: 'stacked-area' },
	{ label: 'Stream', value: 'stacked-stream' },
] as const satisfies ReadonlyArray<{
	label: string;
	value: ChartType;
}>;

export const latestChartTypes = [
	{ label: 'Bar', value: 'bar' },
	{ label: 'Stacked Bar', value: 'stacked-bar' },
] as const satisfies ReadonlyArray<{
	label: string;
	value: ChartType;
}>;

export const timeRanges = [
	{ value: '7-days', label: '7 Days' },
	{ value: '30-days', label: '30 Days' },
	{ value: '90-days', label: '90 Days' },
	{ value: '180-days', label: '6 Months' },
	{ value: '365-days', label: '1 Year' },
	{ value: '730-days', label: '2 Years' },
	{ value: '1825-days', label: '5 Years' },
	{ value: 'all-time', label: 'All Time' },
] as const;

export const defaultRangeBinTypes: Record<TimeRange, BinType> = {
	'7-days': 'daily',
	'30-days': 'daily',
	'90-days': 'weekly',
	'180-days': 'weekly',
	'365-days': 'weekly',
	'730-days': 'weekly',
	'1825-days': 'weekly',
	'all-time': 'weekly',
};

export function getPackageColor(packageName: string, packages: PackageGroup[]): string {
	const packageInfo = packages.find(
		(pkg) => pkg.label === packageName || pkg.packages.some((p) => p.name === packageName),
	);

	if (packageInfo?.color) {
		return packageInfo.color;
	}

	const packageIndex = packages.findIndex(
		(pkg) => pkg.label === packageName || pkg.packages.some((p) => p.name === packageName),
	);

	return defaultColors[Math.max(packageIndex, 0) % defaultColors.length];
}

export function getBaselineDisplayName(packageGroups: PackageGroup[]): string {
	const baselineNames = packageGroups
		.filter((packageGroup) => packageGroup.baseline)
		.flatMap((packageGroup) => {
			const label = packageGroup.baselineLabel?.trim();
			if (label) return [label];

			const groupLabel = getPackageGroupLabel(packageGroup);
			return groupLabel ? [groupLabel] : [];
		});

	return [...new Set(baselineNames)].join(', ') || 'Baseline';
}

export const formatNumber = (num: number) => {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1_000) {
		return `${(num / 1_000).toFixed(1)}k`;
	}
	return num.toString();
};

export function isBinningOptionValidForRange(range: TimeRange, binType: BinType): boolean {
	switch (range) {
		case '7-days':
		case '30-days':
			return binType === 'daily';
		case '90-days':
		case '180-days':
		case '365-days':
			return binType === 'daily' || binType === 'weekly' || binType === 'monthly';
		case '730-days':
		case '1825-days':
		case 'all-time':
			return true;
	}
}

export function isChartTypeValidForViewMode(viewMode: ViewMode, chartType: ChartType): boolean {
	const options = viewMode === 'history' ? historyChartTypes : latestChartTypes;
	return options.some((option) => option.value === chartType);
}

export function getDefaultChartTypeForViewMode(viewMode: ViewMode): ChartType {
	return viewMode === 'history' ? 'line' : 'bar';
}

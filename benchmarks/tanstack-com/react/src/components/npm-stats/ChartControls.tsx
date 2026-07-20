import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import {
	ArrowDownWideNarrow,
	ChartArea,
	ChartBar,
	ChartBarStacked,
	ChartLine,
	Clock3,
	Columns3,
	History,
	Layers,
	Rows3,
	Waves,
	type LucideIcon,
} from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import { Tooltip } from '~/components/Tooltip';
import {
	type TimeRange,
	type BinType,
	type ChartType,
	type TransformMode,
	type ShowDataMode,
	type ViewMode,
	type LatestBarSort,
	type BarOrientation,
	timeRanges,
	binningOptions,
	historyChartTypes,
	latestChartTypes,
	isBinningOptionValidForRange,
} from './shared';

const dropdownButtonStyles = {
	base: 'flex h-6 items-center gap-0.5 rounded bg-gray-500/10 px-1.5 py-0.5 text-xs leading-none',
	active: 'bg-gray-500/20',
} as const;

const dropdownContentStyles =
	'min-w-[180px] rounded-md bg-white p-1.5 shadow-lg dark:bg-gray-800 z-50';
const dropdownHeaderStyles = 'mb-1 flex items-center justify-between px-0.5 text-xs font-medium';
const dropdownItemStyles =
	'flex w-full cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs outline-none hover:bg-gray-500/20 data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500';
const segmentedControlStyles =
	'flex h-6 items-center rounded bg-gray-500/10 p-0.5 text-xs leading-none';
const segmentedButtonStyles = 'flex h-5 items-center gap-0.5 rounded px-1.5';
const iconSegmentedButtonStyles = 'flex size-5 items-center justify-center rounded';

const chartTypeIcons = {
	line: ChartLine,
	stacked: Layers,
	'stacked-area': ChartArea,
	'stacked-stream': Waves,
	bar: ChartBar,
	'stacked-bar': ChartBarStacked,
} as const satisfies Partial<Record<ChartType, LucideIcon>>;

const transformOptions = [
	{ value: 'none', label: 'Actual Values' },
	{ value: 'normalize-y', label: 'Relative Change' },
] as const satisfies ReadonlyArray<{
	value: TransformMode;
	label: string;
}>;

const showDataModeOptions = [
	{ value: 'all', label: 'All Data' },
	{ value: 'complete', label: 'Hide Partial Data' },
] as const;

export type ChartControlsProps = {
	viewMode: ViewMode;
	chartType: ChartType;
	range: TimeRange;
	binType: BinType;
	transform: TransformMode;
	showDataMode: ShowDataMode;
	barSort: LatestBarSort;
	barOrientation: BarOrientation;
	onViewModeChange: (mode: ViewMode) => void;
	onChartTypeChange: (chartType: ChartType) => void;
	onRangeChange: (range: TimeRange) => void;
	onBinTypeChange: (binType: BinType) => void;
	onTransformChange: (transform: TransformMode) => void;
	onShowDataModeChange: (mode: ShowDataMode) => void;
	onBarSortChange: (barSort: LatestBarSort) => void;
	onBarOrientationChange: (barOrientation: BarOrientation) => void;
};

export function ChartControls({
	viewMode,
	chartType,
	range,
	binType,
	transform,
	showDataMode,
	barSort,
	barOrientation,
	onViewModeChange,
	onChartTypeChange,
	onRangeChange,
	onBinTypeChange,
	onTransformChange,
	onShowDataModeChange,
	onBarSortChange,
	onBarOrientationChange,
}: ChartControlsProps) {
	const chartTypeOptions = viewMode === 'history' ? historyChartTypes : latestChartTypes;
	const canUseTransform = viewMode === 'history' && chartType === 'line';
	const showDataModeDisabled = viewMode === 'latest' || transform === 'normalize-y';
	const showBarSort = viewMode === 'latest' && (chartType === 'bar' || chartType === 'stacked-bar');
	const showBarOrientation = showBarSort;

	return (
		<>
			<div className={segmentedControlStyles}>
				<Tooltip content="Show the full timeline">
					<button
						onClick={() => onViewModeChange('history')}
						className={twMerge(
							segmentedButtonStyles,
							viewMode === 'history'
								? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
								: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
						)}
					>
						<History className="size-3" />
						Timeline
					</button>
				</Tooltip>
				<Tooltip content="Show one selected bucket snapshot">
					<button
						onClick={() => onViewModeChange('latest')}
						className={twMerge(
							segmentedButtonStyles,
							viewMode === 'latest'
								? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
								: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
						)}
					>
						<Clock3 className="size-3" />
						Snapshot
					</button>
				</Tooltip>
			</div>

			{/* Time Range */}
			<DropdownMenu>
				<Tooltip content="Select time range">
					<DropdownMenuTrigger asChild>
						<button className={twMerge(dropdownButtonStyles.base)}>
							{timeRanges.find((r) => r.value === range)?.label}
						</button>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent className={dropdownContentStyles}>
					<div className={dropdownHeaderStyles}>
						<span>Time Range</span>
					</div>
					{timeRanges.map(({ value, label }) => (
						<DropdownMenuItem
							key={value}
							onSelect={() => onRangeChange(value)}
							className={twMerge(
								dropdownItemStyles,
								value === range ? 'text-blue-500 bg-blue-500/10' : '',
								'data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500',
							)}
						>
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Binning Interval */}
			<DropdownMenu>
				<Tooltip content="Select binning interval">
					<DropdownMenuTrigger asChild>
						<button
							className={twMerge(
								dropdownButtonStyles.base,
								binType !== 'weekly' && dropdownButtonStyles.active,
							)}
						>
							{binningOptions.find((b) => b.value === binType)?.label}
						</button>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent className={dropdownContentStyles}>
					<div className={dropdownHeaderStyles}>
						<span>Binning Interval</span>
					</div>
					{binningOptions.map(({ label, value }) => (
						<DropdownMenuItem
							key={value}
							onSelect={() => onBinTypeChange(value)}
							disabled={viewMode === 'history' && !isBinningOptionValidForRange(range, value)}
							className={twMerge(
								dropdownItemStyles,
								binType === value ? 'text-blue-500 bg-blue-500/10' : '',
								'data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500',
								viewMode === 'history' && !isBinningOptionValidForRange(range, value)
									? 'opacity-50 cursor-not-allowed'
									: '',
							)}
						>
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Chart Type */}
			<div aria-label="Chart type" className={segmentedControlStyles}>
				{chartTypeOptions.map(({ value, label }) => {
					const Icon = chartTypeIcons[value] ?? ChartBar;

					return (
						<Tooltip content={label} key={value}>
							<button
								aria-label={`${label} chart`}
								aria-pressed={chartType === value}
								className={twMerge(
									iconSegmentedButtonStyles,
									chartType === value
										? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
										: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
								)}
								onClick={() => onChartTypeChange(value)}
								type="button"
							>
								<Icon className="size-3.5" />
							</button>
						</Tooltip>
					);
				})}
			</div>

			{showBarOrientation ? (
				<div className={segmentedControlStyles}>
					<Tooltip content="Use vertical bars">
						<button
							onClick={() => onBarOrientationChange('vertical')}
							className={twMerge(
								segmentedButtonStyles,
								barOrientation === 'vertical'
									? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
									: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
							)}
						>
							<Columns3 className="size-3" />
							Vertical
						</button>
					</Tooltip>
					<Tooltip content="Use horizontal bars">
						<button
							onClick={() => onBarOrientationChange('horizontal')}
							className={twMerge(
								segmentedButtonStyles,
								barOrientation === 'horizontal'
									? 'bg-white text-blue-600 shadow-sm dark:bg-gray-900 dark:text-blue-400'
									: 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
							)}
						>
							<Rows3 className="size-3" />
							Horizontal
						</button>
					</Tooltip>
				</div>
			) : null}

			{showBarSort ? (
				<Tooltip content={barSort === 'value' ? 'Sort bars by series name' : 'Sort bars by value'}>
					<button
						className={twMerge(
							dropdownButtonStyles.base,
							barSort === 'value' && dropdownButtonStyles.active,
						)}
						onClick={() => onBarSortChange(barSort === 'value' ? 'name' : 'value')}
					>
						<ArrowDownWideNarrow className="size-3" />
						{barSort === 'value' ? 'Value Sort' : 'Name Sort'}
					</button>
				</Tooltip>
			) : null}

			{/* Y-Axis Transform */}
			<DropdownMenu>
				<Tooltip
					content={
						canUseTransform
							? "Transform the Y-axis to show relative changes between packages. 'None' shows actual download numbers, while 'Normalize Y' shows percentage changes relative to the first data point."
							: 'Relative change is only available for history line charts'
					}
				>
					<DropdownMenuTrigger asChild>
						<button
							className={twMerge(
								dropdownButtonStyles.base,
								transform !== 'none' && dropdownButtonStyles.active,
								!canUseTransform && 'opacity-50 cursor-not-allowed',
							)}
							disabled={!canUseTransform}
						>
							{transformOptions.find((opt) => opt.value === transform)?.label}
						</button>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent className={dropdownContentStyles}>
					<div className={dropdownHeaderStyles}>
						<span>Y-Axis Transform</span>
					</div>
					{transformOptions.map(({ value, label }) => (
						<DropdownMenuItem
							key={value}
							onSelect={() => onTransformChange(value)}
							disabled={!canUseTransform}
							className={twMerge(
								dropdownItemStyles,
								transform === value ? 'text-blue-500 bg-blue-500/10' : '',
								'data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500',
								!canUseTransform ? 'opacity-50 cursor-not-allowed' : '',
							)}
						>
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			{/* Show Data Mode */}
			<DropdownMenu>
				<Tooltip
					content={
						viewMode === 'latest'
							? 'Snapshot mode always shows the selected bucket'
							: transform === 'normalize-y'
								? 'Only complete data is shown when using relative change'
								: 'Control how data is displayed'
					}
				>
					<DropdownMenuTrigger asChild>
						<button
							className={twMerge(
								dropdownButtonStyles.base,
								showDataMode !== 'all' && dropdownButtonStyles.active,
								showDataModeDisabled && 'opacity-50 cursor-not-allowed',
							)}
							disabled={showDataModeDisabled}
						>
							{showDataModeOptions.find((opt) => opt.value === showDataMode)?.label}
						</button>
					</DropdownMenuTrigger>
				</Tooltip>
				<DropdownMenuContent className={dropdownContentStyles}>
					<div className={dropdownHeaderStyles}>
						<span>Data Display Mode</span>
					</div>
					{showDataModeOptions.map(({ value, label }) => (
						<DropdownMenuItem
							key={value}
							onSelect={() => onShowDataModeChange(value)}
							disabled={showDataModeDisabled}
							className={twMerge(
								dropdownItemStyles,
								showDataMode === value ? 'text-blue-500 bg-blue-500/10' : '',
								'data-highlighted:bg-gray-500/20 data-highlighted:text-blue-500',
								showDataModeDisabled ? 'opacity-50 cursor-not-allowed' : '',
							)}
						>
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	);
}

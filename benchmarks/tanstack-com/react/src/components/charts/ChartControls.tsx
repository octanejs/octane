import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import { twMerge } from 'tailwind-merge';
import {
	type TimeRange,
	type BinType,
	timeRangeOptions,
	binningOptions,
	defaultBinForRange,
} from '~/utils/chart';

type ChartControlsProps = {
	timeRange: TimeRange;
	onTimeRangeChange: (range: TimeRange) => void;
	binType: BinType;
	onBinTypeChange: (bin: BinType) => void;
	className?: string;
};

const buttonStyles = {
	base: 'bg-gray-500/10 rounded-md px-2 py-1 text-xs flex items-center gap-1 hover:bg-gray-500/20 transition-colors',
	active: 'bg-gray-500/20',
};

export function ChartControls({
	timeRange,
	onTimeRangeChange,
	binType,
	onBinTypeChange,
	className,
}: ChartControlsProps) {
	const handleTimeRangeChange = (range: TimeRange) => {
		onTimeRangeChange(range);
		// Auto-update bin type to default for new range
		onBinTypeChange(defaultBinForRange[range]);
	};

	return (
		<div className={twMerge('flex gap-1 items-center', className)}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button className={buttonStyles.base}>
						{timeRangeOptions.find((r) => r.value === timeRange)?.label}
						<ChevronDown className="w-3 h-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="min-w-[120px] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-1 z-50">
					{timeRangeOptions.map(({ value, label }) => (
						<DropdownMenuItem
							key={value}
							onSelect={() => handleTimeRangeChange(value)}
							className={twMerge(
								'w-full px-2 py-1.5 text-left text-xs rounded hover:bg-gray-500/20 flex items-center gap-2 outline-none cursor-pointer',
								value === timeRange ? 'text-blue-500 bg-blue-500/10' : '',
								'data-highlighted:bg-gray-500/20',
							)}
						>
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						className={twMerge(
							buttonStyles.base,
							binType !== defaultBinForRange[timeRange] && buttonStyles.active,
						)}
					>
						{binningOptions.find((b) => b.value === binType)?.label}
						<ChevronDown className="w-3 h-3" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="min-w-[100px] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-1 z-50">
					{binningOptions.map(({ value, label }) => (
						<DropdownMenuItem
							key={value}
							onSelect={() => onBinTypeChange(value)}
							className={twMerge(
								'w-full px-2 py-1.5 text-left text-xs rounded hover:bg-gray-500/20 flex items-center gap-2 outline-none cursor-pointer',
								binType === value ? 'text-blue-500 bg-blue-500/10' : '',
								'data-highlighted:bg-gray-500/20',
							)}
						>
							{label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

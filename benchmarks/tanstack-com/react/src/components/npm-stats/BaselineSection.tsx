import * as React from 'react';
import { Pin, PinOff, Plus, X, ChevronDown, Eye, EyeOff } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import { twMerge } from 'tailwind-merge';
import { Tooltip } from '~/components/Tooltip';
import { PackageSearch } from './PackageSearch';
import { getBaselineDisplayName, type PackageGroup } from './shared';
import type { BaselinePreset } from '~/routes/stats/npm/-comparisons';

export const BASELINE_LINE_COLOR = '#3b82f6';

export type BaselineSectionProps = {
	packageGroups: PackageGroup[];
	presets: BaselinePreset[];
	canToggleShowBaseline: boolean;
	normalizeBaseline: boolean;
	showBaseline: boolean;
	onToggleNormalizeBaseline: () => void;
	onToggleShowBaseline: () => void;
	onAddBaseline: (packageName: string, color?: string) => void;
	onApplyPreset: (preset: BaselinePreset) => void;
	onClearBaselines: () => void;
};

export function BaselineSection({
	packageGroups,
	presets,
	canToggleShowBaseline,
	normalizeBaseline,
	showBaseline,
	onToggleNormalizeBaseline,
	onToggleShowBaseline,
	onAddBaseline,
	onApplyPreset,
	onClearBaselines,
}: BaselineSectionProps) {
	const baselineGroups = packageGroups.filter((pg) => pg.baseline);
	const [showSearch, setShowSearch] = React.useState(false);
	const baselineDisplayName = getBaselineDisplayName(baselineGroups);
	const hasBaselines = baselineGroups.length > 0;
	const normalizeActive = hasBaselines && normalizeBaseline;

	const labelButton = (
		<Tooltip
			content={
				!hasBaselines
					? 'Add baseline packages to enable normalization'
					: normalizeBaseline
						? 'Disable normalization (stop dividing other lines by baseline)'
						: 'Enable normalization (divide other lines by combined baseline)'
			}
		>
			<button
				onClick={onToggleNormalizeBaseline}
				disabled={!hasBaselines}
				className={twMerge(
					'flex items-center gap-1 font-semibold',
					normalizeActive
						? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300'
						: 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300',
					!hasBaselines && 'cursor-default opacity-60',
				)}
			>
				{normalizeActive ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
				<span>Baseline</span>
			</button>
		</Tooltip>
	);

	const isBaselineShown = canToggleShowBaseline && showBaseline;
	const baselineName = (
		<span className={twMerge('font-medium', !isBaselineShown && 'opacity-70')}>
			{baselineDisplayName}
		</span>
	);

	const chip = hasBaselines && (
		<div
			className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs text-blue-900 dark:text-blue-100"
			style={{ backgroundColor: `${BASELINE_LINE_COLOR}25` }}
		>
			{canToggleShowBaseline ? (
				<Tooltip
					content={
						isBaselineShown
							? 'Hide combined baseline line on chart'
							: 'Show combined baseline line on chart'
					}
				>
					<button
						onClick={onToggleShowBaseline}
						className="flex items-center gap-1.5 hover:brightness-110"
					>
						{isBaselineShown ? (
							<Eye className="w-3 h-3 text-blue-600 dark:text-blue-300" />
						) : (
							<EyeOff className="w-3 h-3 text-gray-400 dark:text-gray-500" />
						)}
						{baselineName}
					</button>
				</Tooltip>
			) : (
				<div className="flex items-center gap-1.5">
					<EyeOff className="w-3 h-3 text-gray-400 dark:text-gray-500" />
					{baselineName}
				</div>
			)}
			<Tooltip content="Clear all baselines">
				<button
					onClick={onClearBaselines}
					className="text-gray-500 hover:text-red-500"
					aria-label="Clear all baselines"
				>
					<X className="w-3 h-3" />
				</button>
			</Tooltip>
		</div>
	);

	const addButton = (
		<Tooltip content="Search for a package to add as baseline">
			<button
				onClick={() => setShowSearch(true)}
				className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded
          text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 font-medium"
			>
				<Plus className="w-3 h-3" />
				Add
			</button>
		</Tooltip>
	);

	const presetsMenu = (
		<DropdownMenu>
			<Tooltip content="Apply a curated baseline preset">
				<DropdownMenuTrigger asChild>
					<button
						className="flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded
              text-blue-700 dark:text-blue-300 hover:bg-blue-500/10 font-medium"
					>
						Presets
						<ChevronDown className="w-3 h-3" />
					</button>
				</DropdownMenuTrigger>
			</Tooltip>
			<DropdownMenuContent
				className="min-w-[320px] max-w-[400px] bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 z-50 border border-gray-200 dark:border-gray-700"
				sideOffset={5}
				align="start"
			>
				<div className="px-2 pt-1 pb-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
					Single Package
				</div>
				{presets
					.filter((p) => p.category === 'single')
					.map((preset) => (
						<DropdownMenuItem
							key={preset.id}
							onSelect={(e) => {
								e.preventDefault();
								onApplyPreset(preset);
							}}
							className="w-full px-2 py-1.5 text-left text-sm rounded hover:bg-gray-500/10 outline-none cursor-pointer flex items-center gap-2"
						>
							<div
								className="w-2.5 h-2.5 rounded"
								style={{
									backgroundColor: preset.packages[0]?.color ?? 'currentColor',
								}}
							/>
							<span className="font-medium text-gray-900 dark:text-gray-100">{preset.title}</span>
						</DropdownMenuItem>
					))}

				<div className="h-px bg-gray-500/20 my-1.5" />

				<div className="px-2 pt-1 pb-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
					Equal-Weighted Index
				</div>
				{presets
					.filter((p) => p.category === 'index')
					.map((preset) => (
						<DropdownMenuItem
							key={preset.id}
							onSelect={(e) => {
								e.preventDefault();
								onApplyPreset(preset);
							}}
							className="w-full px-2 py-2 text-left text-sm rounded hover:bg-gray-500/10 outline-none cursor-pointer"
						>
							<div className="font-medium text-gray-900 dark:text-gray-100">{preset.title}</div>
							<div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
								{preset.description}
							</div>
							<div className="flex flex-wrap gap-1 mt-1.5">
								{preset.packages.map((p) => (
									<div
										key={p.name}
										className="flex items-center gap-1 text-[10px] font-mono text-gray-600 dark:text-gray-300"
									>
										<div
											className="w-2 h-2 rounded"
											style={{ backgroundColor: p.color ?? 'currentColor' }}
										/>
										{p.name}
									</div>
								))}
							</div>
						</DropdownMenuItem>
					))}
			</DropdownMenuContent>
		</DropdownMenu>
	);

	return (
		<>
			<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
				{labelButton}

				{!hasBaselines ? (
					<span className="text-gray-500 dark:text-gray-400 italic">none</span>
				) : (
					chip
				)}

				<div className="flex items-center gap-0.5">
					{addButton}
					{presetsMenu}
				</div>
			</div>

			{showSearch && (
				<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
					<div className="bg-white dark:bg-gray-800 rounded-lg p-2 sm:p-4 w-full max-w-md">
						<div className="flex justify-between items-center mb-2 sm:mb-4">
							<h3 className="text-base sm:text-lg font-medium flex items-center gap-2">
								<Pin className="w-4 h-4 text-blue-500" />
								Add baseline package
							</h3>
							<button
								onClick={() => setShowSearch(false)}
								className="p-0.5 sm:p-1 hover:text-red-500"
							>
								<X className="w-4 h-4 sm:w-5 sm:h-5" />
							</button>
						</div>
						<PackageSearch
							onSelect={(pkg) => {
								onAddBaseline(pkg);
								setShowSearch(false);
							}}
							placeholder="Search for baseline package..."
							// eslint-disable-next-line jsx-a11y/no-autofocus
							autoFocus={true}
						/>
					</div>
				</div>
			)}
		</>
	);
}

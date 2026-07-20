import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { getPackageGroupLabel, type PackageGroup } from './shared';
import { defaultColors } from '~/utils/npm-packages';

export type ComparisonGroup = {
	title: string;
	packageGroups: PackageGroup[];
};

type PopularComparisonsProps = {
	comparisons: ComparisonGroup[];
	// Optional: customize the link target
	linkTo?: string;
	// Optional: callback when a comparison is clicked
	onSelect?: (comparison: ComparisonGroup) => void;
};

const PREVIEW_PACKAGE_LIMIT = 8;

export function PopularComparisons({
	comparisons,
	linkTo = '.',
	onSelect,
}: PopularComparisonsProps) {
	return (
		<div>
			<h2 className="text-lg font-semibold mb-3">Presets</h2>
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
				{comparisons.map((comparison) => {
					const baselinePackages = comparison.packageGroups.filter((pg) => pg.baseline);
					const previewPackageGroups = comparison.packageGroups
						.filter((d) => !d.baseline)
						.slice(0, PREVIEW_PACKAGE_LIMIT);
					const hiddenPreviewCount =
						comparison.packageGroups.filter((d) => !d.baseline).length -
						previewPackageGroups.length;

					const content = (
						<div className="space-y-2">
							<div className="space-y-1.5">
								<div>
									<h3 className="text-sm font-medium leading-tight">{comparison.title}</h3>
								</div>
								<div className="flex flex-wrap gap-x-2 gap-y-1">
									{previewPackageGroups.map((packageGroup) => (
										<div
											key={getPackageGroupLabel(packageGroup)}
											className="flex items-center gap-1 text-xs leading-tight"
										>
											<div
												className="w-2.5 h-2.5 rounded-full"
												style={{
													backgroundColor: packageGroup.color || defaultColors[0],
												}}
											/>
											<span>{getPackageGroupLabel(packageGroup)}</span>
										</div>
									))}
									{hiddenPreviewCount > 0 && (
										<div className="text-xs leading-tight text-gray-500 dark:text-gray-400">
											+ {hiddenPreviewCount} more
										</div>
									)}
								</div>
							</div>
							{baselinePackages.length > 0 && (
								<div className="flex items-center gap-1 text-xs flex-wrap">
									<div className="font-medium">Baseline:</div>
									{baselinePackages.map((pg, i) => (
										<React.Fragment key={getPackageGroupLabel(pg) || i}>
											{i > 0 && <span className="text-blue-500/60 text-xs">+</span>}
											<div className="bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5 leading-none font-bold">
												{getPackageGroupLabel(pg)}
											</div>
										</React.Fragment>
									))}
								</div>
							)}
						</div>
					);

					if (onSelect) {
						return (
							<button
								key={comparison.title}
								onClick={() => onSelect(comparison)}
								className="block p-3 bg-gray-500/10 hover:bg-gray-500/20 rounded-md transition-colors text-left w-full"
							>
								{content}
							</button>
						);
					}

					return (
						<Link
							key={comparison.title}
							to={linkTo}
							search={(prev: Record<string, unknown>) => ({
								...prev,
								packageGroups: comparison.packageGroups,
								bucketOffset: 0,
							})}
							resetScroll={false}
							onClick={() => {
								window.scrollTo({
									top: 0,
									behavior: 'smooth',
								});
							}}
							className="block p-3 bg-gray-500/10 hover:bg-gray-500/20 rounded-md transition-colors"
						>
							{content}
						</Link>
					);
				})}
			</div>
		</div>
	);
}

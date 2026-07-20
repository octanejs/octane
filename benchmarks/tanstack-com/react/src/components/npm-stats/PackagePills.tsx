import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { X, Plus, Eye, EyeOff, EllipsisVertical } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import { Tooltip } from '~/components/Tooltip';
import {
	type PackageGroup,
	getPackageColor,
	getPackageGroupLabel,
	hasPackageGroupLabel,
	isPackageGroupHidden,
} from './shared';

export type PackagePillProps = {
	packageGroup: PackageGroup;
	index: number;
	allPackageGroups: PackageGroup[];
	error?: string;
	onColorClick: (packageName: string, event: React.MouseEvent) => void;
	onToggleVisibility: (index: number, packageName: string) => void;
	onRemove: (index: number) => void;
	// Optional advanced features (main page only)
	onCombinePackage?: (packageName: string) => void;
	onLabelChange?: (index: number, label: string) => void;
	onRemoveFromGroup?: (mainPackage: string, subPackage: string) => void;
	openMenuPackage?: string | null;
	onMenuOpenChange?: (packageName: string, open: boolean) => void;
};

export function PackagePill({
	packageGroup,
	index,
	allPackageGroups,
	error,
	onColorClick,
	onToggleVisibility,
	onRemove,
	onCombinePackage,
	onLabelChange,
	onRemoveFromGroup,
	openMenuPackage,
	onMenuOpenChange,
}: PackagePillProps) {
	const currentLabel = packageGroup.label ?? '';
	const [draftLabel, setDraftLabel] = React.useState(currentLabel);
	const labelInputId = React.useId();

	React.useEffect(() => {
		setDraftLabel(currentLabel);
	}, [currentLabel]);

	const mainPackage = packageGroup.packages[0];
	if (!mainPackage) return null;

	const hasLabel = hasPackageGroupLabel(packageGroup);
	const packageList = packageGroup.packages;
	const listedPackages = hasLabel
		? packageList
		: packageList.filter((p) => p.name !== mainPackage.name);
	const showPackageList = listedPackages.length > 0;
	const showPackageCount = !hasLabel && showPackageList;
	const color = getPackageColor(mainPackage.name, allPackageGroups);
	const label = getPackageGroupLabel(packageGroup);
	const isGroupHidden = isPackageGroupHidden(packageGroup);

	const showAdvancedMenu = onMenuOpenChange && (onCombinePackage || onLabelChange);
	const handleLabelBlur = () => {
		if (draftLabel !== currentLabel) {
			onLabelChange?.(index, draftLabel);
		}
	};

	return (
		<div
			className="flex flex-col items-start rounded text-xs leading-none text-gray-900 dark:text-gray-100"
			style={{
				backgroundColor: `${color}20`,
			}}
		>
			<div className="flex w-full items-stretch">
				<Tooltip content="Change color">
					<button
						onClick={(e) => onColorClick(mainPackage.name, e)}
						className="flex w-5 shrink-0 hover:opacity-80"
					>
						<div className="w-full rounded-l" style={{ backgroundColor: color }} />
					</button>
				</Tooltip>
				<div className="flex min-w-0 flex-1 items-center gap-0.5 py-1 pl-1.5 pr-2">
					<Tooltip content="Toggle package visibility">
						<button
							onClick={() => onToggleVisibility(index, hasLabel ? label : mainPackage.name)}
							className={twMerge(
								'hover:text-blue-500 flex min-w-0 max-w-48 items-center gap-0.5',
								isGroupHidden ? 'opacity-50' : '',
							)}
						>
							<span className="truncate">{label}</span>
							{isGroupHidden ? <EyeOff className="size-3.5 shrink-0" /> : null}
						</button>
					</Tooltip>
					{showPackageCount ? (
						<span className="rounded-sm border border-current px-1 text-[11px] font-black leading-none text-black/70 opacity-80 dark:text-white/70">
							+ {listedPackages.length}
						</span>
					) : null}

					{/* Advanced dropdown menu (main page only) */}
					{showAdvancedMenu && (
						<div className="relative flex items-center">
							<DropdownMenu
								open={openMenuPackage === mainPackage.name}
								onOpenChange={(open) => onMenuOpenChange(mainPackage.name, open)}
							>
								<Tooltip content="More options">
									<DropdownMenuTrigger asChild>
										<button className="px-0.5 hover:text-blue-500">
											<EllipsisVertical className="size-3.5" />
										</button>
									</DropdownMenuTrigger>
								</Tooltip>
								<DropdownMenuContent
									className="z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[200px] overflow-y-auto rounded-lg bg-white p-2 shadow-lg dark:bg-gray-800"
									collisionPadding={8}
									sideOffset={5}
								>
									<div className="flex justify-between items-center mb-2">
										<span className="text-sm font-medium">Options</span>
									</div>
									<div className="space-y-1">
										{onLabelChange && (
											<div className="px-2 py-1.5 space-y-1">
												<label
													className="block text-xs font-medium text-gray-500"
													htmlFor={labelInputId}
												>
													Label
												</label>
												<input
													className="w-full rounded border border-gray-500/20 bg-white px-2 py-1 text-sm outline-none focus:border-blue-500 dark:bg-gray-900"
													id={labelInputId}
													maxLength={80}
													onBlur={handleLabelBlur}
													onChange={(event) => setDraftLabel(event.currentTarget.value)}
													onClick={(event) => event.stopPropagation()}
													onKeyDown={(event) => {
														event.stopPropagation();
														if (event.key === 'Enter') {
															event.currentTarget.blur();
														}
													}}
													placeholder={mainPackage.name}
													value={draftLabel}
												/>
											</div>
										)}
										<DropdownMenuItem
											onSelect={(e) => {
												e.preventDefault();
												onToggleVisibility(index, hasLabel ? label : mainPackage.name);
											}}
											className="w-full px-2 py-1.5 text-left text-sm rounded hover:bg-gray-500/20 flex items-center gap-2 outline-none cursor-pointer"
										>
											{isGroupHidden ? <EyeOff className="text-sm" /> : <Eye className="text-sm" />}
											{isGroupHidden ? 'Show Package' : 'Hide Package'}
										</DropdownMenuItem>
										<DropdownMenuItem
											onSelect={(e) => {
												e.preventDefault();
												onColorClick(mainPackage.name, e as unknown as React.MouseEvent);
											}}
											className="w-full px-2 py-1.5 text-left text-sm rounded hover:bg-gray-500/20 flex items-center gap-2 outline-none cursor-pointer"
										>
											<div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
											Change Color
										</DropdownMenuItem>
										{showPackageList && onRemoveFromGroup && (
											<>
												<div className="h-px bg-gray-500/20 my-1" />
												<div className="px-2 py-1 text-xs font-medium text-gray-500">
													{hasLabel ? 'Packages' : 'Sub-packages'}
												</div>
												{listedPackages.map((subPackage) => (
													<DropdownMenuItem
														key={subPackage.name}
														onSelect={(e) => {
															e.preventDefault();
															onToggleVisibility(index, subPackage.name);
														}}
														className="w-full px-2 py-1.5 text-left text-sm rounded hover:bg-gray-500/20 flex items-center gap-2 outline-none cursor-pointer"
													>
														<div className="flex-1 flex items-center justify-between">
															<div className="flex items-center gap-2">
																{subPackage.hidden ? (
																	<EyeOff className="text-sm" />
																) : (
																	<Eye className="text-sm" />
																)}
																<span className={subPackage.hidden ? 'opacity-50' : ''}>
																	{subPackage.name}
																</span>
															</div>
															<button
																onClick={(e) => {
																	e.stopPropagation();
																	onRemoveFromGroup(mainPackage.name, subPackage.name);
																}}
																className="p-1 text-gray-400 hover:text-red-500"
															>
																<X className="w-3 h-3" />
															</button>
														</div>
													</DropdownMenuItem>
												))}
											</>
										)}
										{onCombinePackage && (
											<DropdownMenuItem
												onSelect={(e) => {
													e.preventDefault();
													onCombinePackage(mainPackage.name);
												}}
												className="w-full px-2 py-1.5 text-left text-sm rounded hover:bg-gray-500/20 flex items-center gap-2 outline-none cursor-pointer"
											>
												<Plus className="text-sm" />
												Add Packages
											</DropdownMenuItem>
										)}
									</div>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}

					<button
						onClick={() => onRemove(index)}
						className="ml-auto pl-0.5 text-gray-500 hover:text-red-500"
					>
						<X className="size-3.5" />
					</button>
				</div>
			</div>
			{error && (
				<div className="mt-0.5 rounded bg-red-500/10 px-1 py-0.5 font-mono text-[10px] font-medium leading-none text-red-500">
					{error}
				</div>
			)}
		</div>
	);
}

export type PackagePillsProps = {
	packageGroups: PackageGroup[];
	queryData?: Array<{ error?: string } | undefined>;
	onColorClick: (packageName: string, event: React.MouseEvent) => void;
	onToggleVisibility: (index: number, packageName: string) => void;
	onRemove: (index: number) => void;
	// Optional advanced features (main page only)
	onCombinePackage?: (packageName: string) => void;
	onLabelChange?: (index: number, label: string) => void;
	onRemoveFromGroup?: (mainPackage: string, subPackage: string) => void;
	openMenuPackage?: string | null;
	onMenuOpenChange?: (packageName: string, open: boolean) => void;
};

export function PackagePills({
	packageGroups,
	queryData,
	onColorClick,
	onToggleVisibility,
	onRemove,
	onCombinePackage,
	onLabelChange,
	onRemoveFromGroup,
	openMenuPackage,
	onMenuOpenChange,
}: PackagePillsProps) {
	return (
		<div className="flex flex-wrap gap-1">
			{packageGroups.map((pkg, index) => {
				if (pkg.baseline) return null;
				return (
					<PackagePill
						key={pkg.packages[0]?.name ?? index}
						packageGroup={pkg}
						index={index}
						allPackageGroups={packageGroups}
						error={queryData?.[index]?.error}
						onColorClick={onColorClick}
						onToggleVisibility={onToggleVisibility}
						onRemove={onRemove}
						onCombinePackage={onCombinePackage}
						onLabelChange={onLabelChange}
						onRemoveFromGroup={onRemoveFromGroup}
						openMenuPackage={openMenuPackage}
						onMenuOpenChange={onMenuOpenChange}
					/>
				);
			})}
		</div>
	);
}

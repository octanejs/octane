import * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Table, List, ChevronDown, Plus, X, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useDebouncer } from '@tanstack/react-pacer';
import { twMerge } from 'tailwind-merge';
type FeedViewMode = 'table' | 'timeline';

// =============================================================================
// TOP BAR FILTER COMPONENTS
// =============================================================================

// TopBarFilter - Main wrapper for horizontal filter bar
interface TopBarFilterProps {
	children: React.ReactNode;
	search?: {
		value: string;
		onChange: (value: string) => void;
		placeholder?: string;
	};
	onClearAll?: () => void;
	hasActiveFilters?: boolean;
	trailing?: React.ReactNode;
	className?: string;
}

export function TopBarFilter({
	children,
	search,
	onClearAll,
	hasActiveFilters,
	trailing,
	className,
}: TopBarFilterProps) {
	const [mobileExpanded, setMobileExpanded] = useState(false);

	// Separate AddFilterButton from other children (chips)
	const childArray = React.Children.toArray(children);
	const addFilterButton = childArray.find(
		(child) =>
			React.isValidElement(child) &&
			(child.type as { displayName?: string }).displayName === 'AddFilterButton',
	);
	const filterChips = childArray.filter(
		(child) =>
			!React.isValidElement(child) ||
			(child.type as { displayName?: string }).displayName !== 'AddFilterButton',
	);

	return (
		<div
			className={twMerge(
				'bg-white dark:bg-black/40 border border-gray-200 dark:border-gray-700 rounded-lg',
				className,
			)}
		>
			{/* Mobile Layout */}
			<div className="lg:hidden p-2">
				<div className="flex items-center gap-1.5 flex-wrap">
					{search && (
						<FilterSearch
							value={search.value}
							onChange={search.onChange}
							placeholder={search.placeholder}
							className="flex-1 min-w-[120px]"
							size="sm"
						/>
					)}
					<button
						onClick={() => setMobileExpanded((prev) => !prev)}
						className={twMerge(
							'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors',
							hasActiveFilters
								? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
								: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
						)}
					>
						<SlidersHorizontal className="w-3.5 h-3.5" />
						<span>Filters</span>
						{hasActiveFilters && (
							<span className="ml-0.5 px-1 py-0.5 text-[10px] bg-blue-200 dark:bg-blue-800 rounded-full">
								!
							</span>
						)}
						<ChevronDown
							className={twMerge(
								'w-3.5 h-3.5 transition-transform',
								mobileExpanded && 'rotate-180',
							)}
						/>
					</button>
					{trailing}
				</div>

				{/* Mobile expanded content */}
				{mobileExpanded && (
					<div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
						<div className="space-y-1.5">{children}</div>
						{hasActiveFilters && onClearAll && (
							<button
								onClick={onClearAll}
								className="mt-2 flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md transition-colors"
							>
								<RotateCcw className="w-3 h-3" />
								<span>Reset all filters</span>
							</button>
						)}
					</div>
				)}
			</div>

			{/* Desktop Layout */}
			<div className="hidden lg:block p-2">
				<div className="flex items-center gap-1.5 flex-wrap">
					{search && (
						<FilterSearch
							value={search.value}
							onChange={search.onChange}
							placeholder={search.placeholder}
							className="w-44"
							size="sm"
						/>
					)}
					{addFilterButton}
					{filterChips}
					{hasActiveFilters && onClearAll && (
						<button
							onClick={onClearAll}
							className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-md transition-colors"
						>
							<RotateCcw className="w-3 h-3" />
							<span>Reset</span>
						</button>
					)}
					{trailing && <div className="ml-auto flex items-center gap-1.5">{trailing}</div>}
				</div>
			</div>
		</div>
	);
}

// FilterChip - Active filter pill with remove button
interface FilterChipProps {
	label: string;
	onRemove: () => void;
	onClick?: () => void;
	className?: string;
}

export function FilterChip({ label, onRemove, onClick, className }: FilterChipProps) {
	return (
		<span
			className={twMerge(
				'inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-md',
				onClick && 'cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-900/50',
				className,
			)}
			onClick={onClick}
			onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
			<span className="truncate max-w-[180px]">{label}</span>
			<button
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
				aria-label={`Remove ${label} filter`}
			>
				<X className="w-2.5 h-2.5" />
			</button>
		</span>
	);
}

// AddFilterButton - Button that toggles filter dropdown
interface AddFilterButtonProps {
	children: React.ReactNode;
	label?: string;
}

export function AddFilterButton({ children, label = 'Add filter' }: AddFilterButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [isOpen]);

	return (
		<div ref={containerRef} className="relative">
			<button
				onClick={() => setIsOpen((prev) => !prev)}
				className={twMerge(
					'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors',
					isOpen
						? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
						: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
				)}
			>
				<Plus className="w-3.5 h-3.5" />
				<span>{label}</span>
				<ChevronDown
					className={twMerge('w-3.5 h-3.5 transition-transform', isOpen && 'rotate-180')}
				/>
			</button>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 z-50 min-w-[240px] max-h-[70vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
					{children}
				</div>
			)}
		</div>
	);
}

// FacetFilterButton - Individual facet dropdown button (e.g., "Library", "Use Case")
interface FacetFilterButtonProps {
	label: string;
	children: React.ReactNode;
	hasSelection?: boolean;
	selectionCount?: number;
	onClear?: () => void;
}

export function FacetFilterButton({
	label,
	children,
	hasSelection,
	selectionCount,
	onClear,
}: FacetFilterButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(event: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
				setIsOpen(false);
			}
		}

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
			return () => document.removeEventListener('mousedown', handleClickOutside);
		}
	}, [isOpen]);

	return (
		<div ref={containerRef} className="relative">
			<div
				className={twMerge(
					'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors',
					hasSelection
						? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
						: isOpen
							? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
							: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
				)}
			>
				<button onClick={() => setIsOpen((prev) => !prev)} className="flex items-center gap-1">
					<span>{label}</span>
					{hasSelection && selectionCount !== undefined && selectionCount > 0 && (
						<span className="px-1 py-0.5 text-[10px] bg-blue-200 dark:bg-blue-800 rounded">
							{selectionCount}
						</span>
					)}
					<ChevronDown
						className={twMerge('w-3 h-3 transition-transform', isOpen && 'rotate-180')}
					/>
				</button>
				{hasSelection && onClear && (
					<button
						onClick={onClear}
						className="p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
						aria-label={`Clear ${label} filter`}
					>
						<X className="w-2.5 h-2.5" />
					</button>
				)}
			</div>

			{isOpen && (
				<div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] max-h-[50vh] overflow-y-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-2">
					{children}
				</div>
			)}
		</div>
	);
}

// FilterDropdownSection - Collapsible section inside the dropdown
interface FilterDropdownSectionProps {
	title: string;
	children: React.ReactNode;
	defaultExpanded?: boolean;
	onSelectAll?: () => void;
	onSelectNone?: () => void;
	isAllSelected?: boolean;
	isSomeSelected?: boolean;
}

export function FilterDropdownSection({
	title,
	children,
	defaultExpanded = false,
	onSelectAll,
	onSelectNone,
	isAllSelected,
	isSomeSelected,
}: FilterDropdownSectionProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);
	const checkboxRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (checkboxRef.current) {
			checkboxRef.current.indeterminate = isSomeSelected === true;
		}
	}, [isSomeSelected]);

	const handleCheckboxChange = () => {
		if (isAllSelected) {
			onSelectNone?.();
		} else {
			onSelectAll?.();
		}
	};

	return (
		<div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
			<div className="flex items-center gap-1.5 px-2.5 py-1.5">
				{(onSelectAll || onSelectNone) && (
					<input
						ref={checkboxRef}
						type="checkbox"
						checked={isAllSelected ?? false}
						onChange={(e) => {
							e.stopPropagation();
							handleCheckboxChange();
						}}
						onClick={(e) => e.stopPropagation()}
						className="rounded cursor-pointer w-3.5 h-3.5"
					/>
				)}
				<button
					onClick={() => setIsExpanded((prev) => !prev)}
					className="flex items-center gap-1 flex-1 text-xs font-medium text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300"
				>
					<span>{title}</span>
					<ChevronDown
						className={twMerge(
							'w-3.5 h-3.5 transition-transform ml-auto',
							!isExpanded && '-rotate-90',
						)}
					/>
				</button>
			</div>
			{isExpanded && <div className="px-2.5 pb-2 space-y-0.5">{children}</div>}
		</div>
	);
}

// Helper function for chip labels
export function getFilterChipLabel(facetName: string, values: string[], maxDisplay = 2): string {
	if (values.length === 0) return '';
	if (values.length === 1) return `${facetName}: ${values[0]}`;
	if (values.length <= maxDisplay) return `${facetName}: ${values.join(', ')}`;
	return `${facetName} (${values.length})`;
}

// =============================================================================
// LEGACY SIDEBAR FILTER COMPONENTS (kept for backwards compatibility)
// =============================================================================

// FilterSection - Collapsible section with select all/none
interface FilterSectionProps {
	title: string;
	sectionKey: string;
	children: React.ReactNode;
	onSelectAll?: () => void;
	onSelectNone?: () => void;
	isAllSelected?: boolean;
	isSomeSelected?: boolean;
	expandedSections: Record<string, boolean>;
	onToggleSection: (section: string) => void;
}

export function FilterSection({
	title,
	sectionKey,
	children,
	onSelectAll,
	onSelectNone,
	isAllSelected,
	isSomeSelected,
	expandedSections,
	onToggleSection,
}: FilterSectionProps) {
	const isExpanded = expandedSections[sectionKey] ?? true;
	const checkboxRef = React.useRef<HTMLInputElement>(null);

	React.useEffect(() => {
		if (checkboxRef.current) {
			checkboxRef.current.indeterminate = isSomeSelected === true;
		}
	}, [isSomeSelected]);

	const handleCheckboxChange = () => {
		if (isAllSelected) {
			onSelectNone?.();
		} else {
			onSelectAll?.();
		}
	};

	return (
		<div className="mb-2">
			<div className="flex items-center gap-1.5">
				{(onSelectAll || onSelectNone) && (
					<input
						ref={checkboxRef}
						type="checkbox"
						checked={isAllSelected ?? false}
						onChange={(e) => {
							e.stopPropagation();
							handleCheckboxChange();
						}}
						onClick={(e) => e.stopPropagation()}
						className="rounded cursor-pointer"
					/>
				)}
				<button
					onClick={() => onToggleSection(sectionKey)}
					className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors flex-1 py-0"
				>
					<span>{title}</span>
					<ChevronDown
						className={twMerge('w-3.5 h-3.5 transition-transform', !isExpanded && 'rotate-90')}
					/>
				</button>
			</div>
			{isExpanded && (
				<div
					className={twMerge(
						'mt-1 space-y-0.5',
						onSelectAll || onSelectNone ? 'pl-4' : 'pl-[1.375rem]',
					)}
				>
					{children}
				</div>
			)}
		</div>
	);
}

// FilterCheckbox - Standardized checkbox item with count badge
interface FilterCheckboxProps {
	label: string;
	checked: boolean;
	onChange: () => void;
	count?: number;
	capitalize?: boolean;
}

export function FilterCheckbox({
	label,
	checked,
	onChange,
	count,
	capitalize = false,
}: FilterCheckboxProps) {
	return (
		<label className="flex items-center gap-1.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 px-1.5 py-0 rounded">
			<input type="checkbox" checked={checked} onChange={onChange} className="rounded" />
			<span className={capitalize ? 'capitalize' : ''}>{label}</span>
			{count !== undefined && (
				<span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
					{count}
				</span>
			)}
		</label>
	);
}

// FilterSearch - Search input component with debouncing
interface FilterSearchProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	debounceMs?: number;
	size?: 'sm' | 'md';
}

export function FilterSearch({
	value,
	onChange,
	placeholder = 'Search...',
	className = '',
	debounceMs = 300,
	size = 'md',
}: FilterSearchProps) {
	// Local state for immediate UI updates
	const [inputValue, setInputValue] = useState(value || '');

	const { maybeExecute, state: isPending } = useDebouncer(
		onChange,
		{ wait: debounceMs },
		(state) => ({
			isPending: state.isPending,
		}),
	);

	// Sync local state when value prop changes externally
	React.useEffect(() => {
		const nextValue = value || '';

		setInputValue((currentValue) => {
			// While the user is editing, keep the local draft authoritative.
			if (isPending) {
				return currentValue;
			}

			return nextValue;
		});
	}, [isPending, value]);

	return (
		<input
			type="text"
			placeholder={placeholder}
			value={inputValue}
			onChange={(e) => {
				setInputValue(e.target.value);
				maybeExecute(e.target.value);
			}}
			className={twMerge(
				'border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-black/40 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500',
				size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2 py-1 text-sm',
				className,
			)}
		/>
	);
}

// ViewModeToggle - View mode toggle buttons (table/timeline)
interface ViewModeToggleProps {
	viewMode: FeedViewMode;
	onViewModeChange: (viewMode: FeedViewMode) => void;
	compact?: boolean;
}

export function ViewModeToggle({
	viewMode,
	onViewModeChange,
	compact = false,
}: ViewModeToggleProps) {
	const baseButtonClasses = 'flex items-center px-1.5 py-1 rounded-md transition-colors';
	const activeButtonClasses = 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
	const inactiveButtonClasses =
		'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-700/50';

	const compactViewModes = [
		{ mode: 'table' as const, icon: Table, title: 'Table view' },
		{ mode: 'timeline' as const, icon: List, title: 'Timeline view' },
	];

	if (compact) {
		return (
			<div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
				{compactViewModes.map(({ mode, icon: Icon, title }) => (
					<button
						key={mode}
						onClick={(e) => {
							e.stopPropagation();
							onViewModeChange(mode);
						}}
						className={twMerge(
							baseButtonClasses,
							viewMode === mode ? activeButtonClasses : inactiveButtonClasses,
						)}
						title={title}
					>
						<Icon className="w-3.5 h-3.5" />
					</button>
				))}
			</div>
		);
	}

	const viewModes = [
		{
			mode: 'table' as const,
			icon: Table,
			label: 'Table',
			title: 'Table view',
		},
		{
			mode: 'timeline' as const,
			icon: List,
			label: 'Timeline',
			title: 'Timeline view',
		},
	];

	return (
		<div className="flex items-stretch w-full gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
			{viewModes.map(({ mode, icon: Icon, label, title }) => (
				<button
					key={mode}
					onClick={() => onViewModeChange(mode)}
					className={twMerge(
						baseButtonClasses,
						'flex-1 flex-col gap-1',
						viewMode === mode ? activeButtonClasses : inactiveButtonClasses,
					)}
					title={title}
				>
					<Icon className="w-3.5 h-3.5" />
					<span className="text-xs font-medium">{label}</span>
				</button>
			))}
		</div>
	);
}

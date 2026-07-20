import * as React from 'react';
import {
	TopBarFilter,
	FilterChip,
	AddFilterButton,
	FilterDropdownSection,
} from '~/components/FilterComponents';

interface LoginsFilters {
	userId?: string;
	provider?: 'github' | 'google';
}

interface LoginsTopBarFiltersProps {
	filters: LoginsFilters;
	onFilterChange: (filters: Partial<LoginsFilters>) => void;
	onClearFilters: () => void;
}

export function LoginsTopBarFilters({
	filters,
	onFilterChange,
	onClearFilters,
}: LoginsTopBarFiltersProps) {
	const hasActiveFilters = Boolean(filters.userId || filters.provider);

	return (
		<TopBarFilter
			search={{
				value: filters.userId || '',
				onChange: (value) => onFilterChange({ userId: value || undefined }),
				placeholder: 'Search by user ID...',
			}}
			onClearAll={onClearFilters}
			hasActiveFilters={hasActiveFilters}
		>
			{/* Active Filter Chips */}
			{filters.provider && (
				<FilterChip
					label={`Provider: ${filters.provider}`}
					onRemove={() => onFilterChange({ provider: undefined })}
				/>
			)}

			{/* Add Filter Dropdown */}
			<AddFilterButton>
				{/* Provider Filter */}
				<FilterDropdownSection title="Provider" defaultExpanded>
					<select
						value={filters.provider || ''}
						onChange={(e) =>
							onFilterChange({
								provider: (e.target.value as LoginsFilters['provider']) || undefined,
							})
						}
						className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All providers</option>
						<option value="github">GitHub</option>
						<option value="google">Google</option>
					</select>
				</FilterDropdownSection>
			</AddFilterButton>
		</TopBarFilter>
	);
}

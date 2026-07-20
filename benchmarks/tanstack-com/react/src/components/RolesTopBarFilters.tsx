import * as React from 'react';
import { VALID_CAPABILITIES } from '~/db/types';
import {
	TopBarFilter,
	FilterChip,
	AddFilterButton,
	FilterDropdownSection,
	FilterCheckbox,
	getFilterChipLabel,
} from '~/components/FilterComponents';

interface RolesFilters {
	name?: string;
	capabilities?: string[];
}

interface RolesTopBarFiltersProps {
	filters: RolesFilters;
	onFilterChange: (filters: Partial<RolesFilters>) => void;
	onClearFilters: () => void;
	extraContent?: React.ReactNode;
}

export function RolesTopBarFilters({
	filters,
	onFilterChange,
	onClearFilters,
	extraContent,
}: RolesTopBarFiltersProps) {
	const toggleCapability = (capability: string) => {
		const current = filters.capabilities || [];
		const updated = current.includes(capability)
			? current.filter((c) => c !== capability)
			: [...current, capability];
		onFilterChange({ capabilities: updated.length > 0 ? updated : undefined });
	};

	const hasActiveFilters = Boolean(
		filters.name || (filters.capabilities && filters.capabilities.length > 0),
	);

	return (
		<TopBarFilter
			search={{
				value: filters.name || '',
				onChange: (value) => onFilterChange({ name: value || undefined }),
				placeholder: 'Search by name...',
			}}
			onClearAll={onClearFilters}
			hasActiveFilters={hasActiveFilters}
			trailing={extraContent}
		>
			{/* Active Filter Chips */}
			{filters.capabilities && filters.capabilities.length > 0 && (
				<FilterChip
					label={getFilterChipLabel('Capabilities', filters.capabilities)}
					onRemove={() => onFilterChange({ capabilities: undefined })}
				/>
			)}

			{/* Add Filter Dropdown */}
			<AddFilterButton>
				{/* Capabilities Filter */}
				<FilterDropdownSection
					title="Capabilities"
					defaultExpanded
					onSelectAll={() => onFilterChange({ capabilities: [...VALID_CAPABILITIES] })}
					onSelectNone={() => onFilterChange({ capabilities: undefined })}
					isAllSelected={filters.capabilities?.length === VALID_CAPABILITIES.length}
					isSomeSelected={
						(filters.capabilities?.length ?? 0) > 0 &&
						(filters.capabilities?.length ?? 0) < VALID_CAPABILITIES.length
					}
				>
					{VALID_CAPABILITIES.map((cap) => (
						<FilterCheckbox
							key={cap}
							label={cap}
							checked={filters.capabilities?.includes(cap) || false}
							onChange={() => toggleCapability(cap)}
						/>
					))}
				</FilterDropdownSection>
			</AddFilterButton>
		</TopBarFilter>
	);
}

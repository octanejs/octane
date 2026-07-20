import * as React from 'react';
import { libraries, type LibraryId } from '~/libraries';
import { SHOWCASE_STATUSES, type ShowcaseStatus } from '~/db/types';
import {
	TopBarFilter,
	FilterChip,
	AddFilterButton,
	FilterDropdownSection,
	FilterCheckbox,
	getFilterChipLabel,
} from '~/components/FilterComponents';

interface ShowcaseModerationTopBarProps {
	filters: {
		status?: ShowcaseStatus[];
		libraryId?: LibraryId[];
		isFeatured?: boolean;
	};
	onFilterChange: (filters: {
		status?: ShowcaseStatus[];
		libraryId?: LibraryId[];
		isFeatured?: boolean;
	}) => void;
}

const STATUS_LABELS: Record<ShowcaseStatus, string> = {
	pending: 'Pending Review',
	approved: 'Approved',
	denied: 'Denied',
};

export function ShowcaseModerationTopBar({
	filters,
	onFilterChange,
}: ShowcaseModerationTopBarProps) {
	const toggleStatus = (status: ShowcaseStatus) => {
		const current = filters.status || [];
		const updated = current.includes(status)
			? current.filter((s) => s !== status)
			: [...current, status];
		onFilterChange({ status: updated.length > 0 ? updated : undefined });
	};

	const toggleLibrary = (libraryId: LibraryId) => {
		const current = filters.libraryId || [];
		const updated = current.includes(libraryId)
			? current.filter((l) => l !== libraryId)
			: [...current, libraryId];
		onFilterChange({ libraryId: updated.length > 0 ? updated : undefined });
	};

	const handleFeaturedChange = (value: boolean | undefined) => {
		onFilterChange({ isFeatured: value });
	};

	const handleClearFilters = () => {
		onFilterChange({
			status: undefined,
			libraryId: undefined,
			isFeatured: undefined,
		});
	};

	const hasActiveFilters = Boolean(
		(filters.status && filters.status.length > 0) ||
		filters.libraryId ||
		filters.isFeatured !== undefined,
	);

	const getLibraryName = (id: LibraryId) => libraries.find((l) => l.id === id)?.name || id;

	return (
		<TopBarFilter onClearAll={handleClearFilters} hasActiveFilters={hasActiveFilters}>
			{/* Active Filter Chips */}
			{filters.status && filters.status.length > 0 && (
				<FilterChip
					label={getFilterChipLabel(
						'Status',
						filters.status.map((s) => STATUS_LABELS[s]),
					)}
					onRemove={() => onFilterChange({ status: undefined })}
				/>
			)}
			{filters.libraryId && filters.libraryId.length > 0 && (
				<FilterChip
					label={getFilterChipLabel(
						'Library',
						filters.libraryId.map((id) => getLibraryName(id)),
					)}
					onRemove={() => onFilterChange({ libraryId: undefined })}
				/>
			)}
			{filters.isFeatured === true && (
				<FilterChip
					label="Featured Only"
					onRemove={() => onFilterChange({ isFeatured: undefined })}
				/>
			)}
			{filters.isFeatured === false && (
				<FilterChip
					label="Not Featured Only"
					onRemove={() => onFilterChange({ isFeatured: undefined })}
				/>
			)}

			{/* Add Filter Dropdown */}
			<AddFilterButton>
				{/* Status Filter */}
				<FilterDropdownSection title="Status" defaultExpanded>
					{SHOWCASE_STATUSES.map((status) => (
						<FilterCheckbox
							key={status}
							label={STATUS_LABELS[status]}
							checked={filters.status?.includes(status) || false}
							onChange={() => toggleStatus(status)}
						/>
					))}
				</FilterDropdownSection>

				{/* Library Filter */}
				<FilterDropdownSection
					title="Library"
					defaultExpanded
					onSelectAll={() => onFilterChange({ libraryId: libraries.map((l) => l.id) })}
					onSelectNone={() => onFilterChange({ libraryId: undefined })}
					isAllSelected={filters.libraryId?.length === libraries.length}
					isSomeSelected={
						(filters.libraryId?.length ?? 0) > 0 &&
						(filters.libraryId?.length ?? 0) < libraries.length
					}
				>
					{libraries.map((lib) => (
						<FilterCheckbox
							key={lib.id}
							label={lib.name}
							checked={filters.libraryId?.includes(lib.id) || false}
							onChange={() => toggleLibrary(lib.id)}
						/>
					))}
				</FilterDropdownSection>

				{/* Featured Filter */}
				<FilterDropdownSection title="Featured Status" defaultExpanded>
					<FilterCheckbox
						label="Featured Only"
						checked={filters.isFeatured === true}
						onChange={() => handleFeaturedChange(filters.isFeatured === true ? undefined : true)}
					/>
					<FilterCheckbox
						label="Not Featured Only"
						checked={filters.isFeatured === false}
						onChange={() => handleFeaturedChange(filters.isFeatured === false ? undefined : false)}
					/>
				</FilterDropdownSection>
			</AddFilterButton>
		</TopBarFilter>
	);
}

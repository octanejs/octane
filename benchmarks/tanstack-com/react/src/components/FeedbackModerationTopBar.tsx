import { libraries, type LibraryId } from '~/libraries';
import { DOC_FEEDBACK_STATUSES, type DocFeedbackStatus } from '~/db/types';
import {
	TopBarFilter,
	FilterChip,
	AddFilterButton,
	FilterDropdownSection,
	FilterCheckbox,
	getFilterChipLabel,
} from '~/components/FilterComponents';
import { FormInput } from '~/ui';

interface FeedbackModerationTopBarProps {
	filters: {
		status?: DocFeedbackStatus[];
		libraryId?: LibraryId;
		isDetached?: boolean;
		dateFrom?: string;
		dateTo?: string;
	};
	onFilterChange: (filters: {
		status?: DocFeedbackStatus[];
		libraryId?: LibraryId;
		isDetached?: boolean;
		dateFrom?: string;
		dateTo?: string;
	}) => void;
}

const STATUS_LABELS: Record<DocFeedbackStatus, string> = {
	pending: 'Pending Review',
	approved: 'Approved',
	denied: 'Denied',
};

export function FeedbackModerationTopBar({
	filters,
	onFilterChange,
}: FeedbackModerationTopBarProps) {
	const toggleStatus = (status: DocFeedbackStatus) => {
		const current = filters.status || [];
		const updated = current.includes(status)
			? current.filter((s) => s !== status)
			: [...current, status];
		onFilterChange({ status: updated.length > 0 ? updated : undefined });
	};

	const handleClearFilters = () => {
		onFilterChange({
			status: undefined,
			libraryId: undefined,
			isDetached: undefined,
			dateFrom: undefined,
			dateTo: undefined,
		});
	};

	const hasActiveFilters = Boolean(
		(filters.status && filters.status.length > 0) ||
		filters.libraryId ||
		filters.isDetached ||
		filters.dateFrom ||
		filters.dateTo,
	);

	const getLibraryName = (id: LibraryId) => libraries.find((l) => l.id === id)?.name || id;

	const formatDateRange = () => {
		if (filters.dateFrom && filters.dateTo) {
			return `${filters.dateFrom} to ${filters.dateTo}`;
		}
		if (filters.dateFrom) return `From ${filters.dateFrom}`;
		if (filters.dateTo) return `Until ${filters.dateTo}`;
		return '';
	};

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
			{filters.libraryId && (
				<FilterChip
					label={`Library: ${getLibraryName(filters.libraryId)}`}
					onRemove={() => onFilterChange({ libraryId: undefined })}
				/>
			)}
			{filters.isDetached && (
				<FilterChip
					label="Detached Only"
					onRemove={() => onFilterChange({ isDetached: undefined })}
				/>
			)}
			{(filters.dateFrom || filters.dateTo) && (
				<FilterChip
					label={formatDateRange()}
					onRemove={() => onFilterChange({ dateFrom: undefined, dateTo: undefined })}
				/>
			)}

			{/* Add Filter Dropdown */}
			<AddFilterButton>
				{/* Status Filter */}
				<FilterDropdownSection title="Status" defaultExpanded>
					{DOC_FEEDBACK_STATUSES.map((status) => (
						<FilterCheckbox
							key={status}
							label={STATUS_LABELS[status]}
							checked={filters.status?.includes(status) || false}
							onChange={() => toggleStatus(status)}
						/>
					))}
				</FilterDropdownSection>

				{/* Library Filter */}
				<FilterDropdownSection title="Library" defaultExpanded>
					<select
						value={filters.libraryId || ''}
						onChange={(e) =>
							onFilterChange({
								libraryId: (e.target.value || undefined) as LibraryId | undefined,
							})
						}
						className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All Libraries</option>
						{libraries.map((lib) => (
							<option key={lib.id} value={lib.id}>
								{lib.name}
							</option>
						))}
					</select>
				</FilterDropdownSection>

				{/* Block Status Filter */}
				<FilterDropdownSection title="Block Status">
					<FilterCheckbox
						label="Show Detached Only"
						checked={filters.isDetached || false}
						onChange={() =>
							onFilterChange({
								isDetached: filters.isDetached ? undefined : true,
							})
						}
					/>
					<p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
						Feedback where the referenced block has moved or been deleted
					</p>
				</FilterDropdownSection>

				{/* Date Range Filter */}
				<FilterDropdownSection title="Date Range">
					<div className="space-y-3">
						<div>
							<label
								htmlFor="from"
								className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
							>
								From
							</label>
							<FormInput
								id="from"
								type="date"
								value={filters.dateFrom || ''}
								onChange={(e) => onFilterChange({ dateFrom: e.target.value || undefined })}
								className="text-sm"
							/>
						</div>
						<div>
							<label
								htmlFor="to"
								className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
							>
								To
							</label>
							<FormInput
								id="to"
								type="date"
								value={filters.dateTo || ''}
								onChange={(e) => onFilterChange({ dateTo: e.target.value || undefined })}
								className="text-sm"
							/>
						</div>
					</div>
				</FilterDropdownSection>
			</AddFilterButton>
		</TopBarFilter>
	);
}

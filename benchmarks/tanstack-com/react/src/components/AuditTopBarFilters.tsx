import * as React from 'react';
import {
	TopBarFilter,
	FilterChip,
	AddFilterButton,
	FilterDropdownSection,
} from '~/components/FilterComponents';

const ACTION_LABELS: Record<string, string> = {
	'user.capabilities.update': 'Updated Capabilities',
	'user.adsDisabled.update': 'Updated Ads Status',
	'user.sessions.revoke': 'Revoked Sessions',
	'role.create': 'Created Role',
	'role.update': 'Updated Role',
	'role.delete': 'Deleted Role',
	'role.assignment.create': 'Assigned Role',
	'role.assignment.delete': 'Removed Role',
	'banner.create': 'Created Banner',
	'banner.update': 'Updated Banner',
	'banner.delete': 'Deleted Banner',
	'feed.entry.create': 'Created Feed Entry',
	'feed.entry.update': 'Updated Feed Entry',
	'feed.entry.delete': 'Deleted Feed Entry',
	'feedback.moderate': 'Moderated Feedback',
};

const TARGET_TYPES = [
	{ value: 'user', label: 'User' },
	{ value: 'role', label: 'Role' },
	{ value: 'banner', label: 'Banner' },
	{ value: 'feed_entry', label: 'Feed Entry' },
	{ value: 'feedback', label: 'Feedback' },
];

interface AuditFilters {
	actorId?: string;
	action?: string;
	targetType?: string;
}

interface AuditTopBarFiltersProps {
	filters: AuditFilters;
	onFilterChange: (filters: Partial<AuditFilters>) => void;
	onClearFilters: () => void;
}

export function AuditTopBarFilters({
	filters,
	onFilterChange,
	onClearFilters,
}: AuditTopBarFiltersProps) {
	const hasActiveFilters = Boolean(filters.actorId || filters.action || filters.targetType);

	return (
		<TopBarFilter
			search={{
				value: filters.actorId || '',
				onChange: (value) => onFilterChange({ actorId: value || undefined }),
				placeholder: 'Search by actor ID...',
			}}
			onClearAll={onClearFilters}
			hasActiveFilters={hasActiveFilters}
		>
			{/* Active Filter Chips */}
			{filters.action && (
				<FilterChip
					label={`Action: ${ACTION_LABELS[filters.action] || filters.action}`}
					onRemove={() => onFilterChange({ action: undefined })}
				/>
			)}
			{filters.targetType && (
				<FilterChip
					label={`Target: ${TARGET_TYPES.find((t) => t.value === filters.targetType)?.label || filters.targetType}`}
					onRemove={() => onFilterChange({ targetType: undefined })}
				/>
			)}

			{/* Add Filter Dropdown */}
			<AddFilterButton>
				{/* Action Filter */}
				<FilterDropdownSection title="Action" defaultExpanded>
					<select
						value={filters.action || ''}
						onChange={(e) => onFilterChange({ action: e.target.value || undefined })}
						className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All actions</option>
						{Object.entries(ACTION_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</FilterDropdownSection>

				{/* Target Type Filter */}
				<FilterDropdownSection title="Target Type" defaultExpanded>
					<select
						value={filters.targetType || ''}
						onChange={(e) => onFilterChange({ targetType: e.target.value || undefined })}
						className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="">All types</option>
						{TARGET_TYPES.map(({ value, label }) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</FilterDropdownSection>
			</AddFilterButton>
		</TopBarFilter>
	);
}

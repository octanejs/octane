import {
	TopBarFilter,
	FilterChip,
	AddFilterButton,
	FilterDropdownSection,
	FilterCheckbox,
	getFilterChipLabel,
} from '~/components/FilterComponents';
import { FormInput } from '~/ui';
import { VALID_CAPABILITIES } from '~/auth';

interface UsersFilters {
	email?: string;
	name?: string;
	capabilities?: string[];
	noCapabilities?: boolean;
	adsDisabled?: 'all' | 'true' | 'false';
	waitlist?: 'all' | 'true' | 'false';
	useEffectiveCapabilities?: boolean;
}

interface UsersTopBarFiltersProps {
	filters: UsersFilters;
	onFilterChange: (filters: Partial<UsersFilters>) => void;
	onClearFilters: () => void;
}

export function UsersTopBarFilters({
	filters,
	onFilterChange,
	onClearFilters,
}: UsersTopBarFiltersProps) {
	const toggleCapability = (capability: string) => {
		const current = filters.capabilities || [];
		const updated = current.includes(capability)
			? current.filter((c) => c !== capability)
			: [...current, capability];
		onFilterChange({ capabilities: updated.length > 0 ? updated : undefined });
	};

	const hasActiveFilters = Boolean(
		filters.email ||
		filters.name ||
		(filters.capabilities && filters.capabilities.length > 0) ||
		filters.noCapabilities ||
		(filters.adsDisabled && filters.adsDisabled !== 'all') ||
		(filters.waitlist && filters.waitlist !== 'all'),
	);

	return (
		<TopBarFilter
			search={{
				value: filters.email || '',
				onChange: (value) => onFilterChange({ email: value || undefined }),
				placeholder: 'Search by email...',
			}}
			onClearAll={onClearFilters}
			hasActiveFilters={hasActiveFilters}
		>
			{/* Active Filter Chips */}
			{filters.name && (
				<FilterChip
					label={`Name: ${filters.name}`}
					onRemove={() => onFilterChange({ name: undefined })}
				/>
			)}
			{filters.noCapabilities && (
				<FilterChip
					label="No capabilities"
					onRemove={() => onFilterChange({ noCapabilities: undefined })}
				/>
			)}
			{filters.capabilities && filters.capabilities.length > 0 && (
				<FilterChip
					label={getFilterChipLabel('Capabilities', filters.capabilities)}
					onRemove={() => onFilterChange({ capabilities: undefined })}
				/>
			)}
			{filters.adsDisabled === 'true' && (
				<FilterChip label="Ads disabled" onRemove={() => onFilterChange({ adsDisabled: 'all' })} />
			)}
			{filters.adsDisabled === 'false' && (
				<FilterChip label="Ads enabled" onRemove={() => onFilterChange({ adsDisabled: 'all' })} />
			)}
			{filters.waitlist === 'true' && (
				<FilterChip label="On waitlist" onRemove={() => onFilterChange({ waitlist: 'all' })} />
			)}
			{filters.waitlist === 'false' && (
				<FilterChip label="Not on waitlist" onRemove={() => onFilterChange({ waitlist: 'all' })} />
			)}

			{/* Add Filter Dropdown */}
			<AddFilterButton>
				{/* Capability Filter Mode */}
				<div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
					<label className="flex items-center cursor-pointer">
						<input
							type="checkbox"
							checked={filters.useEffectiveCapabilities ?? true}
							onChange={(e) => onFilterChange({ useEffectiveCapabilities: e.target.checked })}
							className="mr-2 h-4 w-4 accent-blue-600"
						/>
						<span className="text-sm font-medium text-gray-600 dark:text-gray-400">
							Filter by effective capabilities
						</span>
					</label>
					<p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
						{filters.useEffectiveCapabilities
							? 'Includes capabilities from roles'
							: 'Direct capabilities only'}
					</p>
				</div>

				{/* Name Filter */}
				<FilterDropdownSection title="Name" defaultExpanded>
					<FormInput
						type="text"
						value={filters.name || ''}
						onChange={(e) => onFilterChange({ name: e.target.value || undefined })}
						placeholder="Filter by name..."
						className="text-sm"
					/>
				</FilterDropdownSection>

				{/* Capabilities Filter */}
				<FilterDropdownSection
					title={
						filters.useEffectiveCapabilities ? 'Capabilities (Effective)' : 'Capabilities (Direct)'
					}
					defaultExpanded
					onSelectAll={() => onFilterChange({ capabilities: [...VALID_CAPABILITIES] })}
					onSelectNone={() =>
						onFilterChange({
							capabilities: undefined,
							noCapabilities: undefined,
						})
					}
					isAllSelected={
						filters.capabilities?.length === VALID_CAPABILITIES.length && !filters.noCapabilities
					}
					isSomeSelected={
						((filters.capabilities?.length ?? 0) > 0 &&
							(filters.capabilities?.length ?? 0) < VALID_CAPABILITIES.length) ||
						!!filters.noCapabilities
					}
				>
					<FilterCheckbox
						label="No capabilities"
						checked={filters.noCapabilities || false}
						onChange={() =>
							onFilterChange({
								noCapabilities: !filters.noCapabilities || undefined,
							})
						}
					/>
					{VALID_CAPABILITIES.map((cap) => (
						<FilterCheckbox
							key={cap}
							label={cap}
							checked={filters.capabilities?.includes(cap) || false}
							onChange={() => toggleCapability(cap)}
						/>
					))}
				</FilterDropdownSection>

				{/* Ads Filter */}
				<FilterDropdownSection title="Ads Status">
					<select
						value={filters.adsDisabled || 'all'}
						onChange={(e) =>
							onFilterChange({
								adsDisabled: e.target.value as UsersFilters['adsDisabled'],
							})
						}
						className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All ad statuses</option>
						<option value="true">Ads disabled</option>
						<option value="false">Ads enabled</option>
					</select>
				</FilterDropdownSection>

				{/* Waitlist Filter */}
				<FilterDropdownSection title="Waitlist Status">
					<select
						value={filters.waitlist || 'all'}
						onChange={(e) =>
							onFilterChange({
								waitlist: e.target.value as UsersFilters['waitlist'],
							})
						}
						className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
					>
						<option value="all">All waitlist statuses</option>
						<option value="true">On ads waitlist</option>
						<option value="false">Not on ads waitlist</option>
					</select>
				</FilterDropdownSection>
			</AddFilterButton>
		</TopBarFilter>
	);
}

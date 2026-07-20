import { TopBarFilter, FacetFilterButton, FilterCheckbox } from '~/components/FilterComponents';
import { libraries, type LibraryId } from '~/libraries';
import { SHOWCASE_USE_CASES_UI, type ShowcaseUseCase } from '~/db/types';
import { USE_CASE_LABELS } from '~/utils/showcase.shared';

interface ShowcaseFilters {
	libraryIds?: LibraryId[];
	useCases?: ShowcaseUseCase[];
	hasSourceCode?: boolean;
	q?: string;
}

interface ShowcaseTopBarFiltersProps {
	filters: ShowcaseFilters;
	onLibraryToggle: (libraryId: LibraryId) => void;
	onClearLibraries: () => void;
	onUseCaseToggle: (useCase: ShowcaseUseCase) => void;
	onClearUseCases: () => void;
	onToggleOpenSource: () => void;
	onClearFilters: () => void;
	onSearchChange: (q: string) => void;
}

const LIBRARY_OPTIONS = libraries
	.filter((lib) => lib.name && lib.visible !== false)
	.slice(0, 10)
	.map((lib) => ({
		id: lib.id,
		label: lib.name?.replace('TanStack ', '') ?? lib.id,
	}));

export function ShowcaseTopBarFilters({
	filters,
	onLibraryToggle,
	onClearLibraries,
	onUseCaseToggle,
	onClearUseCases,
	onToggleOpenSource,
	onClearFilters,
	onSearchChange,
}: ShowcaseTopBarFiltersProps) {
	const hasActiveFilters =
		(filters.libraryIds && filters.libraryIds.length > 0) ||
		(filters.useCases && filters.useCases.length > 0) ||
		filters.hasSourceCode ||
		!!filters.q;

	return (
		<TopBarFilter
			onClearAll={onClearFilters}
			hasActiveFilters={hasActiveFilters}
			search={{
				value: filters.q ?? '',
				onChange: onSearchChange,
				placeholder: 'Search projects...',
			}}
		>
			{/* Library Facet */}
			<FacetFilterButton
				label="Library"
				hasSelection={filters.libraryIds && filters.libraryIds.length > 0}
				selectionCount={filters.libraryIds?.length}
				onClear={onClearLibraries}
			>
				<div className="space-y-0.5">
					{LIBRARY_OPTIONS.map((lib) => (
						<FilterCheckbox
							key={lib.id}
							label={lib.label}
							checked={filters.libraryIds?.includes(lib.id) ?? false}
							onChange={() => onLibraryToggle(lib.id)}
						/>
					))}
				</div>
			</FacetFilterButton>

			{/* Use Case Facet */}
			<FacetFilterButton
				label="Use Case"
				hasSelection={filters.useCases && filters.useCases.length > 0}
				selectionCount={filters.useCases?.length}
				onClear={onClearUseCases}
			>
				<div className="space-y-0.5">
					{SHOWCASE_USE_CASES_UI.map((useCase) => (
						<FilterCheckbox
							key={useCase}
							label={USE_CASE_LABELS[useCase]}
							checked={filters.useCases?.includes(useCase) ?? false}
							onChange={() => onUseCaseToggle(useCase)}
						/>
					))}
				</div>
			</FacetFilterButton>

			{/* Open Source Toggle */}
			<FilterCheckbox
				label="Open Source"
				checked={filters.hasSourceCode ?? false}
				onChange={onToggleOpenSource}
			/>
		</TopBarFilter>
	);
}

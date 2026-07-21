import { useId } from 'octane';
import { ChevronLeft, ChevronRight } from '@octanejs/lucide';

interface PaginationControlsProps {
	currentPage: number;
	totalPages: number;
	totalItems: number;
	filteredItems?: number;
	pageSize: number;
	pageSizeOptions?: number[];
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	canGoPrevious: boolean;
	canGoNext: boolean;
	showPageSizeSelector?: boolean;
	itemLabel?: string; // e.g., "users", "entries"
	sticky?: boolean; // If true, wraps in sticky container with consistent styling
}

export function PaginationControls({
	currentPage,
	totalPages,
	totalItems,
	filteredItems,
	pageSize,
	pageSizeOptions = [10, 25, 50, 100],
	onPageChange,
	onPageSizeChange,
	canGoPrevious,
	canGoNext,
	showPageSizeSelector = true,
	itemLabel = 'items',
	sticky = false,
}: PaginationControlsProps) {
	const pageSizeSelectId = `${useId()}-page-size`;

	const goToPreviousPage = () => {
		if (canGoPrevious) {
			onPageChange(currentPage - 1);
		}
	};

	const goToNextPage = () => {
		if (canGoNext) {
			onPageChange(currentPage + 1);
		}
	};

	const displayCount = filteredItems ?? totalItems;

	// Generate page numbers to display
	const getPageNumbers = () => {
		const pages: (number | string)[] = [];
		const maxPagesToShow = 7;

		if (totalPages <= maxPagesToShow) {
			// Show all pages
			for (let i = 0; i < totalPages; i++) {
				pages.push(i);
			}
		} else {
			// Show first, last, and pages around current
			pages.push(0); // First page

			if (currentPage > 2) {
				pages.push('...');
			}

			// Pages around current
			for (let i = Math.max(1, currentPage - 1); i <=
				Math.min(totalPages - 2, currentPage + 1); i++) {
				pages.push(i);
			}

			if (currentPage < totalPages - 3) {
				pages.push('...');
			}

			pages.push(totalPages - 1); // Last page
		}

		return pages;
	};

	const content = <nav
		aria-label={`${itemLabel} pagination`}
		class="flex items-center justify-between flex-wrap gap-3"
	>
		<div class="text-sm text-gray-600 dark:text-gray-400">
			Showing
			<span class="font-semibold text-gray-900 dark:text-white">{displayCount}</span>
			{' '}
			of
			<span class="font-semibold text-gray-900 dark:text-white">{totalItems}</span>
			{' '}
			{itemLabel as string}
			{filteredItems !== undefined && filteredItems !== totalItems &&
				<span class="ml-2 text-xs">
					• Page
					{currentPage + 1}
					of
					{totalPages}
				</span>}
			{filteredItems === undefined &&
				<span class="ml-2 text-xs">
					• Page
					{currentPage + 1}
					of
					{totalPages}
				</span>}
		</div>
		<div class="flex gap-2 items-center">
			{showPageSizeSelector &&
				<>
					<label htmlFor={pageSizeSelectId} class="text-sm text-gray-600 dark:text-gray-400">
						Per page:
					</label>
					<select
						id={pageSizeSelectId}
						value={pageSize}
						onChange={(e) => {
							const next = parseInt((e.target as HTMLSelectElement).value, 10);
							onPageSizeChange(next);
						}}
						class="px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
					>{pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}</select>
				</>}

			<div class="flex gap-1 items-center">
				<button
					type="button"
					onClick={goToPreviousPage}
					disabled={!canGoPrevious}
					class="flex items-center px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-800 gap-1 transition-colors"
				>
					<ChevronLeft className="w-2.5 h-2.5" />
					<span>Prev</span>
				</button>

				{/* Page number buttons */}
				<div class="hidden sm:flex gap-1">{getPageNumbers().map((pageNum, idx) => {
					if (pageNum === '...') {
						return <span
							key={`ellipsis-${idx}`}
							class="px-2 py-1 text-xs text-gray-500 dark:text-gray-400"
						>
							...
						</span>;
					}

					const isActive = pageNum === currentPage;
					return <button
						type="button"
						key={pageNum}
						onClick={() => onPageChange(pageNum as number)}
						class={isActive
							? 'px-2 py-1 text-xs font-bold text-gray-900 bg-gray-200 border border-gray-400 rounded dark:bg-gray-700 dark:text-white dark:border-gray-500'
							: 'px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white transition-colors'}
					>
						{pageNum as number + 1}
					</button>;
				})}</div>

				<button
					type="button"
					onClick={goToNextPage}
					disabled={!canGoNext}
					class="flex items-center px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-800 gap-1 transition-colors"
				>
					<span>Next</span>
					<ChevronRight className="w-2.5 h-2.5" />
				</button>
			</div>
		</div>
	</nav>;

	if (sticky) {
		return <div class="sticky bottom-4 mt-4">
			<div
				class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl px-3 py-2"
			>{content}</div>
		</div>;
	}

	return content;
}

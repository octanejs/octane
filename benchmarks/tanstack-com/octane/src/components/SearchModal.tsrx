// Bench delta: the upstream SearchModal (Algolia InstantSearch + Kapa AI chat,
// 3.7k lines — preserved as SearchModal.upstream.tsx.txt in the react flavor)
// is replaced by an inert dialog. Site search talks to external services, which
// the benchmark neither exercises nor permits; the lazy-load seam, context
// contract, and export surface are unchanged so the shell behaves identically
// until the modal is actually opened.
import { useSearchContext } from '~/contexts/SearchContext.tsrx';

export function SearchModal() {
	const { isOpen, closeSearch } = useSearchContext();

	if (!isOpen) return null;

	return <div
		class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
		role="dialog"
		aria-modal="true"
		aria-label="Search"
		onClick={closeSearch}
	>
		<div
			class="w-full max-w-xl rounded-lg bg-white p-4 shadow-xl dark:bg-gray-900"
			onClick={(event) => event.stopPropagation()}
		>
			<input
				type="search"
				autoFocus
				placeholder="Search is disabled in the benchmark build"
				class="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm outline-none dark:border-gray-700"
				readOnly
			/>
		</div>
	</div>;
}

export function AiDock() {
	return null;
}

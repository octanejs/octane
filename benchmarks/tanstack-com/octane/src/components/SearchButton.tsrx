import { useRef } from 'octane';
import { Command, Search } from '@octanejs/lucide';
import { twMerge } from 'tailwind-merge';
import { Button } from '~/ui';
import { useSearchContext } from '~/contexts/SearchContext.tsrx';

interface SearchButtonProps {
	className?: string;
	iconOnly?: boolean;
}

function AiGlyph() {
	return <span class="relative flex h-5 w-5 items-center justify-center">
		<span class="text-xs font-black leading-none tracking-normal">AI</span>
	</span>;
}

export function SearchButton({ className, iconOnly = false }: SearchButtonProps) {
	const { openSearch } = useSearchContext();

	return <Button
		type="button"
		data-search-trigger="true"
		onClick={openSearch}
		aria-label="Search TanStack"
		aria-haspopup="dialog"
		variant={iconOnly ? 'icon' : 'ghost'}
		color="gray"
		size={iconOnly ? 'icon-sm' : 'xs'}
		title="Search"
		className={twMerge(
			iconOnly ? 'h-7 w-7 rounded-md p-0' : 'gap-2 bg-gray-500/5 dark:bg-gray-500/30',
			className,
		)}
	>
		<Search className="w-3.5 h-3.5" />
		{iconOnly
			? <span class="sr-only">Search</span>
			: <>
					<span>Search...</span>
					<div
						class="flex items-center bg-gray-500/10 dark:bg-gray-500/30 rounded px-1 py-0.5 gap-0.5 text-[10px] whitespace-nowrap"
					>
						<Command className="w-2.5 h-2.5" />
						K
					</div>
				</>}
	</Button>;
}

export function AiDockButton({ className }: { className?: string }) {
	const {
		cancelAiDockHoverClose,
		closeAiDock,
		isAiDockDirty,
		isAiDockOpen,
		openAiDock,
		scheduleAiDockHoverClose,
	} = useSearchContext();
	const openedByHoverRef = useRef(false);

	const handlePointerEnter = (event: PointerEvent) => {
		if (event.pointerType === 'touch') {
			return;
		}

		cancelAiDockHoverClose();

		if (isAiDockDirty && !isAiDockOpen) {
			openedByHoverRef.current = true;
			openAiDock();
		}
	};

	const handlePointerLeave = (event: PointerEvent) => {
		if (event.pointerType === 'touch') {
			return;
		}

		openedByHoverRef.current = false;

		if (isAiDockDirty) {
			scheduleAiDockHoverClose();
		}
	};

	const handleClick = () => {
		if (openedByHoverRef.current) {
			openedByHoverRef.current = false;
			return;
		}

		if (isAiDockOpen) {
			closeAiDock();
			return;
		}

		openAiDock();
	};

	return <Button
		type="button"
		onClick={handleClick}
		onPointerEnter={handlePointerEnter}
		onPointerLeave={handlePointerLeave}
		aria-label={isAiDockOpen ? 'Close AI panel' : 'Open AI panel'}
		aria-haspopup="dialog"
		aria-pressed={isAiDockOpen}
		variant="ghost"
		size="icon-sm"
		title="Ask AI"
		className={twMerge(
			'h-7 w-8 rounded-md p-0 bg-gray-500/5 dark:bg-gray-500/30',
			isAiDockOpen &&
				'bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300 border-cyan-500/20 dark:border-cyan-300/20',
			className,
		)}
	>
		<AiGlyph />
		<span class="sr-only">Ask AI</span>
	</Button>;
}

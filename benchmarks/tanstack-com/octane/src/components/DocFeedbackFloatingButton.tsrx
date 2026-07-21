import { useEffect, useRef, useState } from 'octane';
import { twMerge } from 'tailwind-merge';
import { Lightbulb, MessageSquare, Plus } from '@octanejs/lucide';

interface DocFeedbackFloatingButtonProps {
	onAddNote: () => void;
	onAddFeedback: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	hasNote?: boolean;
	hasImprovement?: boolean;
	onShowNote?: () => void;
	isMenuOpen?: boolean;
	onMenuOpenChange?: (isOpen: boolean) => void;
}

export function DocFeedbackFloatingButton({
	onAddNote,
	onAddFeedback,
	onMouseEnter,
	onMouseLeave,
	hasNote = false,
	hasImprovement = false,
	onShowNote,
	isMenuOpen: controlledIsMenuOpen,
	onMenuOpenChange,
}: DocFeedbackFloatingButtonProps) {
	const [internalIsMenuOpen, setInternalIsMenuOpen] = useState(false);
	const isControlled = controlledIsMenuOpen !== undefined;
	const isMenuOpen = isControlled ? controlledIsMenuOpen : internalIsMenuOpen;
	const setIsMenuOpen = (value: boolean) => {
		if (isControlled) {
			onMenuOpenChange?.(value);
		} else {
			setInternalIsMenuOpen(value);
		}
	};
	const buttonRef = useRef<HTMLDivElement>(null);

	// Close menu when clicking outside or pressing Escape
	useEffect(() => {
		if (!isMenuOpen) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
				setIsMenuOpen(false);
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				setIsMenuOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [isMenuOpen]);

	const handleButtonClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (hasNote && onShowNote) {
			// If there's a note, expand it and show menu
			onShowNote();
		}
		setIsMenuOpen(!isMenuOpen);
	};

	const handleNoteClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsMenuOpen(false);
		onAddNote();
	};

	const handleFeedbackClick = (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsMenuOpen(false);
		onAddFeedback();
	};

	return <div
		ref={buttonRef}
		class="doc-feedback-floating-btn absolute top-0 right-0 -translate-y-full z-30"
		onMouseEnter={onMouseEnter}
		onMouseLeave={onMouseLeave}
		onClick={(e) => e.stopPropagation()}
		onMouseDown={(e) => e.stopPropagation()}
	>
		{/* Button - neutral with shadow */}
		<button
			onClick={handleButtonClick}
			class={twMerge(
				'flex items-center justify-center',
				'w-6 h-6 rounded',
				'bg-white dark:bg-gray-800',
				'text-gray-600 dark:text-gray-400',
				'border border-gray-200 dark:border-gray-700',
				'shadow-md hover:shadow-lg',
				'hover:bg-gray-50 dark:hover:bg-gray-700',
				'transition-all duration-200',
				'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500',
				isMenuOpen && 'shadow-lg bg-gray-50 dark:bg-gray-700',
			)}
			title="Add feedback"
		>
			<Plus
				className={twMerge(
					'text-[10px] transition-transform duration-200',
					isMenuOpen && 'rotate-45',
				)}
			/>
		</button>

		{/* Context Menu */}
		{isMenuOpen &&
			<div
				class="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
			>
				{!hasNote &&
					<>
						<button
							onClick={handleNoteClick}
							class="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
						>
							<MessageSquare className="text-blue-500" />
							<div>
								<div class="font-medium text-sm text-gray-900 dark:text-white">Add Note</div>
								<div class="text-xs text-gray-500 dark:text-gray-400">
									Personal annotation
								</div>
							</div>
						</button>
						{!hasImprovement && <div class="h-px bg-gray-200 dark:bg-gray-700" />}
					</>}
				{!hasImprovement &&
					<button
						onClick={handleFeedbackClick}
						class="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
					>
						<Lightbulb className="text-yellow-500" />
						<div>
							<div class="font-medium text-sm text-gray-900 dark:text-white">
								Suggest Improvement
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">Help improve docs</div>
						</div>
					</button>}
			</div>}
	</div>;
}

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { twMerge } from 'tailwind-merge';
import { DocFeedbackNote } from './DocFeedbackNote';
import { DocFeedbackFloatingButton } from './DocFeedbackFloatingButton';
import { getDocFeedbackForPageQueryOptions } from '~/queries/docFeedback';
import { createDocFeedback } from '~/utils/docFeedback.functions';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useLoginModal } from '~/contexts/LoginModalContext';
import { findReferenceableBlocks, getBlockIdentifier } from '~/utils/docFeedback';
import type { DocFeedback } from '~/db/types';
import { Lightbulb, MessageSquare } from 'lucide-react';

interface DocFeedbackProviderProps {
	children: React.ReactNode;
	pagePath: string;
	libraryId: string;
	libraryVersion: string;
}

export function DocFeedbackProvider({
	children,
	pagePath,
	libraryId,
	libraryVersion,
}: DocFeedbackProviderProps) {
	const user = useCurrentUser();
	const { openLoginModal } = useLoginModal();
	const containerRef = React.useRef<HTMLDivElement>(null);

	const [creatingState, setCreatingState] = React.useState<{
		blockId: string;
		type: 'note' | 'improvement';
	} | null>(null);

	const [blockSelectors, setBlockSelectors] = React.useState<Map<string, string>>(new Map());
	const [blockContentHashes, setBlockContentHashes] = React.useState<Map<string, string>>(
		new Map(),
	);
	const [blockMarkdowns, setBlockMarkdowns] = React.useState<Map<string, string>>(new Map());
	const [blockElements, setBlockElements] = React.useState<Map<string, HTMLElement>>(new Map());
	const [hoveredBlockId, setHoveredBlockId] = React.useState<string | null>(null);
	const [openMenuBlockId, setOpenMenuBlockId] = React.useState<string | null>(null);

	// Fetch feedback for this page
	const { data: feedbackData } = useQuery(
		getDocFeedbackForPageQueryOptions({
			pagePath,
			libraryVersion,
		}),
	);

	// Get user's notes for this page
	const userNotes = React.useMemo(() => {
		if (!feedbackData?.userFeedback || !user) return [];
		return feedbackData.userFeedback.filter(
			(feedback) => feedback.type === 'note' && feedback.userId === user.userId,
		);
	}, [feedbackData, user]);

	// Get user's improvements for this page
	const userImprovements = React.useMemo(() => {
		if (!feedbackData?.userFeedback || !user) return [];
		return feedbackData.userFeedback.filter(
			(feedback) => feedback.type === 'improvement' && feedback.userId === user.userId,
		);
	}, [feedbackData, user]);

	// Find blocks and compute selectors after render (runs for all users to show teasers)
	React.useEffect(() => {
		if (!containerRef.current) return;

		const container = containerRef.current;
		const blocks = findReferenceableBlocks(container);
		const selectorMap = new Map<string, string>();
		const hashMap = new Map<string, string>();
		const markdownMap = new Map<string, string>();
		const elementMap = new Map<string, HTMLElement>();
		const listeners = new Map<
			HTMLElement,
			{ enter: (e: MouseEvent) => void; leave: (e: MouseEvent) => void }
		>();
		const findClosestBlock = (target: HTMLElement): HTMLElement | null => {
			let closestBlock: HTMLElement | null = null;

			for (const candidate of blocks) {
				if (!candidate.contains(target)) continue;
				if (!closestBlock || closestBlock.contains(candidate)) {
					closestBlock = candidate;
				}
			}

			return closestBlock;
		};

		Promise.all(
			blocks.map(async (block, index) => {
				const blockId = `block-${index}`;
				elementMap.set(blockId, block);

				const identifier = await getBlockIdentifier(block);
				selectorMap.set(blockId, identifier.selector);
				hashMap.set(blockId, identifier.contentHash);
				markdownMap.set(blockId, block.textContent?.trim() || '');

				// Add hover handlers with visual feedback
				const handleMouseEnter = (e: MouseEvent) => {
					// Only handle hover if this is the most specific block being hovered
					// (prevent parent blocks from showing hover when child blocks are hovered)
					const target = e.target;
					if (!(target instanceof HTMLElement)) return;

					const closestBlock = findClosestBlock(target);
					if (closestBlock === block) {
						setHoveredBlockId(blockId);
						block.style.backgroundColor = 'rgba(59, 130, 246, 0.05)'; // blue with low opacity
						block.style.transition = 'background-color 0.2s ease';
					}
				};

				const handleMouseLeave = (e: MouseEvent) => {
					// Only clear hover if we're actually leaving this block
					// (not just entering a child element)
					const relatedTarget = e.relatedTarget instanceof HTMLElement ? e.relatedTarget : null;
					const closestBlock = relatedTarget ? findClosestBlock(relatedTarget) : null;
					if (!relatedTarget || !block.contains(relatedTarget) || closestBlock !== block) {
						setHoveredBlockId((current) => (current === blockId ? null : current));
						block.style.backgroundColor = '';
					}
				};

				block.addEventListener('mouseenter', handleMouseEnter);
				block.addEventListener('mouseleave', handleMouseLeave);
				listeners.set(block, {
					enter: handleMouseEnter,
					leave: handleMouseLeave,
				});

				return {
					blockId,
					selector: identifier.selector,
					contentHash: identifier.contentHash,
				};
			}),
		).then(() => {
			setBlockSelectors(new Map(selectorMap));
			setBlockContentHashes(new Map(hashMap));
			setBlockMarkdowns(new Map(markdownMap));
			setBlockElements(new Map(elementMap));

			// Visual indicators will be updated by the separate effect below
		});

		return () => {
			setBlockElements(new Map());
			blocks.forEach((block) => {
				block.style.backgroundColor = '';
				block.style.borderRight = '';
				block.style.paddingRight = '';

				// Remove event listeners
				const handlers = listeners.get(block);
				if (handlers) {
					block.removeEventListener('mouseenter', handlers.enter);
					block.removeEventListener('mouseleave', handlers.leave);
				}
			});
		};
	}, [children]);

	// Update block indicators when notes or improvements change
	React.useEffect(() => {
		if (!user || blockSelectors.size === 0) return;

		blockSelectors.forEach((selector, blockId) => {
			const block = blockElements.get(blockId);
			if (!block) return;

			const hasNote = userNotes.some((n) => n.blockSelector === selector);
			const hasImprovement = userImprovements.some((n) => n.blockSelector === selector);

			if (hasImprovement) {
				// Yellow for improvements (takes priority over notes)
				block.style.borderRight = '3px solid rgba(234, 179, 8, 0.6)'; // yellow-500
				block.style.paddingRight = '8px';
			} else if (hasNote) {
				// Blue for notes
				block.style.borderRight = '3px solid rgba(59, 130, 246, 0.6)'; // blue-500
				block.style.paddingRight = '8px';
			} else {
				block.style.borderRight = '';
				block.style.paddingRight = '';
			}
		});
	}, [user, userNotes, userImprovements, blockSelectors, blockElements]);

	const handleCloseCreating = React.useCallback(() => {
		setCreatingState(null);
	}, []);

	const handleAddFeedback = React.useCallback(
		(blockId: string, type: 'note' | 'improvement') => {
			const selector = blockSelectors.get(blockId);
			if (!selector) return;

			// If not logged in, show login modal
			if (!user) {
				openLoginModal({
					onSuccess: () => {
						// After login, open the creating interface
						setCreatingState({ blockId, type });
					},
				});
				return;
			}

			// Check if there's existing feedback for this block
			const existingNote = userNotes.find((n) => n.blockSelector === selector);
			const existingImprovement = userImprovements.find((n) => n.blockSelector === selector);

			// If feedback already exists, do nothing (user can toggle it themselves)
			if (type === 'note' && existingNote) {
				return;
			}

			if (type === 'improvement' && existingImprovement) {
				return;
			}

			// Open creating interface for new feedback
			setCreatingState({
				blockId,
				type,
			});
		},
		[blockSelectors, userNotes, userImprovements, user, openLoginModal],
	);

	return (
		<div ref={containerRef} className="relative">
			{children}

			{/* Render floating buttons for each block (visible to all users) */}
			{Array.from(blockSelectors.keys()).map((blockId) => {
				const selector = blockSelectors.get(blockId);
				if (!selector) return null;
				const block = blockElements.get(blockId);
				if (!block) return null;

				// Check if this block has a note or improvement (only for logged-in users)
				const note = user ? userNotes.find((n) => n.blockSelector === selector) : undefined;
				const improvement = user
					? userImprovements.find((n) => n.blockSelector === selector)
					: undefined;
				const isHovered = hoveredBlockId === blockId;

				return (
					<BlockButton
						key={blockId}
						blockId={blockId}
						block={block}
						isHovered={isHovered}
						hasNote={!!note}
						hasImprovement={!!improvement}
						isMenuOpen={openMenuBlockId === blockId}
						onMenuOpenChange={(isOpen) => setOpenMenuBlockId(isOpen ? blockId : null)}
						onAddNote={() => handleAddFeedback(blockId, 'note')}
						onAddFeedback={() => handleAddFeedback(blockId, 'improvement')}
						onShowNote={note ? () => {} : undefined}
					/>
				);
			})}

			{/* Render notes inline (only for logged-in users) */}
			{userNotes.map((note) => {
				// Find the block ID for this note's selector
				const blockId = Array.from(blockSelectors.entries()).find(
					([_, selector]) => selector === note.blockSelector,
				)?.[0];

				if (!blockId) return null;
				const block = blockElements.get(blockId);
				if (!block) return null;

				return <NotePortal key={note.id} block={block} note={note} />;
			})}

			{/* Render improvements inline */}
			{userImprovements.map((improvement) => {
				// Find the block ID for this improvement's selector
				const blockId = Array.from(blockSelectors.entries()).find(
					([_, selector]) => selector === improvement.blockSelector,
				)?.[0];

				if (!blockId) return null;
				const block = blockElements.get(blockId);
				if (!block) return null;

				return <NotePortal key={improvement.id} block={block} note={improvement} />;
			})}

			{/* Render creating interface */}
			{creatingState && (
				<CreatingFeedbackPortal
					blockId={creatingState.blockId}
					block={blockElements.get(creatingState.blockId)}
					type={creatingState.type}
					blockSelector={blockSelectors.get(creatingState.blockId) || ''}
					blockContentHash={blockContentHashes.get(creatingState.blockId) || ''}
					blockMarkdown={blockMarkdowns.get(creatingState.blockId) || ''}
					pagePath={pagePath}
					libraryId={libraryId}
					libraryVersion={libraryVersion}
					onClose={handleCloseCreating}
				/>
			)}
		</div>
	);
}

// Component to render floating button for a block
function BlockButton({
	blockId,
	block,
	isHovered,
	hasNote,
	hasImprovement,
	isMenuOpen,
	onMenuOpenChange,
	onAddNote,
	onAddFeedback,
	onShowNote,
}: {
	blockId: string;
	block: HTMLElement;
	isHovered: boolean;
	hasNote: boolean;
	hasImprovement: boolean;
	isMenuOpen: boolean;
	onMenuOpenChange: (isOpen: boolean) => void;
	onAddNote: () => void;
	onAddFeedback: () => void;
	onShowNote?: () => void;
}) {
	const [mounted, setMounted] = React.useState(false);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;

	// Don't show button if block is inside an editor or note portal
	if (block.closest('[data-editor-portal], [data-note-portal]')) return null;

	// Don't show button if block has both note and improvement (nothing left to add)
	if (hasNote && hasImprovement && !isMenuOpen) return null;

	// Only show button if hovered or menu is open
	if (!isHovered && !isMenuOpen) return null;

	// Create portal container for button positioned at top-right of block
	let portalContainer = block.querySelector<HTMLElement>(`[data-button-portal="${blockId}"]`);

	if (!portalContainer) {
		portalContainer = document.createElement('div');
		portalContainer.setAttribute('data-button-portal', blockId);
		portalContainer.className = 'absolute top-0 right-0 -translate-y-full z-[100]';
		portalContainer.style.position = 'absolute';

		// Make the block relatively positioned if not already
		const currentPosition = window.getComputedStyle(block).position;
		if (currentPosition === 'static') {
			block.style.position = 'relative';
		}

		block.appendChild(portalContainer);
	}

	return ReactDOM.createPortal(
		<DocFeedbackFloatingButton
			onAddNote={onAddNote}
			onAddFeedback={onAddFeedback}
			hasNote={hasNote}
			hasImprovement={hasImprovement}
			onShowNote={onShowNote}
			isMenuOpen={isMenuOpen}
			onMenuOpenChange={onMenuOpenChange}
		/>,
		portalContainer,
	);
}

// Component to render note after a block
function NotePortal({ block, note }: { block: HTMLElement; note: DocFeedback }) {
	const [mounted, setMounted] = React.useState(false);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;

	// Don't show note if block is inside an editor portal
	if (block.closest('[data-editor-portal]')) return null;

	// Find the actual insertion point - if block is inside an anchor-heading, insert after the anchor
	let insertionPoint = block;
	const anchorParent = block.parentElement;
	if (anchorParent?.classList.contains('anchor-heading')) {
		insertionPoint = anchorParent;
	}

	// Create portal container after the insertion point
	let portalContainer = insertionPoint.parentElement?.querySelector<HTMLElement>(
		`[data-note-portal="${note.id}"]`,
	);

	if (!portalContainer) {
		portalContainer = document.createElement('div');
		portalContainer.setAttribute('data-note-portal', note.id);
		portalContainer.className = 'my-4';
		insertionPoint.parentElement?.insertBefore(portalContainer, insertionPoint.nextSibling);
	}

	return ReactDOM.createPortal(
		<DocFeedbackNote note={note} anchorName="" inline={true} />,
		portalContainer,
	);
}

// Component to render creating feedback interface after a block
function CreatingFeedbackPortal({
	blockId,
	block,
	type,
	blockSelector,
	blockContentHash,
	blockMarkdown,
	pagePath,
	libraryId,
	libraryVersion,
	onClose,
}: {
	blockId: string;
	block?: HTMLElement;
	type: 'note' | 'improvement';
	blockSelector: string;
	blockContentHash?: string;
	blockMarkdown?: string;
	pagePath: string;
	libraryId: string;
	libraryVersion: string;
	onClose: () => void;
}) {
	const [mounted, setMounted] = React.useState(false);

	React.useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;
	if (!block) return null;

	// Find the actual insertion point - if block is inside an anchor-heading, insert after the anchor
	let insertionPoint = block;
	const anchorParent = block.parentElement;
	if (anchorParent?.classList.contains('anchor-heading')) {
		insertionPoint = anchorParent;
	}

	// Create portal container after the insertion point
	let portalContainer = insertionPoint.parentElement?.querySelector<HTMLElement>(
		`[data-creating-portal="${blockId}"]`,
	);

	if (!portalContainer) {
		portalContainer = document.createElement('div');
		portalContainer.setAttribute('data-creating-portal', blockId);
		portalContainer.className = 'my-4';
		insertionPoint.parentElement?.insertBefore(portalContainer, insertionPoint.nextSibling);
	}

	return ReactDOM.createPortal(
		<CreatingFeedbackNote
			type={type}
			blockSelector={blockSelector}
			blockContentHash={blockContentHash}
			blockMarkdown={blockMarkdown}
			pagePath={pagePath}
			libraryId={libraryId}
			libraryVersion={libraryVersion}
			onClose={onClose}
		/>,
		portalContainer,
	);
}

// Component for creating new feedback (notes or improvements)
function CreatingFeedbackNote({
	type,
	blockSelector,
	blockContentHash,
	blockMarkdown,
	pagePath,
	libraryId,
	libraryVersion,
	onClose,
}: {
	type: 'note' | 'improvement';
	blockSelector: string;
	blockContentHash?: string;
	blockMarkdown?: string;
	pagePath: string;
	libraryId: string;
	libraryVersion: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [content, setContent] = React.useState('');
	const [isSaving, setIsSaving] = React.useState(false);
	const [error, setError] = React.useState<string | null>(null);
	const textareaRef = React.useRef<HTMLTextAreaElement>(null);

	// Auto-resize textarea and auto-focus
	React.useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.focus();
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
		}
	}, [content]);

	// Theme based on type
	const isImprovement = type === 'improvement';
	const Icon = isImprovement ? Lightbulb : MessageSquare;

	const colors = isImprovement
		? {
				bg: 'bg-yellow-50 dark:bg-yellow-900/20',
				border: 'border-yellow-400 dark:border-yellow-600',
				header: 'bg-yellow-100 dark:bg-yellow-900/30',
				icon: 'text-yellow-600 dark:text-yellow-500 text-[14px]',
				text: 'text-yellow-800 dark:text-yellow-300',
			}
		: {
				bg: 'bg-blue-50 dark:bg-blue-900/20',
				border: 'border-blue-400 dark:border-blue-600',
				header: 'bg-blue-100 dark:bg-blue-900/30',
				icon: 'text-blue-600 dark:text-blue-500 text-[14px]',
				text: 'text-blue-800 dark:text-blue-300',
			};

	const createMutation = useMutation({
		mutationFn: createDocFeedback,
		onMutate: async (variables) => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: ['docFeedback'] });

			// Snapshot the previous value
			const previousData = queryClient.getQueriesData({
				queryKey: ['docFeedback'],
			});

			// Create a temporary optimistic note
			const tempNote: DocFeedback = {
				id: `temp-${Date.now()}`,
				userId: '', // Will be filled by server
				type: variables.data.type,
				content: variables.data.content,
				characterCount: variables.data.content.length,
				pagePath: variables.data.pagePath,
				libraryId: variables.data.libraryId,
				libraryVersion: variables.data.libraryVersion,
				blockSelector: variables.data.blockSelector,
				blockContentHash: variables.data.blockContentHash || null,
				blockMarkdown: variables.data.blockMarkdown || null,
				status: 'pending',
				isDetached: false,
				isCollapsed: false,
				moderatedBy: null,
				moderatedAt: null,
				moderationNote: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			// Optimistically add the note to all matching queries
			queryClient.setQueriesData<{
				userFeedback: DocFeedback[];
				detachedFeedback: any[];
				isModerator: boolean;
			}>({ queryKey: ['docFeedback'] }, (old) => {
				if (!old) return old;
				return {
					...old,
					userFeedback: [tempNote, ...old.userFeedback],
				};
			});

			return { previousData };
		},
		onSuccess: () => {
			onClose();
		},
		onError: (error: Error, variables, context) => {
			// Rollback on error
			if (context?.previousData) {
				context.previousData.forEach(([queryKey, data]) => {
					queryClient.setQueryData(queryKey, data);
				});
			}
			setError(error.message);
			setIsSaving(false);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['docFeedback'] });
		},
	});

	const handleSave = () => {
		// Validate based on type
		if (type === 'improvement' && content.trim().length < 10) {
			setError(
				`Please add ${10 - content.trim().length} more characters. Detailed feedback helps improve the docs!`,
			);
			return;
		}

		if (content.trim().length === 0) {
			setError(`${isImprovement ? 'Improvement' : 'Note'} cannot be empty`);
			return;
		}

		setIsSaving(true);
		setError(null);
		createMutation.mutate({
			data: {
				type,
				content: content.trim(),
				pagePath,
				libraryId,
				libraryVersion,
				blockSelector,
				blockContentHash,
				blockMarkdown,
			},
		});
	};

	const charCount = content.length;
	const points = isImprovement ? (charCount * 0.1).toFixed(1) : '0.0';

	return (
		<div className="w-full transition-all duration-200">
			<div
				className={twMerge(
					colors.bg,
					`border-r-4 ${colors.border}`,
					'rounded-l-lg shadow-lg',
					'overflow-hidden',
					'transition-all duration-200',
				)}
			>
				{/* Error message */}
				{error && (
					<div className="m-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 text-xs">
						{error}
					</div>
				)}

				{/* Header */}
				<div className={`flex items-center justify-between gap-2 p-2 ${colors.header}`}>
					<div className="flex items-center gap-2 flex-1 min-w-0">
						<React.Suspense fallback={<div className={`${colors.icon} text-xs`}>...</div>}>
							<Icon className={`${colors.icon} text-xs shrink-0`} />
						</React.Suspense>
						<span className={`text-xs font-medium ${colors.text}`}>
							{isImprovement ? 'New Improvement' : 'New Note'}
						</span>
					</div>
				</div>

				{/* Content */}
				<div className="p-3">
					{/* Editable textarea */}
					<textarea
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						placeholder={
							isImprovement ? 'Describe what could be improved...' : 'Add your personal note...'
						}
						className={twMerge(
							'w-full px-0 py-0',
							'bg-transparent',
							'border-none',
							'text-sm text-gray-800 dark:text-gray-200',
							'placeholder-gray-400 dark:placeholder-gray-500',
							'focus:outline-none',
							'resize-none overflow-hidden',
							'whitespace-pre-wrap',
						)}
						disabled={isSaving}
					/>

					{/* Character count for improvements */}
					{isImprovement && charCount > 0 && (
						<div className="mt-2 flex items-center justify-between text-xs">
							<div
								className={twMerge(
									'font-medium',
									charCount < 10
										? 'text-red-600 dark:text-red-400'
										: charCount >= 1000
											? 'text-yellow-600 dark:text-yellow-400'
											: 'text-green-600 dark:text-green-400',
								)}
							>
								{charCount < 10 ? (
									<span>{10 - charCount} more characters needed</span>
								) : charCount >= 1000 ? (
									<span>At maximum points</span>
								) : (
									<span>{charCount} characters</span>
								)}
							</div>
							<div className="text-gray-600 dark:text-gray-400">
								<span className="font-semibold text-blue-600 dark:text-blue-400">
									{points} points
								</span>
							</div>
						</div>
					)}

					{/* Action buttons */}
					<div className="flex items-center gap-2 mt-2">
						<button
							onClick={handleSave}
							disabled={isSaving || (isImprovement && charCount < 10) || charCount === 0}
							className={twMerge(
								'px-3 py-1 text-xs font-medium rounded',
								'bg-blue-600 text-white',
								'hover:bg-blue-700',
								'disabled:opacity-50 disabled:cursor-not-allowed',
								'transition-colors duration-150',
								'flex items-center gap-1',
							)}
						>
							{isSaving ? 'Saving...' : 'Save'}
						</button>
						<button
							onClick={onClose}
							disabled={isSaving}
							className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

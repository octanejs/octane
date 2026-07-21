import { useCallback, useEffect, useMemo, useRef, useState } from 'octane';
import { twMerge } from 'tailwind-merge';
import { DocFeedbackFloatingButton } from './DocFeedbackFloatingButton.tsrx';
import { DocFeedbackNote } from './DocFeedbackNote.tsrx';
import { useDocFeedbackRequired } from './DocFeedbackContext.tsrx';
import { getBlockIdentifier } from '~/utils/docFeedback';

interface BlockWithFeedbackProps {
	children: any;
	className?: string;
}

export function BlockWithFeedback({ children, className }: BlockWithFeedbackProps) {
	const blockRef = useRef<HTMLDivElement>(null);
	const [isHovered, setIsHovered] = useState(false);
	const [blockSelector, setBlockSelector] = useState<string | null>(null);
	const [contentHash, setContentHash] = useState<string | undefined>();

	const feedback = useDocFeedbackRequired();

	// Generate block selector on mount
	useEffect(() => {
		if (blockRef.current) {
			// Get the first child element (the actual content block, not our wrapper)
			const contentElement = blockRef.current.firstElementChild as HTMLElement;
			if (contentElement) {
				getBlockIdentifier(contentElement).then((identifier) => {
					setBlockSelector(identifier.selector);
					setContentHash(identifier.contentHash);
				});
			}
		}
	}, []);

	// Find note for this block
	const note = useMemo(() => {
		if (!blockSelector) return null;
		return feedback.userNotes.find((n) => n.blockSelector === blockSelector);
	}, [feedback.userNotes, blockSelector]);

	const hasNote = !!note;

	const handleAddNote = useCallback(() => {
		if (blockSelector) {
			feedback.onAddFeedback(blockSelector, contentHash, 'note');
		}
	}, [blockSelector, contentHash, feedback]);

	const handleAddFeedback = useCallback(() => {
		if (blockSelector) {
			feedback.onAddFeedback(blockSelector, contentHash, 'improvement');
		}
	}, [blockSelector, contentHash, feedback]);

	const handleShowNote = useCallback(() => {
		if (note) {
			feedback.onShowNote(note.id);
		}
	}, [note, feedback]);

	const handleMouseEnter = useCallback(() => {
		setIsHovered(true);
	}, []);

	const handleMouseLeave = useCallback(() => {
		setIsHovered(false);
	}, []);

	return <>
		<div
			ref={blockRef}
			class={twMerge(
				'relative doc-feedback-block',
				isHovered && 'doc-feedback-block-highlighted',
				className,
			)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			data-feedback-wrapper="true"
			style={{
				anchorName: blockSelector
					? `--feedback-${blockSelector.replace(/[^a-zA-Z0-9]/g, '-')}`
					: undefined,
			}}
		>
			{children}

			{/* Floating button */}
			{blockSelector &&
				<div
					class={twMerge(
						'absolute top-0 right-0 -translate-y-full z-50 transition-opacity duration-200',
						hasNote || isHovered ? 'opacity-100' : 'opacity-0',
					)}
				>
					<DocFeedbackFloatingButton
						onAddNote={handleAddNote}
						onAddFeedback={handleAddFeedback}
						onMouseEnter={handleMouseEnter}
						onMouseLeave={handleMouseLeave}
						hasNote={hasNote}
						onShowNote={handleShowNote}
					/>
				</div>}
		</div>

		{/* Note display - inline in document flow */}
		{note && blockSelector &&
			<div class="my-4">
				<DocFeedbackNote note={note} anchorName="" inline={true} />
			</div>}
	</>;
}

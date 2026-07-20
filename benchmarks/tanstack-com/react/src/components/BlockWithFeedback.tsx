import * as React from 'react';
import { twMerge } from 'tailwind-merge';
import { DocFeedbackFloatingButton } from './DocFeedbackFloatingButton';
import { DocFeedbackNote } from './DocFeedbackNote';
import { useDocFeedbackRequired } from './DocFeedbackContext';
import { getBlockIdentifier } from '~/utils/docFeedback';

interface BlockWithFeedbackProps {
	children: React.ReactNode;
	className?: string;
}

export function BlockWithFeedback({ children, className }: BlockWithFeedbackProps) {
	const blockRef = React.useRef<HTMLDivElement>(null);
	const [isHovered, setIsHovered] = React.useState(false);
	const [blockSelector, setBlockSelector] = React.useState<string | null>(null);
	const [contentHash, setContentHash] = React.useState<string | undefined>();

	const feedback = useDocFeedbackRequired();

	// Generate block selector on mount
	React.useEffect(() => {
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
	const note = React.useMemo(() => {
		if (!blockSelector) return null;
		return feedback.userNotes.find((n) => n.blockSelector === blockSelector);
	}, [feedback.userNotes, blockSelector]);

	const hasNote = !!note;

	const handleAddNote = React.useCallback(() => {
		if (blockSelector) {
			feedback.onAddFeedback(blockSelector, contentHash, 'note');
		}
	}, [blockSelector, contentHash, feedback]);

	const handleAddFeedback = React.useCallback(() => {
		if (blockSelector) {
			feedback.onAddFeedback(blockSelector, contentHash, 'improvement');
		}
	}, [blockSelector, contentHash, feedback]);

	const handleShowNote = React.useCallback(() => {
		if (note) {
			feedback.onShowNote(note.id);
		}
	}, [note, feedback]);

	const handleMouseEnter = React.useCallback(() => {
		setIsHovered(true);
	}, []);

	const handleMouseLeave = React.useCallback(() => {
		setIsHovered(false);
	}, []);

	return (
		<>
			<div
				ref={blockRef}
				className={twMerge(
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
				{blockSelector && (
					<div
						className={twMerge(
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
					</div>
				)}
			</div>

			{/* Note display - inline in document flow */}
			{note && blockSelector && (
				<div className="my-4">
					<DocFeedbackNote note={note} anchorName="" inline={true} />
				</div>
			)}
		</>
	);
}

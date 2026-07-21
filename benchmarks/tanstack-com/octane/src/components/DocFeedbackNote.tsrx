import { useEffect, useRef, useState } from 'octane';
import { twMerge } from 'tailwind-merge';
import { useMutation, useQueryClient } from '@octanejs/tanstack-query';
import {
	deleteDocFeedback,
	updateDocFeedback,
	updateDocFeedbackCollapsed,
} from '~/utils/docFeedback.functions';
import type { DocFeedback } from '~/db/types';
import { ChevronDown, ChevronUp, Lightbulb, MessageSquare, Save, Trash, X } from '@octanejs/lucide';

interface DocFeedbackNoteProps {
	note: DocFeedback;
	anchorName: string;
	inline?: boolean;
}

// Types for the query cache data structures
interface DocPageCacheData {
	userFeedback: DocFeedback[];
}

interface AccountPageCacheData {
	feedback: DocFeedback[];
}

type DocFeedbackCacheData = DocPageCacheData | AccountPageCacheData | unknown;

export function DocFeedbackNote({ note, anchorName, inline = false }: DocFeedbackNoteProps) {
	const queryClient = useQueryClient();
	const [isDeleting, setIsDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const [content, setContent] = useState(note.content);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Track if content has been modified
	const hasChanges = content !== note.content;

	// Theme based on type
	const isImprovement = note.type === 'improvement';
	const Icon = isImprovement ? Lightbulb : MessageSquare;
	const colors =
		isImprovement
			? {
					bg: 'bg-yellow-50 dark:bg-yellow-900/20',
					border: 'border-yellow-400 dark:border-yellow-600',
					header: 'bg-yellow-100 dark:bg-yellow-900/30',
					icon: 'text-yellow-600 dark:text-yellow-500 text-[14px]',
					text: 'text-yellow-800 dark:text-yellow-300',
					timestamp: 'text-yellow-700 dark:text-yellow-400',
					deleteHover: 'hover:text-yellow-600 dark:hover:text-yellow-400',
				}
			: {
					bg: 'bg-blue-50 dark:bg-blue-900/20',
					border: 'border-blue-400 dark:border-blue-600',
					header: 'bg-blue-100 dark:bg-blue-900/30',
					icon: 'text-blue-600 dark:text-blue-500 text-[14px]',
					text: 'text-blue-800 dark:text-blue-300',
					timestamp: 'text-blue-700 dark:text-blue-400',
					deleteHover: 'hover:text-blue-600 dark:hover:text-blue-400',
				};

	// Auto-resize textarea to fit content
	useEffect(() => {
		if (textareaRef.current && !note.isCollapsed) {
			textareaRef.current.style.height = 'auto';
			textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
		}
	}, [content, note.isCollapsed]);

	// Extract first line for preview
	const firstLine = note.content.split('\n')[0];
	const preview =
		firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;

	const deleteMutation = useMutation({
		mutationFn: deleteDocFeedback,
		onMutate: async () => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: ['docFeedback'] });

			// Snapshot the previous value
			const previousData = queryClient.getQueriesData({
				queryKey: ['docFeedback'],
			});

			// Optimistically remove the note from all matching queries
			queryClient.setQueriesData({ queryKey: ['docFeedback'] }, (old: DocFeedbackCacheData) => {
				if (!old || typeof old !== 'object') return old;

				// Handle doc page structure (userFeedback)
				if ('userFeedback' in old && Array.isArray(old.userFeedback)) {
					return {
						...old,
						userFeedback: old.userFeedback.filter((f: DocFeedback) => f.id !== note.id),
					};
				}

				// Handle account/notes page structure (feedback)
				if ('feedback' in old && Array.isArray(old.feedback)) {
					return {
						...old,
						feedback: old.feedback.filter((f: DocFeedback) => f.id !== note.id),
					};
				}

				return old;
			});

			return { previousData };
		},
		onError: (error: Error, variables, context) => {
			// Rollback on error
			if (context?.previousData) {
				context.previousData.forEach(([queryKey, data]) => {
					queryClient.setQueryData(queryKey, data);
				});
			}
			setDeleteError(error.message);
			setIsDeleting(false);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['docFeedback'] });
		},
	});

	const updateMutation = useMutation({
		mutationFn: updateDocFeedback,
		onMutate: async (variables) => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: ['docFeedback'] });

			// Snapshot the previous value
			const previousData = queryClient.getQueriesData({
				queryKey: ['docFeedback'],
			});

			// Optimistically update the note content
			queryClient.setQueriesData({ queryKey: ['docFeedback'] }, (old: DocFeedbackCacheData) => {
				if (!old || typeof old !== 'object') return old;

				// Handle doc page structure (userFeedback)
				if ('userFeedback' in old && Array.isArray(old.userFeedback)) {
					return {
						...old,
						userFeedback: old.userFeedback.map(
							(f: DocFeedback) => f.id === note.id
								? {
										...f,
										content: variables.data.content,
										updatedAt: new Date(),
									}
								: f,
						),
					};
				}

				// Handle account/notes page structure (feedback)
				if ('feedback' in old && Array.isArray(old.feedback)) {
					return {
						...old,
						feedback: old.feedback.map(
							(f: DocFeedback) => f.id === note.id
								? {
										...f,
										content: variables.data.content,
										updatedAt: new Date(),
									}
								: f,
						),
					};
				}

				return old;
			});

			return { previousData };
		},
		onSuccess: () => {
			setIsSaving(false);
			setSaveError(null);
		},
		onError: (error: Error, variables, context) => {
			// Rollback on error
			if (context?.previousData) {
				context.previousData.forEach(([queryKey, data]) => {
					queryClient.setQueryData(queryKey, data);
				});
			}
			setSaveError(error.message);
			setIsSaving(false);
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['docFeedback'] });
		},
	});

	const collapsedMutation = useMutation({
		mutationFn: updateDocFeedbackCollapsed,
		onMutate: async (variables) => {
			// Cancel any outgoing refetches
			await queryClient.cancelQueries({ queryKey: ['docFeedback'] });

			// Snapshot the previous value
			const previousData = queryClient.getQueriesData({
				queryKey: ['docFeedback'],
			});

			// Optimistically toggle collapsed state
			queryClient.setQueriesData({ queryKey: ['docFeedback'] }, (old: DocFeedbackCacheData) => {
				if (!old || typeof old !== 'object') return old;

				// Handle doc page structure (userFeedback)
				if ('userFeedback' in old && Array.isArray(old.userFeedback)) {
					return {
						...old,
						userFeedback: old.userFeedback.map(
							(f: DocFeedback) => f.id === note.id
								? { ...f, isCollapsed: variables.data.isCollapsed }
								: f,
						),
					};
				}

				// Handle account/notes page structure (feedback)
				if ('feedback' in old && Array.isArray(old.feedback)) {
					return {
						...old,
						feedback: old.feedback.map(
							(f: DocFeedback) => f.id === note.id
								? { ...f, isCollapsed: variables.data.isCollapsed }
								: f,
						),
					};
				}

				return old;
			});

			return { previousData };
		},
		onError: (error, variables, context) => {
			// Rollback on error
			if (context?.previousData) {
				context.previousData.forEach(([queryKey, data]) => {
					queryClient.setQueryData(queryKey, data);
				});
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['docFeedback'] });
		},
	});

	const handleToggle = () => {
		collapsedMutation.mutate({
			data: {
				feedbackId: note.id,
				isCollapsed: !note.isCollapsed,
			},
		});
	};

	const handleDelete = () => {
		if (!isDeleting && confirm('Are you sure you want to delete this note?')) {
			setIsDeleting(true);
			setDeleteError(null);
			deleteMutation.mutate({ data: { feedbackId: note.id } });
		}
	};

	const handleSave = () => {
		if (content.trim().length === 0) {
			setSaveError('Note cannot be empty');
			return;
		}

		setIsSaving(true);
		setSaveError(null);
		updateMutation.mutate({
			data: {
				feedbackId: note.id,
				content: content.trim(),
			},
		});
	};

	const handleCancel = () => {
		setContent(note.content);
		setSaveError(null);
	};

	const handleContentChange = (e: any) => {
		setContent(e.target.value);
		setSaveError(null);
	};

	return <div
		class={twMerge(
			inline ? 'w-full' : 'fixed z-40 w-80 max-w-[calc(100vw-2rem)]',
			'transition-all duration-200',
		)}
		style={inline
			? undefined
			: {
					positionAnchor: anchorName,
					top: 'anchor(top)',
					left: 'anchor(right)',
					marginLeft: '0.5rem',
				}}
		onClick={(e) => e.stopPropagation()}
		onMouseDown={(e) => e.stopPropagation()}
	>
		<div
			class={twMerge(
				colors.bg,
				`border-r-4 ${colors.border}`,
				'rounded-l-lg shadow-lg',
				'overflow-hidden',
				'transition-all duration-200',
				isDeleting && 'opacity-50',
			)}
		>
			{/* Error messages */}
			{(deleteError || saveError) &&
				<div
					class="m-2 p-2 rounded bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 text-xs"
				>
					{deleteError || saveError}
				</div>}

			{/* Header - always visible */}
			<div
				class={twMerge(
					`flex flex-col gap-1 p-2 ${colors.header}`,
					note.isCollapsed && 'cursor-pointer hover:opacity-80 transition-opacity',
				)}
				onClick={note.isCollapsed ? handleToggle : undefined}
			>
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2 flex-1 min-w-0">
						<Icon className={`${colors.icon} text-xs shrink-0`} />
						<span class={`text-xs font-medium ${colors.text} truncate`}>
							{isImprovement ? 'Your Improvement' : 'Your Note'}
						</span>
						{isImprovement && note.status &&
							<span
								class={twMerge(
									'text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide shrink-0',
									note.status === 'approved' &&
										'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
									note.status === 'denied' &&
										'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
									note.status === 'pending' &&
										'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
								)}
							>{note.status}</span>}
					</div>
					<div class="flex items-center gap-1 shrink-0">
						{!note.isCollapsed &&
							<>
								<button
									onClick={(e) => {
										e.stopPropagation();
										handleDelete();
									}}
									class={`p-1 ${colors.icon} hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50`}
									title={isImprovement ? 'Delete improvement' : 'Delete note'}
									disabled={isDeleting || isSaving}
								>
									<Trash className="text-xs" />
								</button>
							</>}
						<button
							onClick={(e) => {
								e.stopPropagation();
								handleToggle();
							}}
							class={`p-1 ${colors.icon} ${colors.deleteHover} transition-colors`}
							title={note.isCollapsed
								? `Expand ${isImprovement ? 'improvement' : 'note'}`
								: `Collapse ${isImprovement ? 'improvement' : 'note'}`}
						>
							{note.isCollapsed
								? <ChevronDown className="text-xs" />
								: <ChevronUp className="text-xs" />}
						</button>
					</div>
				</div>
				{/* Preview when collapsed */}
				{note.isCollapsed &&
					<div class={`text-xs ${colors.text} opacity-70 truncate`}>{preview}</div>}
			</div>

			{/* Content - collapsible */}
			{!note.isCollapsed &&
				<div class="p-3">
					{/* Editable textarea */}
					<textarea
						ref={textareaRef}
						value={content}
						onInput={handleContentChange}
						class={twMerge(
							'w-full px-0 py-0',
							'bg-transparent',
							'border-none',
							'text-sm text-gray-800 dark:text-gray-200',
							'focus:outline-none',
							'resize-none overflow-hidden',
							'whitespace-pre-wrap',
						)}
						disabled={isSaving || isDeleting}
					/>

					{/* Action buttons when content changes */}
					{hasChanges &&
						<div class="flex items-center gap-2 mt-2">
							<button
								onClick={handleSave}
								class={twMerge(
									'px-3 py-1 text-xs font-medium rounded',
									'bg-blue-600 text-white',
									'hover:bg-blue-700',
									'disabled:opacity-50 disabled:cursor-not-allowed',
									'transition-colors duration-150',
									'flex items-center gap-1',
								)}
								disabled={isSaving}
							>
								<Save className="text-[10px]" />
								{isSaving ? 'Saving...' : 'Save'}
							</button>
							<button
								onClick={handleCancel}
								class="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
								disabled={isSaving}
							>
								<X className="inline text-[10px] mr-1" />
								Cancel
							</button>
						</div>}

					{/* Timestamp and Points */}
					<div class={`mt-2 flex items-center justify-between text-xs ${colors.timestamp}`}>
						<div>{new Date(note.createdAt).toLocaleDateString('en-US', {
							month: 'short',
							day: 'numeric',
							year: 'numeric',
						})}</div>
						{isImprovement &&
							<div class="font-medium">
								<span class="text-blue-600 dark:text-blue-400">
									{(note.content.length * 0.1).toFixed(1) as string}
									points
								</span>
							</div>}
					</div>
				</div>}
		</div>
	</div>;
}

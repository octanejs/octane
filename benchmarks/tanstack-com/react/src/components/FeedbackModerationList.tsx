import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import {
	Table,
	TableHeader,
	TableHeaderRow,
	TableHeaderCell,
	TableBody,
	TableRow,
	TableCell,
} from './TableComponents';
import { PaginationControls } from './PaginationControls';
import { Spinner } from './Spinner';
import type { DocFeedback } from '~/db/types';
import { calculatePoints } from '~/utils/docFeedback.shared';
import { getRowFieldId } from '~/utils/route-encoding';
import { Check, Lightbulb, TriangleAlert } from 'lucide-react';
import { MessageSquare, X } from 'lucide-react';
import { Badge, Button } from '~/ui';

interface FeedbackModerationListProps {
	data:
		| {
				feedback: Array<{
					feedback: DocFeedback;
					user: {
						id: string;
						name: string | null;
						email: string;
						image: string | null;
					} | null;
				}>;
				pagination: {
					page: number;
					pageSize: number;
					total: number;
					totalPages: number;
				};
		  }
		| undefined;
	isLoading: boolean;
	error: Error | null;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	onModerate: (feedbackId: string, action: 'approve' | 'deny', note?: string) => void;
	isModeratingId?: string;
}

export function FeedbackModerationList({
	data,
	isLoading,
	error,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	onModerate,
	isModeratingId,
}: FeedbackModerationListProps) {
	const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
	const [moderationNotes, setModerationNotes] = React.useState<Record<string, string>>({});

	const toggleExpanded = (id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleModerationNoteChange = (feedbackId: string, note: string) => {
		setModerationNotes((prev) => ({ ...prev, [feedbackId]: note }));
	};

	const handleModerate = (feedbackId: string, action: 'approve' | 'deny') => {
		const note = moderationNotes[feedbackId];
		onModerate(feedbackId, action, note);
		// Clear note after submission
		setModerationNotes((prev) => {
			const next = { ...prev };
			delete next[feedbackId];
			return next;
		});
	};

	if (error) {
		return (
			<div className="p-8 text-center">
				<p className="text-red-600 dark:text-red-400">Failed to load feedback: {error.message}</p>
			</div>
		);
	}

	const feedbackList = data?.feedback || [];
	const pagination = data?.pagination || {
		page: 1,
		pageSize: 50,
		total: 0,
		totalPages: 0,
	};

	if (isLoading) {
		return (
			<div className="text-center py-12">
				<Spinner className="text-3xl" />
				<p className="mt-4 text-gray-600 dark:text-gray-400">Loading feedback...</p>
			</div>
		);
	}

	if (feedbackList.length === 0) {
		return (
			<div className="text-center py-12">
				<p className="text-gray-600 dark:text-gray-400">
					No feedback found matching the current filters.
				</p>
			</div>
		);
	}

	return (
		<>
			<Table>
				<TableHeader>
					<TableHeaderRow>
						<TableHeaderCell className="w-12">#</TableHeaderCell>
						<TableHeaderCell className="w-24">Type</TableHeaderCell>
						<TableHeaderCell className="w-24">Status</TableHeaderCell>
						<TableHeaderCell>User</TableHeaderCell>
						<TableHeaderCell>Library</TableHeaderCell>
						<TableHeaderCell className="w-20">Points</TableHeaderCell>
						<TableHeaderCell className="w-32">Date</TableHeaderCell>
						<TableHeaderCell className="w-40">Actions</TableHeaderCell>
					</TableHeaderRow>
				</TableHeader>
				<TableBody>
					{feedbackList.map((entry, index) => {
						const { feedback, user } = entry;
						const isExpanded = expandedIds.has(feedback.id);
						const isPending = feedback.status === 'pending';
						const isModeratingThis = isModeratingId === feedback.id;
						const moderationNoteId = getRowFieldId('feedback-moderation', feedback.id, 'note');

						return (
							<React.Fragment key={feedback.id}>
								<TableRow
									className={twMerge(
										'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700',
										feedback.isDetached && 'bg-yellow-50 dark:bg-yellow-900/10',
									)}
									onClick={() => toggleExpanded(feedback.id)}
								>
									<TableCell className="font-mono text-xs">
										<Link
											to="/admin/feedback/$id"
											params={{ id: feedback.id }}
											className="hover:text-blue-600 dark:hover:text-blue-400"
											onClick={(e) => e.stopPropagation()}
										>
											{(page - 1) * pageSize + index + 1}
										</Link>
									</TableCell>
									<TableCell>
										<Link
											to="/admin/feedback/$id"
											params={{ id: feedback.id }}
											className="flex items-center gap-2 hover:opacity-80"
											onClick={(e) => e.stopPropagation()}
										>
											{feedback.type === 'note' ? (
												<MessageSquare className="text-blue-500" />
											) : (
												<Lightbulb className="text-yellow-500" />
											)}
											<span className="text-xs">
												{feedback.type === 'note' ? 'Note' : 'Improvement'}
											</span>
										</Link>
									</TableCell>
									<TableCell>
										<Badge
											variant={
												feedback.status === 'pending'
													? 'warning'
													: feedback.status === 'approved'
														? 'success'
														: 'error'
											}
										>
											{feedback.status.charAt(0).toUpperCase() + feedback.status.slice(1)}
										</Badge>
									</TableCell>
									<TableCell>
										<div>
											<div className="font-medium text-sm">{user?.name || 'Unknown'}</div>
											<div className="text-xs text-gray-500">{user?.email}</div>
										</div>
									</TableCell>
									<TableCell>
										<span className="text-sm font-mono">{feedback.libraryId}</span>
										{feedback.isDetached && (
											<div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 mt-1">
												<TriangleAlert />
												Detached
											</div>
										)}
									</TableCell>
									<TableCell className="text-right font-semibold">
										{calculatePoints(feedback.characterCount, feedback.type).toFixed(1)}
									</TableCell>
									<TableCell className="text-xs text-gray-600 dark:text-gray-400">
										{new Date(feedback.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell onClick={(e) => e.stopPropagation()}>
										{isPending && !isModeratingThis && (
											<div className="flex gap-2">
												<Button
													variant="icon"
													color="green"
													size="icon-sm"
													onClick={() => handleModerate(feedback.id, 'approve')}
													title="Approve"
												>
													<Check />
												</Button>
												<Button
													variant="icon"
													color="red"
													size="icon-sm"
													onClick={() => handleModerate(feedback.id, 'deny')}
													title="Deny"
												>
													<X />
												</Button>
											</div>
										)}
										{isModeratingThis && <div className="text-xs text-gray-500">Processing...</div>}
										{!isPending && (
											<div className="text-xs text-gray-500">
												{feedback.status === 'approved' ? 'Approved' : 'Denied'}
											</div>
										)}
									</TableCell>
								</TableRow>
								{isExpanded && (
									<TableRow>
										<TableCell colSpan={8} className="bg-gray-50 dark:bg-gray-900">
											<div className="p-4 space-y-4">
												{/* Original Block Content */}
												{feedback.blockMarkdown && (
													<div>
														<h4 className="text-sm font-semibold mb-2">Original Block Content:</h4>
														<div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 font-mono text-xs max-h-40 overflow-auto">
															{feedback.blockMarkdown}
														</div>
													</div>
												)}

												{/* Feedback */}
												<div>
													<h4 className="text-sm font-semibold mb-2">Feedback:</h4>
													<div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
														{feedback.content}
													</div>
												</div>

												{/* Location */}
												<div>
													<h4 className="text-sm font-semibold mb-2">Location:</h4>
													<div className="text-xs space-y-1">
														<div>
															<span className="text-gray-600 dark:text-gray-400">Path:</span>{' '}
															<span className="font-mono">{feedback.pagePath}</span>
														</div>
														<div>
															<span className="text-gray-600 dark:text-gray-400">Version:</span>{' '}
															<span className="font-mono">{feedback.libraryVersion}</span>
														</div>
														<div>
															<span className="text-gray-600 dark:text-gray-400">Selector:</span>{' '}
															<span className="font-mono text-xs">{feedback.blockSelector}</span>
														</div>
													</div>
												</div>

												{/* Moderation Note Input (for pending only) */}
												{isPending && (
													<div>
														<label
															htmlFor={moderationNoteId}
															className="block text-sm font-semibold mb-2"
														>
															Internal Moderation Note (optional):
														</label>
														<textarea
															id={moderationNoteId}
															value={moderationNotes[feedback.id] || ''}
															onChange={(e) =>
																handleModerationNoteChange(feedback.id, e.target.value)
															}
															placeholder="Add an internal note about this moderation decision..."
															className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
															rows={2}
														/>
													</div>
												)}

												{/* Existing Moderation Info */}
												{!isPending && feedback.moderatedBy && (
													<div>
														<h4 className="text-sm font-semibold mb-2">Moderation Info:</h4>
														<div className="text-xs space-y-1">
															<div>
																<span className="text-gray-600 dark:text-gray-400">
																	Moderated at:
																</span>{' '}
																{feedback.moderatedAt &&
																	new Date(feedback.moderatedAt).toLocaleString()}
															</div>
															{feedback.moderationNote && (
																<div>
																	<span className="text-gray-600 dark:text-gray-400">Note:</span>{' '}
																	{feedback.moderationNote}
																</div>
															)}
														</div>
													</div>
												)}
											</div>
										</TableCell>
									</TableRow>
								)}
							</React.Fragment>
						);
					})}
				</TableBody>
			</Table>

			<PaginationControls
				currentPage={page - 1}
				totalPages={pagination.totalPages}
				totalItems={pagination.total}
				pageSize={pageSize}
				pageSizeOptions={[25, 50, 100]}
				onPageChange={(newPage) => onPageChange(newPage + 1)}
				onPageSizeChange={onPageSizeChange}
				canGoPrevious={page > 1}
				canGoNext={page < pagination.totalPages}
				showPageSizeSelector={true}
				itemLabel="feedback items"
				sticky
			/>
		</>
	);
}

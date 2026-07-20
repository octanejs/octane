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
import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Badge } from '~/ui';

interface NotesModerationListProps {
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
}

export function NotesModerationList({
	data,
	isLoading,
	error,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
}: NotesModerationListProps) {
	const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

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

	if (error) {
		return (
			<div className="p-8 text-center">
				<p className="text-red-600 dark:text-red-400">Failed to load notes: {error.message}</p>
			</div>
		);
	}

	const notesList = data?.feedback || [];
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
				<p className="mt-4 text-gray-600 dark:text-gray-400">Loading notes...</p>
			</div>
		);
	}

	if (notesList.length === 0) {
		return (
			<div className="text-center py-12">
				<p className="text-gray-600 dark:text-gray-400">
					No notes found matching the current filters.
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
						<TableHeaderCell className="w-24">Status</TableHeaderCell>
						<TableHeaderCell className="w-48">User</TableHeaderCell>
						<TableHeaderCell>Content Preview</TableHeaderCell>
						<TableHeaderCell className="w-32">Library</TableHeaderCell>
						<TableHeaderCell className="w-20">Chars</TableHeaderCell>
						<TableHeaderCell className="w-20">Points</TableHeaderCell>
						<TableHeaderCell className="w-40">Date</TableHeaderCell>
						<TableHeaderCell className="w-24">Actions</TableHeaderCell>
					</TableHeaderRow>
				</TableHeader>
				<TableBody>
					{notesList.map((entry, index) => {
						const { feedback, user } = entry;
						const isExpanded = expandedIds.has(feedback.id);
						const contentPreview =
							feedback.content.slice(0, 100) + (feedback.content.length > 100 ? '...' : '');
						const charCount = feedback.content.length;

						// Status badge variant mapping
						const statusVariants = {
							pending: 'warning',
							approved: 'success',
							denied: 'error',
						} as const;

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
										{(page - 1) * pageSize + index + 1}
									</TableCell>
									<TableCell>
										<Badge variant={statusVariants[feedback.status]}>{feedback.status}</Badge>
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-2">
											{user?.image && (
												<img
													src={user.image}
													alt={user.name || 'User'}
													className="w-8 h-8 rounded-full"
												/>
											)}
											<div>
												<div className="font-medium text-sm">{user?.name || 'Unknown'}</div>
												<div className="text-xs text-gray-500">{user?.email}</div>
											</div>
										</div>
									</TableCell>
									<TableCell>
										<div className="text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
											{contentPreview}
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
									<TableCell className="text-right text-xs text-gray-600 dark:text-gray-400">
										{charCount}
									</TableCell>
									<TableCell className="text-right font-semibold">
										{calculatePoints(feedback.characterCount, feedback.type).toFixed(1)}
									</TableCell>
									<TableCell className="text-xs text-gray-600 dark:text-gray-400">
										<div>{new Date(feedback.createdAt).toLocaleDateString()}</div>
										<div className="text-[10px] text-gray-500">
											{new Date(feedback.createdAt).toLocaleTimeString([], {
												hour: '2-digit',
												minute: '2-digit',
											})}
										</div>
									</TableCell>
									<TableCell onClick={(e) => e.stopPropagation()}>
										<Link
											to={feedback.pagePath}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
										>
											<ExternalLink className="text-[10px]" />
											View Doc
										</Link>
									</TableCell>
								</TableRow>
								{isExpanded && (
									<TableRow>
										<TableCell colSpan={9} className="bg-gray-50 dark:bg-gray-900">
											<div className="p-4 space-y-4">
												{/* Content */}
												<div>
													<h4 className="text-sm font-semibold mb-2">Content:</h4>
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
				itemLabel="notes"
				sticky
			/>
		</>
	);
}

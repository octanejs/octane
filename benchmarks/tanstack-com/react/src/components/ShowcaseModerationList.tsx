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
import type { Showcase } from '~/db/types';
import { Check, X, Star, ExternalLink, Trash2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { libraries } from '~/libraries';
import { Badge, Button } from '~/ui';
import { getRowFieldId } from '~/utils/route-encoding';
import { Fragment, useState } from 'react';

interface ShowcaseModerationListProps {
	data:
		| {
				showcases: Array<{
					showcase: Showcase;
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
	onModerate: (showcaseId: string, action: 'approve' | 'deny', note?: string) => void;
	onToggleFeatured: (showcaseId: string, isFeatured: boolean) => void;
	onDelete: (showcaseId: string) => void;
	onVote: (showcaseId: string, value: 1 | -1) => void;
	isModeratingId?: string;
}

const libraryMap = new Map(libraries.map((lib) => [lib.id as string, lib]));

export function ShowcaseModerationList({
	data,
	isLoading,
	error,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	onModerate,
	onToggleFeatured,
	onDelete,
	onVote,
	isModeratingId,
}: ShowcaseModerationListProps) {
	const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
	const [moderationNotes, setModerationNotes] = useState<Record<string, string>>({});

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

	const handleModerationNoteChange = (showcaseId: string, note: string) => {
		setModerationNotes((prev) => ({ ...prev, [showcaseId]: note }));
	};

	const handleModerate = (showcaseId: string, action: 'approve' | 'deny') => {
		const note = moderationNotes[showcaseId];
		onModerate(showcaseId, action, note);
		setModerationNotes((prev) => {
			const next = { ...prev };
			delete next[showcaseId];
			return next;
		});
	};

	if (error) {
		return (
			<div className="p-8 text-center">
				<p className="text-red-600 dark:text-red-400">Failed to load showcases: {error.message}</p>
			</div>
		);
	}

	const showcaseList = data?.showcases || [];
	const pagination = data?.pagination || {
		page: 1,
		pageSize: 50,
		total: 0,
		totalPages: 0,
	};

	// Compute display rank for approved showcases based on actual display order:
	// 1. Featured first, 2. Vote score desc, 3. Tranco rank asc (nulls last), 4. Created date desc
	const approvedShowcases = showcaseList
		.filter((e) => e.showcase.status === 'approved')
		.sort((a, b) => {
			// Featured first
			if (a.showcase.isFeatured !== b.showcase.isFeatured) {
				return a.showcase.isFeatured ? -1 : 1;
			}
			// Vote score desc
			if (a.showcase.voteScore !== b.showcase.voteScore) {
				return b.showcase.voteScore - a.showcase.voteScore;
			}
			// Tranco rank asc (nulls last)
			const aRank = a.showcase.trancoRank;
			const bRank = b.showcase.trancoRank;
			if (aRank !== bRank) {
				if (aRank === null) return 1;
				if (bRank === null) return -1;
				return aRank - bRank;
			}
			// Created date desc
			return new Date(b.showcase.createdAt).getTime() - new Date(a.showcase.createdAt).getTime();
		});

	const displayRankMap = new Map<string, number>();
	approvedShowcases.forEach((entry, index) => {
		displayRankMap.set(entry.showcase.id, index + 1);
	});

	if (isLoading) {
		return (
			<div className="text-center py-12">
				<Spinner className="text-3xl" />
				<p className="mt-4 text-gray-600 dark:text-gray-400">Loading showcases...</p>
			</div>
		);
	}

	if (showcaseList.length === 0) {
		return (
			<div className="text-center py-12">
				<p className="text-gray-600 dark:text-gray-400">
					No projects found matching the current filters.
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
						<TableHeaderCell>Project</TableHeaderCell>
						<TableHeaderCell className="w-24">Status</TableHeaderCell>
						<TableHeaderCell>User</TableHeaderCell>
						<TableHeaderCell>Libraries</TableHeaderCell>
						<TableHeaderCell className="w-20">Featured</TableHeaderCell>
						<TableHeaderCell className="w-20">Votes</TableHeaderCell>
						<TableHeaderCell className="w-20">Display</TableHeaderCell>
						<TableHeaderCell className="w-24">Tranco</TableHeaderCell>
						<TableHeaderCell className="w-32">Date</TableHeaderCell>
						<TableHeaderCell className="w-40">Actions</TableHeaderCell>
					</TableHeaderRow>
				</TableHeader>
				<TableBody>
					{showcaseList.map((entry, index) => {
						const { showcase, user } = entry;
						const isExpanded = expandedIds.has(showcase.id);
						const isPending = showcase.status === 'pending';
						const isModeratingThis = isModeratingId === showcase.id;
						const moderationNoteId = getRowFieldId('showcase-moderation', showcase.id, 'note');

						return (
							<Fragment key={showcase.id}>
								<TableRow
									className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
									onClick={() => toggleExpanded(showcase.id)}
								>
									<TableCell className="font-mono text-xs">
										{(page - 1) * pageSize + index + 1}
									</TableCell>
									<TableCell>
										<div className="flex items-center gap-3">
											{showcase.logoUrl && (
												<img
													src={showcase.logoUrl}
													alt=""
													className="w-8 h-8 rounded object-cover"
												/>
											)}
											<div>
												<Link
													to="/admin/showcases/$id"
													params={{ id: showcase.id }}
													className="font-medium text-sm hover:text-blue-600 dark:hover:text-blue-400"
													onClick={(e) => e.stopPropagation()}
												>
													{showcase.name}
												</Link>
												<div className="text-xs text-gray-500 truncate max-w-[200px]">
													{showcase.tagline}
												</div>
											</div>
										</div>
									</TableCell>
									<TableCell>
										<Badge
											variant={
												showcase.status === 'pending'
													? 'warning'
													: showcase.status === 'approved'
														? 'success'
														: 'error'
											}
										>
											{showcase.status.charAt(0).toUpperCase() + showcase.status.slice(1)}
										</Badge>
									</TableCell>
									<TableCell>
										<div>
											<div className="font-medium text-sm">{user?.name || 'Unknown'}</div>
											<div className="text-xs text-gray-500">{user?.email}</div>
										</div>
									</TableCell>
									<TableCell>
										<div className="flex flex-wrap gap-1">
											{showcase.libraries.slice(0, 3).map((libId) => {
												const lib = libraryMap.get(libId);
												return (
													<span
														key={libId}
														className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700"
													>
														{lib?.name || libId}
													</span>
												);
											})}
											{showcase.libraries.length > 3 && (
												<span className="px-1.5 py-0.5 text-xs rounded bg-gray-100 dark:bg-gray-700">
													+{showcase.libraries.length - 3}
												</span>
											)}
										</div>
									</TableCell>
									<TableCell onClick={(e) => e.stopPropagation()}>
										<button
											onClick={() => onToggleFeatured(showcase.id, !showcase.isFeatured)}
											className={twMerge(
												'p-1.5 rounded transition-colors',
												showcase.isFeatured
													? 'text-yellow-500 hover:bg-yellow-100 dark:hover:bg-yellow-900/30'
													: 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700',
											)}
											title={showcase.isFeatured ? 'Remove from featured' : 'Add to featured'}
										>
											<Star className={twMerge('w-4 h-4', showcase.isFeatured && 'fill-current')} />
										</button>
									</TableCell>
									<TableCell onClick={(e) => e.stopPropagation()}>
										<div className="flex items-center gap-0.5">
											<button
												onClick={() => onVote(showcase.id, 1)}
												className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
												title="Upvote"
											>
												<ThumbsUp className="w-3.5 h-3.5" />
											</button>
											<span
												className={twMerge(
													'text-xs font-medium min-w-[24px] text-center',
													showcase.voteScore > 0 && 'text-emerald-600 dark:text-emerald-400',
													showcase.voteScore < 0 && 'text-red-600 dark:text-red-400',
													showcase.voteScore === 0 && 'text-gray-400 dark:text-gray-500',
												)}
											>
												{showcase.voteScore > 0 ? '+' : ''}
												{showcase.voteScore}
											</span>
											<button
												onClick={() => onVote(showcase.id, -1)}
												className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
												title="Downvote"
											>
												<ThumbsDown className="w-3.5 h-3.5" />
											</button>
										</div>
									</TableCell>
									<TableCell className="text-xs">
										{showcase.status === 'approved' ? (
											<span className="font-medium text-blue-600 dark:text-blue-400">
												#{displayRankMap.get(showcase.id)}
											</span>
										) : (
											<span className="text-gray-400">-</span>
										)}
									</TableCell>
									<TableCell className="text-xs text-gray-600 dark:text-gray-400">
										{showcase.trancoRank ? `#${showcase.trancoRank.toLocaleString()}` : '-'}
									</TableCell>
									<TableCell className="text-xs text-gray-600 dark:text-gray-400">
										{new Date(showcase.createdAt).toLocaleDateString()}
									</TableCell>
									<TableCell onClick={(e) => e.stopPropagation()}>
										{isModeratingThis ? (
											<div className="text-xs text-gray-500">Processing...</div>
										) : (
											<div className="flex gap-1">
												{showcase.status !== 'approved' && (
													<Button
														variant="icon"
														color="green"
														size="icon-sm"
														onClick={() => handleModerate(showcase.id, 'approve')}
														title="Approve"
													>
														<Check className="w-3.5 h-3.5" />
													</Button>
												)}
												{showcase.status !== 'denied' && (
													<Button
														variant="icon"
														color="orange"
														size="icon-sm"
														onClick={() => handleModerate(showcase.id, 'deny')}
														title="Deny"
													>
														<X className="w-3.5 h-3.5" />
													</Button>
												)}
												<Button
													variant="icon"
													color="red"
													size="icon-sm"
													onClick={() => {
														if (confirm('Are you sure you want to delete this showcase?')) {
															onDelete(showcase.id);
														}
													}}
													title="Delete"
												>
													<Trash2 className="w-3.5 h-3.5" />
												</Button>
											</div>
										)}
									</TableCell>
								</TableRow>
								{isExpanded && (
									<TableRow>
										<TableCell colSpan={11} className="bg-gray-50 dark:bg-gray-900">
											<div className="p-4 space-y-4">
												{/* Screenshot */}
												<div>
													<h4 className="text-sm font-semibold mb-2">Screenshot:</h4>
													<img
														src={showcase.screenshotUrl}
														alt={showcase.name}
														className="max-w-md rounded-lg border border-gray-200 dark:border-gray-700"
													/>
												</div>

												{/* Project Details */}
												<div className="grid grid-cols-2 gap-4">
													<div>
														<h4 className="text-sm font-semibold mb-2">Project URL:</h4>
														<a
															href={showcase.url}
															target="_blank"
															rel="noopener noreferrer"
															className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
														>
															{showcase.url}
															<ExternalLink className="w-3 h-3" />
														</a>
													</div>
													<div>
														<h4 className="text-sm font-semibold mb-2">All Libraries:</h4>
														<div className="flex flex-wrap gap-1">
															{showcase.libraries.map((libId) => {
																const lib = libraryMap.get(libId);
																return (
																	<span
																		key={libId}
																		className="px-2 py-1 text-xs rounded bg-gray-200 dark:bg-gray-700"
																	>
																		{lib?.name || libId}
																	</span>
																);
															})}
														</div>
													</div>
												</div>

												{/* Description */}
												{showcase.description && (
													<div>
														<h4 className="text-sm font-semibold mb-2">Description:</h4>
														<div className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
															{showcase.description}
														</div>
													</div>
												)}

												{/* Use Cases */}
												{showcase.useCases && showcase.useCases.length > 0 && (
													<div>
														<h4 className="text-sm font-semibold mb-2">Use Cases:</h4>
														<div className="flex flex-wrap gap-1">
															{showcase.useCases.map((useCase) => (
																<span
																	key={useCase}
																	className="px-2 py-1 text-xs rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300"
																>
																	{useCase}
																</span>
															))}
														</div>
													</div>
												)}

												{/* Vote Score */}
												<div>
													<h4 className="text-sm font-semibold mb-2">Community Votes:</h4>
													<div
														className={twMerge(
															'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
															showcase.voteScore > 0 &&
																'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
															showcase.voteScore < 0 &&
																'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
															showcase.voteScore === 0 &&
																'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
														)}
													>
														{showcase.voteScore > 0 ? (
															<ThumbsUp className="w-4 h-4" />
														) : showcase.voteScore < 0 ? (
															<ThumbsDown className="w-4 h-4" />
														) : null}
														<span>
															{showcase.voteScore > 0 ? '+' : ''}
															{showcase.voteScore} votes
														</span>
													</div>
													{showcase.voteScore < 0 && (
														<p className="mt-1 text-xs text-red-600 dark:text-red-400">
															Negative score may indicate community concerns
														</p>
													)}
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
															value={moderationNotes[showcase.id] || ''}
															onChange={(e) =>
																handleModerationNoteChange(showcase.id, e.target.value)
															}
															placeholder="Add an internal note about this moderation decision..."
															className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
															rows={2}
														/>
													</div>
												)}

												{/* Existing Moderation Info */}
												{!isPending && showcase.moderatedBy && (
													<div>
														<h4 className="text-sm font-semibold mb-2">Moderation Info:</h4>
														<div className="text-xs space-y-1">
															<div>
																<span className="text-gray-600 dark:text-gray-400">
																	Moderated at:
																</span>{' '}
																{showcase.moderatedAt &&
																	new Date(showcase.moderatedAt).toLocaleString()}
															</div>
															{showcase.moderationNote && (
																<div>
																	<span className="text-gray-600 dark:text-gray-400">Note:</span>{' '}
																	{showcase.moderationNote}
																</div>
															)}
														</div>
													</div>
												)}
											</div>
										</TableCell>
									</TableRow>
								)}
							</Fragment>
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
				itemLabel="showcases"
				sticky
			/>
		</>
	);
}

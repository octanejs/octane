import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { getDocFeedbackLeaderboardQueryOptions } from '~/queries/docFeedback';
import { Spinner } from './Spinner';
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
import { twMerge } from 'tailwind-merge';
import { Award, Medal, Trophy } from 'lucide-react';

export function FeedbackLeaderboard() {
	const navigate = useNavigate({ from: '/feedback-leaderboard' });
	const search = useSearch({ from: '/feedback-leaderboard' });
	const { page, pageSize } = search;

	const { data, isLoading, error } = useQuery(
		getDocFeedbackLeaderboardQueryOptions({
			pagination: { page, pageSize },
		}),
	);

	const handlePageChange = (newPage: number) => {
		navigate({
			search: (prev: typeof search) => ({ ...prev, page: newPage }),
		});
	};

	const handlePageSizeChange = (newPageSize: number) => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				pageSize: newPageSize,
				page: 1, // Reset to first page
			}),
		});
	};

	if (error) {
		return (
			<div className="p-8 text-center">
				<p className="text-red-600 dark:text-red-400">
					Failed to load leaderboard: {(error as Error).message}
				</p>
			</div>
		);
	}

	const leaderboard = data?.leaderboard || [];
	const pagination = data?.pagination || {
		page: 1,
		pageSize: 50,
		total: 0,
		totalPages: 0,
	};

	// Calculate global rank based on page
	const getGlobalRank = (index: number) => {
		return (page - 1) * pageSize + index + 1;
	};

	const getRankIcon = (rank: number) => {
		if (rank === 1) return <Trophy className="text-yellow-500" />;
		if (rank === 2) return <Medal className="text-gray-400" />;
		if (rank === 3) return <Medal className="text-amber-600" />;
		return null;
	};

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-gray-900">
			{/* Header */}
			<div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
					<div className="flex items-center gap-3 mb-2">
						<Award className="text-3xl text-blue-500" />
						<h1 className="text-3xl font-bold text-gray-900 dark:text-white">
							Documentation Feedback Leaderboard
						</h1>
					</div>
					<p className="text-gray-600 dark:text-gray-400 mt-2">
						Recognizing contributors who help improve TanStack documentation through feedback and
						notes.
					</p>
				</div>
			</div>

			{/* Leaderboard Table */}
			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
					{isLoading ? (
						<div className="p-12 text-center">
							<Spinner className="text-3xl" />
							<p className="mt-4 text-gray-600 dark:text-gray-400">Loading leaderboard...</p>
						</div>
					) : leaderboard.length === 0 ? (
						<div className="p-12 text-center">
							<p className="text-gray-600 dark:text-gray-400">No feedback has been approved yet.</p>
						</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableHeaderRow>
										<TableHeaderCell className="w-20">Rank</TableHeaderCell>
										<TableHeaderCell>Contributor</TableHeaderCell>
										<TableHeaderCell className="text-right w-32">Points</TableHeaderCell>
										<TableHeaderCell className="text-right w-32">Feedback</TableHeaderCell>
									</TableHeaderRow>
								</TableHeader>
								<TableBody>
									{leaderboard.map((entry, index) => {
										const rank = getGlobalRank(index);
										const displayName = entry.firstName
											? entry.lastInitial
												? `${entry.firstName} ${entry.lastInitial}.`
												: entry.firstName
											: 'Anonymous';

										return (
											<TableRow
												key={entry.userId}
												className={twMerge(
													rank <= 3 && page === 1
														? 'bg-linear-to-r from-yellow-50 to-transparent dark:from-yellow-900/10'
														: '',
												)}
											>
												<TableCell className="font-semibold">
													<div className="flex items-center gap-2">
														{getRankIcon(rank)}
														<span
															className={twMerge(
																rank === 1
																	? 'text-yellow-600 dark:text-yellow-400'
																	: rank === 2
																		? 'text-gray-600 dark:text-gray-400'
																		: rank === 3
																			? 'text-amber-600 dark:text-amber-400'
																			: 'text-gray-600 dark:text-gray-400',
															)}
														>
															#{rank}
														</span>
													</div>
												</TableCell>
												<TableCell>
													<span className="font-medium text-gray-900 dark:text-white">
														{displayName}
													</span>
												</TableCell>
												<TableCell className="text-right">
													<span className="font-semibold text-blue-600 dark:text-blue-400">
														{entry.totalPoints.toFixed(1)}
													</span>
												</TableCell>
												<TableCell className="text-right">
													<span className="text-gray-600 dark:text-gray-400">
														{entry.feedbackCount}
													</span>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>

							<div className="p-3 bg-linear-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-t border-gray-200 dark:border-gray-700">
								<PaginationControls
									currentPage={page - 1}
									totalPages={pagination.totalPages}
									totalItems={pagination.total}
									pageSize={pageSize}
									pageSizeOptions={[25, 50, 100]}
									onPageChange={(newPage) => handlePageChange(newPage + 1)}
									onPageSizeChange={handlePageSizeChange}
									canGoPrevious={page > 1}
									canGoNext={page < pagination.totalPages}
									showPageSizeSelector={true}
									itemLabel="contributors"
									sticky={false}
								/>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}

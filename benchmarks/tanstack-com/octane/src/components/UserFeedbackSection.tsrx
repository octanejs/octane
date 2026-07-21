import { useQuery } from '@octanejs/tanstack-query';
import { Link } from '@octanejs/tanstack-router';
import { getUserDocFeedbackQueryOptions } from '~/queries/docFeedback';
import { PaginationControls } from './PaginationControls.tsrx';
import { Spinner } from './Spinner.tsrx';
import { calculatePoints } from '~/utils/docFeedback.shared';
import { Award, ExternalLink, Lightbulb, MessageSquare } from '@octanejs/lucide';
import { Badge } from '~/ui';
import { useState } from 'octane';

interface UserFeedbackSectionProps {
	userId: string;
}

export function UserFeedbackSection(_props: UserFeedbackSectionProps) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	const { data, isLoading } = useQuery(
		getUserDocFeedbackQueryOptions({
			pagination: { page, pageSize },
		}),
	);

	const stats = data?.stats;
	const feedback = data?.feedback || [];
	const pagination =
		data?.pagination ||
			{
				page: 1,
				pageSize: 10,
				total: 0,
				totalPages: 0,
			};

	return <div class="space-y-6">
		{/* Points Summary Box */}
		<div
			class="bg-linear-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800"
		>
			<div class="flex items-start justify-between">
				<div>
					<div class="flex items-center gap-2 mb-2">
						<Award className="text-2xl text-blue-600 dark:text-blue-400" />
						<h3 class="text-lg font-bold text-gray-900 dark:text-white">Feedback Points</h3>
					</div>
					{stats
						? <>
								<div
									class="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2"
								>{stats.totalApprovedPoints.toFixed(1) as string}</div>
								<div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
									<div>
										<span class="font-medium">{stats.byStatus.approved.count}</span>
										approved contributions
									</div>
									<div>
										<span class="font-medium">{stats.byStatus.pending.count}</span>
										pending review
									</div>
									{stats.byStatus.denied.count > 0 &&
										<div class="text-red-600 dark:text-red-400">
											<span class="font-medium">{stats.byStatus.denied.count}</span>
											denied
										</div>}
								</div>
							</>
						: <div class="text-sm text-gray-600 dark:text-gray-400">Loading stats...</div>}
				</div>
				<Link
					to="/feedback-leaderboard"
					className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
				>
					View Leaderboard
					<ExternalLink className="text-xs" />
				</Link>
			</div>
		</div>

		{/* Feedback List */}
		<div>
			<h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-white">
				My Feedback History
			</h3>

			{isLoading
				? <div class="text-center py-8">
						<Spinner />
					</div>
				: feedback.length === 0
					? <div
							class="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
						>
							<p class="text-gray-600 dark:text-gray-400">
								You haven't submitted any feedback yet.
							</p>
							<p class="text-sm text-gray-500 dark:text-gray-500 mt-2">
								Visit any documentation page while logged in to add notes or suggest improvements.
							</p>
						</div>
					: <>
							<div class="space-y-3">{feedback.map(
								(item) => <div
									key={item.id}
									class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow"
								>
									<div class="flex items-start justify-between gap-4">
										<div class="flex items-start gap-3 flex-1">
											{/* Icon */}
											<div class="mt-1">
												{item.type === 'note'
													? <MessageSquare className="text-blue-500" />
													: <Lightbulb className="text-yellow-500" />}
											</div>

											{/* Content */}
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-2 mb-1">
													<span class="text-xs font-medium text-gray-500 dark:text-gray-400">
														{item.type === 'note' ? 'Personal Note' : 'Improvement Suggestion'}
													</span>
													<span class="text-xs text-gray-400">•</span>
													<span
														class="text-xs text-gray-500 dark:text-gray-400 font-mono"
													>{item.libraryId}</span>
												</div>
												<p
													class="text-sm text-gray-900 dark:text-gray-100 line-clamp-2 mb-2"
												>{item.content}</p>
												<div
													class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400"
												>
													<span>{new Date(item.createdAt).toLocaleDateString() as string}</span>
													<span>•</span>
													<span class="font-mono">{item.pagePath}</span>
												</div>
											</div>
										</div>

										{/* Status & Points */}
										<div class="flex flex-col items-end gap-2">
											<Badge
												variant={item.status === 'pending'
													? 'warning'
													: item.status === 'approved'
														? 'success'
														: 'error'}
											>
												{item.status.charAt(0).toUpperCase() + item.status.slice(1)}
											</Badge>
											<span class="text-sm font-semibold text-blue-600 dark:text-blue-400">
												{calculatePoints(item.characterCount, item.type).toFixed(1) as string}
												pts
											</span>
										</div>
									</div>

									{/* Detached warning */}
									{item.isDetached &&
										<div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
											<p class="text-xs text-yellow-600 dark:text-yellow-400">
												⚠️ The referenced section may have moved or been updated. Moderators can
												review this feedback.
											</p>
										</div>}
								</div>,
							)}</div>

							{pagination.totalPages > 1 &&
								<div class="mt-6">
									<PaginationControls
										currentPage={page - 1}
										totalPages={pagination.totalPages}
										totalItems={pagination.total}
										pageSize={pageSize}
										pageSizeOptions={[10, 25, 50]}
										onPageChange={(newPage) => setPage(newPage + 1)}
										onPageSizeChange={(newSize) => {
											setPageSize(newSize);
											setPage(1);
										}}
										canGoPrevious={page > 1}
										canGoNext={page < pagination.totalPages}
										showPageSizeSelector={true}
										itemLabel="feedback items"
										sticky={false}
									/>
								</div>}
						</>}
		</div>
	</div>;
}

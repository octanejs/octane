import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { listDocFeedbackForModerationQueryOptions } from '~/queries/docFeedback';
import { moderateDocFeedback } from '~/utils/docFeedback.functions';
import { FeedbackModerationTopBar } from './FeedbackModerationTopBar';
import { FeedbackModerationList } from './FeedbackModerationList';
import { useToast } from '~/components/ToastProvider';
import { Spinner } from '~/components/Spinner';

export function FeedbackModerationPage() {
	const navigate = useNavigate({ from: '/admin/feedback/' });
	const search = useSearch({ from: '/admin/feedback/' });
	const queryClient = useQueryClient();
	const { notify } = useToast();

	const { data, isLoading, error } = useQuery(
		listDocFeedbackForModerationQueryOptions({
			pagination: {
				page: search.page,
				pageSize: search.pageSize,
			},
			filters: {
				status: search.status,
				type: ['improvement'], // Only improvements
				libraryId: search.libraryId,
				isDetached: search.isDetached,
				dateFrom: search.dateFrom,
				dateTo: search.dateTo,
			},
		}),
	);

	const moderateMutation = useMutation({
		mutationFn: moderateDocFeedback,
		onSuccess: (_, variables) => {
			notify(
				<div>
					<div className="font-medium">Feedback moderated</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Feedback {variables.data.action === 'approve' ? 'approved' : 'denied'} successfully.
					</div>
				</div>,
			);
			queryClient.invalidateQueries({ queryKey: ['docFeedback', 'moderation'] });
		},
		onError: (error: Error) => {
			notify(
				<div>
					<div className="font-medium">Moderation failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">{error.message}</div>
				</div>,
			);
		},
	});

	const handleFilterChange = (filters: Partial<typeof search>) => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				...filters,
				page: 1, // Reset to first page on filter change
			}),
		});
	};

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
				page: 1,
			}),
		});
	};

	const handleModerate = (
		feedbackId: string,
		action: 'approve' | 'deny',
		moderationNote?: string,
	) => {
		moderateMutation.mutate({
			data: {
				feedbackId,
				action,
				moderationNote,
			},
		});
	};

	return (
		<div className="w-full p-4">
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<h1 className="text-3xl font-bold text-gray-900 dark:text-white">Moderate Feedback</h1>
					{isLoading && <Spinner className="text-gray-500 dark:text-gray-400" />}
				</div>

				<FeedbackModerationTopBar
					filters={{
						status: search.status,
						libraryId: search.libraryId,
						isDetached: search.isDetached,
						dateFrom: search.dateFrom,
						dateTo: search.dateTo,
					}}
					onFilterChange={handleFilterChange}
				/>

				<div className="flex-1 min-w-0">
					<FeedbackModerationList
						data={data}
						isLoading={isLoading}
						error={error as Error}
						page={search.page}
						pageSize={search.pageSize}
						onPageChange={handlePageChange}
						onPageSizeChange={handlePageSizeChange}
						onModerate={handleModerate}
						isModeratingId={moderateMutation.variables?.data.feedbackId}
					/>
				</div>
			</div>
		</div>
	);
}

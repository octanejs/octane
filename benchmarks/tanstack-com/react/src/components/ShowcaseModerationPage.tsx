import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { listShowcasesForModerationQueryOptions } from '~/queries/showcases';
import {
	moderateShowcase,
	setShowcaseFeatured,
	adminDeleteShowcase,
	voteShowcase,
} from '~/utils/showcase.functions';
import { ShowcaseModerationTopBar } from './ShowcaseModerationTopBar';
import { ShowcaseModerationList } from './ShowcaseModerationList';
import { useToast } from '~/components/ToastProvider';
import { Spinner } from '~/components/Spinner';

export function ShowcaseModerationPage() {
	const navigate = useNavigate({ from: '/admin/showcases/' });
	const search = useSearch({ from: '/admin/showcases/' });
	const queryClient = useQueryClient();
	const { notify } = useToast();

	const { data, isLoading, error } = useQuery(
		listShowcasesForModerationQueryOptions({
			pagination: {
				page: search.page,
				pageSize: search.pageSize,
			},
			filters: {
				status: search.status,
				libraryId: search.libraryId,
				isFeatured: search.isFeatured,
			},
		}),
	);

	const moderateMutation = useMutation({
		mutationFn: moderateShowcase,
		onSuccess: (_, variables) => {
			notify(
				<div>
					<div className="font-medium">Showcase moderated</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Showcase {variables.data.action === 'approve' ? 'approved' : 'denied'} successfully.
					</div>
				</div>,
			);
			queryClient.invalidateQueries({ queryKey: ['showcases'] });
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

	const featuredMutation = useMutation({
		mutationFn: setShowcaseFeatured,
		onSuccess: (_, variables) => {
			notify(
				<div>
					<div className="font-medium">Featured status updated</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">
						Showcase {variables.data.isFeatured ? 'featured' : 'unfeatured'} successfully.
					</div>
				</div>,
			);
			queryClient.invalidateQueries({ queryKey: ['showcases'] });
		},
		onError: (error: Error) => {
			notify(
				<div>
					<div className="font-medium">Update failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">{error.message}</div>
				</div>,
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: adminDeleteShowcase,
		onSuccess: () => {
			notify(
				<div>
					<div className="font-medium">Showcase deleted</div>
				</div>,
			);
			queryClient.invalidateQueries({ queryKey: ['showcases'] });
		},
		onError: (error: Error) => {
			notify(
				<div>
					<div className="font-medium">Delete failed</div>
					<div className="text-gray-500 dark:text-gray-400 text-xs">{error.message}</div>
				</div>,
			);
		},
	});

	const voteMutation = useMutation({
		mutationFn: voteShowcase,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['showcases'] });
		},
	});

	const handleFilterChange = (filters: Partial<typeof search>) => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				...filters,
				page: 1,
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
		showcaseId: string,
		action: 'approve' | 'deny',
		moderationNote?: string,
	) => {
		moderateMutation.mutate({
			data: {
				showcaseId,
				action,
				moderationNote,
			},
		});
	};

	const handleToggleFeatured = (showcaseId: string, isFeatured: boolean) => {
		featuredMutation.mutate({
			data: {
				showcaseId,
				isFeatured,
			},
		});
	};

	const handleDelete = (showcaseId: string) => {
		deleteMutation.mutate({
			data: { showcaseId },
		});
	};

	const handleVote = (showcaseId: string, value: 1 | -1) => {
		voteMutation.mutate({
			data: { showcaseId, value },
		});
	};

	return (
		<div className="w-full p-4">
			<div className="flex flex-col gap-4">
				<div className="flex items-center gap-3">
					<h1 className="text-3xl font-bold text-gray-900 dark:text-white">Moderate Showcases</h1>
					{isLoading && <Spinner className="text-gray-500 dark:text-gray-400" />}
				</div>

				<ShowcaseModerationTopBar
					filters={{
						status: search.status,
						libraryId: search.libraryId,
						isFeatured: search.isFeatured,
					}}
					onFilterChange={handleFilterChange}
				/>

				<div className="flex-1 min-w-0">
					<ShowcaseModerationList
						data={data}
						isLoading={isLoading}
						error={error as Error}
						page={search.page}
						pageSize={search.pageSize}
						onPageChange={handlePageChange}
						onPageSizeChange={handlePageSizeChange}
						onModerate={handleModerate}
						onToggleFeatured={handleToggleFeatured}
						onDelete={handleDelete}
						onVote={handleVote}
						isModeratingId={
							moderateMutation.variables?.data.showcaseId ||
							deleteMutation.variables?.data.showcaseId
						}
					/>
				</div>
			</div>
		</div>
	);
}

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import {
	getApprovedShowcasesQueryOptions,
	getMyShowcaseVotesQueryOptions,
} from '~/queries/showcases';
import { voteShowcase } from '~/utils/showcase.functions';
import { ShowcaseCard, ShowcaseCardSkeleton } from './ShowcaseCard';
import { SubmitShowcasePlaceholder } from './ShowcaseSection';
import { PaginationControls } from './PaginationControls';
import { ShowcaseTopBarFilters } from './ShowcaseTopBarFilters';
import type { ShowcaseUseCase } from '~/db/types';
import { Plus } from 'lucide-react';
import { Button } from '~/ui';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useLoginModal } from '~/contexts/LoginModalContext';
import type { LibraryId } from '~/libraries';
import { PAGE_SIZE_OPTIONS } from '~/routes/showcase';

export function ShowcaseGallery() {
	const navigate = useNavigate({ from: '/showcase/' });
	const search = useSearch({ from: '/showcase/' });
	const queryClient = useQueryClient();
	const currentUser = useCurrentUser();
	const { openLoginModal } = useLoginModal();

	const pageSize = search.pageSize ?? 24;

	const { data, isLoading } = useQuery(
		getApprovedShowcasesQueryOptions({
			pagination: {
				page: search.page,
				pageSize,
			},
			filters: {
				libraryIds: search.libraryIds,
				useCases: search.useCases as ShowcaseUseCase[],
				hasSourceCode: search.hasSourceCode,
				q: search.q,
			},
		}),
	);

	const showcaseIds = React.useMemo(
		() => data?.showcases.map((s) => s.showcase.id) ?? [],
		[data?.showcases],
	);

	const { data: votesData } = useQuery({
		...getMyShowcaseVotesQueryOptions(showcaseIds),
		enabled: !!currentUser && showcaseIds.length > 0,
	});

	const votesMap = React.useMemo(() => {
		const map = new Map<string, 1 | -1>();
		votesData?.votes.forEach((v) => {
			if (v.value === 1 || v.value === -1) {
				map.set(v.showcaseId, v.value);
			}
		});
		return map;
	}, [votesData]);

	const voteMutation = useMutation({
		mutationFn: (params: { showcaseId: string; value: 1 | -1 }) => voteShowcase({ data: params }),
		onMutate: async ({ showcaseId, value }) => {
			// Cancel outgoing refetches
			await queryClient.cancelQueries({ queryKey: ['showcases'] });

			// Snapshot previous values
			const previousShowcases = queryClient.getQueryData(
				getApprovedShowcasesQueryOptions({
					pagination: { page: search.page, pageSize },
					filters: {
						libraryIds: search.libraryIds,
						useCases: search.useCases as ShowcaseUseCase[],
						q: search.q,
					},
				}).queryKey,
			);
			const previousVotes = queryClient.getQueryData(
				getMyShowcaseVotesQueryOptions(showcaseIds).queryKey,
			);

			// Optimistically update votes
			queryClient.setQueryData(
				getMyShowcaseVotesQueryOptions(showcaseIds).queryKey,
				(old: typeof votesData) => {
					if (!old) return { votes: [{ showcaseId, value }] };
					const existingVote = old.votes.find((v) => v.showcaseId === showcaseId);
					if (existingVote) {
						if (existingVote.value === value) {
							// Toggle off
							return {
								votes: old.votes.filter((v) => v.showcaseId !== showcaseId),
							};
						} else {
							// Change vote
							return {
								votes: old.votes.map((v) => (v.showcaseId === showcaseId ? { ...v, value } : v)),
							};
						}
					} else {
						// New vote
						return { votes: [...old.votes, { showcaseId, value }] };
					}
				},
			);

			// Optimistically update showcase score
			queryClient.setQueryData(
				getApprovedShowcasesQueryOptions({
					pagination: { page: search.page, pageSize },
					filters: {
						libraryIds: search.libraryIds,
						useCases: search.useCases as ShowcaseUseCase[],
						q: search.q,
					},
				}).queryKey,
				(old: typeof data) => {
					if (!old) return old;
					const currentVote = votesMap.get(showcaseId);
					return {
						...old,
						showcases: old.showcases.map((s) => {
							if (s.showcase.id !== showcaseId) return s;
							let scoreDelta: number = value;
							if (currentVote === value) {
								// Toggling off
								scoreDelta = -value;
							} else if (currentVote) {
								// Changing vote
								scoreDelta = value * 2;
							}
							return {
								...s,
								showcase: {
									...s.showcase,
									voteScore: s.showcase.voteScore + scoreDelta,
								},
							};
						}),
					};
				},
			);

			return { previousShowcases, previousVotes };
		},
		onError: (_err, _vars, context) => {
			// Rollback on error
			if (context?.previousShowcases) {
				queryClient.setQueryData(
					getApprovedShowcasesQueryOptions({
						pagination: { page: search.page, pageSize },
						filters: {
							libraryIds: search.libraryIds,
							useCases: search.useCases as ShowcaseUseCase[],
							q: search.q,
						},
					}).queryKey,
					context.previousShowcases,
				);
			}
			if (context?.previousVotes) {
				queryClient.setQueryData(
					getMyShowcaseVotesQueryOptions(showcaseIds).queryKey,
					context.previousVotes,
				);
			}
		},
		onSettled: () => {
			// Refetch to sync with server
			queryClient.invalidateQueries({ queryKey: ['showcases'] });
		},
	});

	const handleVote = (showcaseId: string, value: 1 | -1) => {
		if (!currentUser) {
			openLoginModal({
				onSuccess: () => voteMutation.mutate({ showcaseId, value }),
			});
			return;
		}
		voteMutation.mutate({ showcaseId, value });
	};

	const handleLibraryToggle = (libraryId: LibraryId) => {
		const current = search.libraryIds || [];
		const updated = current.includes(libraryId)
			? current.filter((id) => id !== libraryId)
			: [...current, libraryId];
		navigate({
			search: (prev) => ({
				...prev,
				libraryIds: updated.length > 0 ? updated : undefined,
				page: 1,
			}),
		});
	};

	const clearLibraries = () => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				libraryIds: undefined,
				page: 1,
			}),
		});
	};

	const handleUseCaseFilter = (useCase: ShowcaseUseCase) => {
		const current = search.useCases || [];
		const updated = current.includes(useCase)
			? current.filter((c: ShowcaseUseCase) => c !== useCase)
			: [...current, useCase];
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				useCases: updated.length > 0 ? updated : undefined,
				page: 1,
			}),
		});
	};

	const clearUseCases = () => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				useCases: undefined,
				page: 1,
			}),
		});
	};

	const handleToggleOpenSource = () => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				hasSourceCode: prev.hasSourceCode ? undefined : true,
				page: 1,
			}),
		});
	};

	const handlePageChange = (newPage: number) => {
		navigate({
			search: (prev: typeof search) => ({ ...prev, page: newPage + 1 }),
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

	const handleSearchChange = (q: string) => {
		navigate({
			search: (prev: typeof search) => ({
				...prev,
				q: q || undefined,
				page: 1,
			}),
		});
	};

	const clearFilters = () => {
		navigate({
			search: {
				page: 1,
				libraryIds: undefined,
				useCases: undefined,
				hasSourceCode: undefined,
				q: undefined,
			},
		});
	};

	const hasFilters =
		(search.libraryIds && search.libraryIds.length > 0) ||
		(search.useCases && search.useCases.length > 0) ||
		search.hasSourceCode ||
		search.q;

	return (
		<div className="min-h-screen">
			{/* Header */}
			<div className="bg-linear-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-950">
				<div className="max-w-7xl mx-auto px-4 py-12 sm:py-16">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div>
							<h1 className="text-4xl font-bold text-gray-900 dark:text-white">Showcase</h1>
							<p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
								Discover projects built with TanStack libraries
							</p>
						</div>
						<Button
							as={Link}
							to="/showcase/submit"
							className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg border-none"
						>
							<Plus className="w-5 h-5" />
							Submit Your Project
						</Button>
					</div>
				</div>
			</div>

			{/* Filters */}
			<div className="bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm sticky top-[var(--navbar-height)] z-10">
				<div className="max-w-7xl mx-auto px-4 py-3">
					<ShowcaseTopBarFilters
						filters={{
							libraryIds: search.libraryIds,
							useCases: search.useCases as ShowcaseUseCase[],
							hasSourceCode: search.hasSourceCode,
							q: search.q,
						}}
						onLibraryToggle={handleLibraryToggle}
						onClearLibraries={clearLibraries}
						onUseCaseToggle={handleUseCaseFilter}
						onClearUseCases={clearUseCases}
						onToggleOpenSource={handleToggleOpenSource}
						onClearFilters={clearFilters}
						onSearchChange={handleSearchChange}
					/>
				</div>
			</div>

			{/* Grid */}
			<div className="max-w-7xl mx-auto px-4 py-8">
				{isLoading ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
						{Array.from({ length: 6 }).map((_, i) => (
							<ShowcaseCardSkeleton key={i} />
						))}
					</div>
				) : data?.showcases && data.showcases.length > 0 ? (
					<>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
							{data.showcases.map(({ showcase, user }) => (
								<ShowcaseCard
									key={showcase.id}
									showcase={showcase}
									user={user}
									currentUserVote={votesMap.get(showcase.id)}
									onVote={(value) => handleVote(showcase.id, value)}
									isVoting={
										voteMutation.isPending && voteMutation.variables?.showcaseId === showcase.id
									}
								/>
							))}
						</div>

						{data.pagination.totalPages > 1 && (
							<div className="mt-8">
								<PaginationControls
									currentPage={search.page - 1}
									totalPages={data.pagination.totalPages}
									totalItems={data.pagination.total}
									pageSize={pageSize}
									onPageChange={handlePageChange}
									onPageSizeChange={handlePageSizeChange}
									canGoPrevious={search.page > 1}
									canGoNext={search.page < data.pagination.totalPages}
									itemLabel="projects"
									showPageSizeSelector
									pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
								/>
							</div>
						)}
					</>
				) : hasFilters ? (
					<div className="text-center py-16">
						<p className="text-gray-600 dark:text-gray-400 text-lg">
							No projects found matching your filters.
						</p>
						<button
							onClick={clearFilters}
							className="mt-4 text-blue-600 dark:text-blue-400 hover:underline"
						>
							Clear filters
						</button>
					</div>
				) : (
					<div className="text-center py-16">
						<p className="text-gray-600 dark:text-gray-400 text-lg mb-8">No projects found.</p>
						<div className="max-w-sm mx-auto">
							<SubmitShowcasePlaceholder />
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

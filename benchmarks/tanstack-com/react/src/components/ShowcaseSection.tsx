import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
	getFeaturedShowcasesQueryOptions,
	getShowcasesByLibraryQueryOptions,
	getMyShowcaseVotesQueryOptions,
} from '~/queries/showcases';
import { voteShowcase } from '~/utils/showcase.functions';
import { ShowcaseCard, ShowcaseCardSkeleton } from './ShowcaseCard';
import { Button } from '~/ui';
import { ArrowRight, Plus } from 'lucide-react';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useLoginModal } from '~/contexts/LoginModalContext';
import type { LibraryId } from '~/libraries';

interface ShowcaseSectionProps {
	title?: string;
	subtitle?: string;
	libraryId?: LibraryId;
	limit?: number;
	showViewAll?: boolean;
	minItems?: number;
}

export function SubmitShowcasePlaceholder({ libraryId }: { libraryId?: LibraryId }) {
	return (
		<Link
			to="/showcase/submit"
			search={libraryId ? { libraryId } : undefined}
			className="group block rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500"
		>
			<div className="aspect-video flex items-center justify-center bg-gray-50 dark:bg-gray-900/50">
				<div className="text-center p-6">
					<div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 transition-colors">
						<Plus className="w-6 h-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
					</div>
					<p className="text-sm font-medium text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
						Submit your project
					</p>
				</div>
			</div>
			<div className="p-4">
				<h3 className="font-bold text-lg text-gray-500 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
					Your Project Here
				</h3>
				<p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
					Share what you've built with the community
				</p>
			</div>
		</Link>
	);
}

export function ShowcaseSection({
	title = 'Built with TanStack',
	subtitle = 'See what the community is building',
	libraryId,
	limit = 6,
	showViewAll = true,
	minItems = 3,
}: ShowcaseSectionProps) {
	const queryClient = useQueryClient();
	const currentUser = useCurrentUser();
	const { openLoginModal } = useLoginModal();

	const queryOptions = libraryId
		? getShowcasesByLibraryQueryOptions({ libraryId, limit })
		: getFeaturedShowcasesQueryOptions({ limit });

	const { data, isLoading } = useQuery(queryOptions);

	const showcases = React.useMemo(() => data?.showcases || [], [data?.showcases]);
	const placeholdersNeeded = Math.max(0, minItems - showcases.length);

	const showcaseIds = React.useMemo(() => showcases.map((s) => s.showcase.id), [showcases]);

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
			await queryClient.cancelQueries({ queryKey: ['showcases'] });

			const previousShowcases = queryClient.getQueryData(queryOptions.queryKey);
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
							return {
								votes: old.votes.filter((v) => v.showcaseId !== showcaseId),
							};
						} else {
							return {
								votes: old.votes.map((v) => (v.showcaseId === showcaseId ? { ...v, value } : v)),
							};
						}
					} else {
						return { votes: [...old.votes, { showcaseId, value }] };
					}
				},
			);

			// Optimistically update showcase score
			queryClient.setQueryData(queryOptions.queryKey, (old: typeof data) => {
				if (!old) return old;
				const currentVote = votesMap.get(showcaseId);
				return {
					...old,
					showcases: old.showcases.map((s) => {
						if (s.showcase.id !== showcaseId) return s;
						let scoreDelta: number = value;
						if (currentVote === value) {
							scoreDelta = -value;
						} else if (currentVote) {
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
			});

			return { previousShowcases, previousVotes };
		},
		onError: (_err, _vars, context) => {
			if (context?.previousShowcases) {
				queryClient.setQueryData(queryOptions.queryKey, context.previousShowcases);
			}
			if (context?.previousVotes) {
				queryClient.setQueryData(
					getMyShowcaseVotesQueryOptions(showcaseIds).queryKey,
					context.previousVotes,
				);
			}
		},
		onSettled: () => {
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

	return (
		<section className="py-16">
			<div className="mb-8">
				<h2 className="text-3xl font-bold text-gray-900 dark:text-white">{title}</h2>
				<p className="mt-2 text-lg text-gray-600 dark:text-gray-400">{subtitle}</p>
			</div>

			{isLoading ? (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
					{Array.from({ length: Math.max(limit, minItems) }).map((_, i) => (
						<ShowcaseCardSkeleton key={i} />
					))}
				</div>
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
					{showcases.map(({ showcase, user }) => (
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
					{Array.from({ length: placeholdersNeeded }).map((_, i) => (
						<SubmitShowcasePlaceholder key={`placeholder-${i}`} libraryId={libraryId} />
					))}
				</div>
			)}

			{showViewAll && (
				<div className="mt-8 flex justify-center">
					<Link
						to="/showcase"
						search={{
							libraryIds: libraryId ? [libraryId] : undefined,
						}}
					>
						<Button variant="ghost" size="xs">
							View all projects
							<ArrowRight className="w-4 h-4" />
						</Button>
					</Link>
				</div>
			)}
		</section>
	);
}

/**
 * Featured showcases for homepage (after partners, before blog)
 */
export function FeaturedShowcases() {
	return (
		<ShowcaseSection
			title="Built with TanStack"
			subtitle="Discover projects from the community"
			limit={6}
		/>
	);
}

/**
 * Library-specific showcases (for per-library landing pages)
 */
export function LibraryShowcases({
	libraryId,
	libraryName,
}: {
	libraryId: LibraryId;
	libraryName: string;
}) {
	return (
		<ShowcaseSection
			title={`Built with ${libraryName}`}
			subtitle="See how developers are using this library"
			libraryId={libraryId}
			limit={3}
		/>
	);
}

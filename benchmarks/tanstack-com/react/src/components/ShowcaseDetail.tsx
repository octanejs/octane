import * as React from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, ThumbsUp, ThumbsDown, Sparkles, Code } from 'lucide-react';
import { Button } from '~/ui';
import { twMerge } from 'tailwind-merge';
import { libraries, type LibraryId } from '~/libraries';
import { USE_CASE_LABELS } from '~/utils/showcase.shared';
import { voteShowcase } from '~/utils/showcase.functions';
import {
	getShowcaseQueryOptions,
	getRelatedShowcasesQueryOptions,
	getMyShowcaseVotesQueryOptions,
} from '~/queries/showcases';
import { useCurrentUser } from '~/hooks/useCurrentUser';
import { useLoginModal } from '~/contexts/LoginModalContext';
import { ShowcaseCard } from './ShowcaseCard';
import type { ShowcaseUseCase } from '~/db/types';

const libraryMap = new Map(libraries.map((lib) => [lib.id, lib]));

interface ShowcaseDetailProps {
	showcaseId: string;
}

export function ShowcaseDetail({ showcaseId }: ShowcaseDetailProps) {
	const queryClient = useQueryClient();
	const currentUser = useCurrentUser();
	const { openLoginModal } = useLoginModal();

	const { data, isLoading } = useQuery(getShowcaseQueryOptions(showcaseId));

	const { data: relatedData } = useQuery({
		...getRelatedShowcasesQueryOptions({
			showcaseId,
			libraries: data?.showcase.libraries ?? [],
			limit: 4,
		}),
		enabled: !!data?.showcase.libraries.length,
	});

	const { data: votesData } = useQuery({
		...getMyShowcaseVotesQueryOptions([showcaseId]),
		enabled: !!currentUser,
	});

	const currentUserVote = React.useMemo(() => {
		const vote = votesData?.votes.find((v) => v.showcaseId === showcaseId);
		if (vote?.value === 1 || vote?.value === -1) {
			return vote.value;
		}
		return null;
	}, [votesData, showcaseId]);

	const relatedShowcaseIds = React.useMemo(
		() => relatedData?.showcases.map((s) => s.showcase.id) ?? [],
		[relatedData?.showcases],
	);

	const { data: relatedVotesData } = useQuery({
		...getMyShowcaseVotesQueryOptions(relatedShowcaseIds),
		enabled: !!currentUser && relatedShowcaseIds.length > 0,
	});

	const relatedVotesMap = React.useMemo(() => {
		const map = new Map<string, 1 | -1>();
		relatedVotesData?.votes.forEach((v) => {
			if (v.value === 1 || v.value === -1) {
				map.set(v.showcaseId, v.value);
			}
		});
		return map;
	}, [relatedVotesData]);

	const voteMutation = useMutation({
		mutationFn: (params: { showcaseId: string; value: 1 | -1 }) => voteShowcase({ data: params }),
		onMutate: async ({ showcaseId: voteShowcaseId, value }) => {
			await queryClient.cancelQueries({ queryKey: ['showcases'] });

			const previousShowcase = queryClient.getQueryData(
				getShowcaseQueryOptions(showcaseId).queryKey,
			);
			const previousVotes = queryClient.getQueryData(
				getMyShowcaseVotesQueryOptions([showcaseId]).queryKey,
			);

			// Optimistically update the vote
			queryClient.setQueryData(
				getMyShowcaseVotesQueryOptions([showcaseId]).queryKey,
				(old: typeof votesData) => {
					if (!old) return { votes: [{ showcaseId: voteShowcaseId, value }] };
					const existingVote = old.votes.find((v) => v.showcaseId === voteShowcaseId);
					if (existingVote) {
						if (existingVote.value === value) {
							return {
								votes: old.votes.filter((v) => v.showcaseId !== voteShowcaseId),
							};
						}
						return {
							votes: old.votes.map((v) => (v.showcaseId === voteShowcaseId ? { ...v, value } : v)),
						};
					}
					return {
						votes: [...old.votes, { showcaseId: voteShowcaseId, value }],
					};
				},
			);

			// Optimistically update the showcase score
			if (voteShowcaseId === showcaseId) {
				queryClient.setQueryData(
					getShowcaseQueryOptions(showcaseId).queryKey,
					(old: typeof data) => {
						if (!old) return old;
						let scoreDelta: number = value;
						if (currentUserVote === value) {
							scoreDelta = -value;
						} else if (currentUserVote) {
							scoreDelta = value * 2;
						}
						return {
							...old,
							showcase: {
								...old.showcase,
								voteScore: old.showcase.voteScore + scoreDelta,
							},
						};
					},
				);
			}

			return { previousShowcase, previousVotes };
		},
		onError: (_err, _vars, context) => {
			if (context?.previousShowcase) {
				queryClient.setQueryData(
					getShowcaseQueryOptions(showcaseId).queryKey,
					context.previousShowcase,
				);
			}
			if (context?.previousVotes) {
				queryClient.setQueryData(
					getMyShowcaseVotesQueryOptions([showcaseId]).queryKey,
					context.previousVotes,
				);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: ['showcases'] });
		},
	});

	const handleVote = (targetShowcaseId: string, value: 1 | -1) => {
		if (!currentUser) {
			openLoginModal({
				onSuccess: () => voteMutation.mutate({ showcaseId: targetShowcaseId, value }),
			});
			return;
		}
		voteMutation.mutate({ showcaseId: targetShowcaseId, value });
	};

	if (isLoading) {
		return (
			<div className="min-h-screen">
				<div className="max-w-4xl mx-auto px-4 py-8">
					<div className="animate-pulse">
						<div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-8" />
						<div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-xl mb-8" />
						<div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
						<div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded mb-2" />
						<div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
					</div>
				</div>
			</div>
		);
	}

	if (!data) {
		return (
			<div className="min-h-screen">
				<div className="max-w-4xl mx-auto px-4 py-16 text-center">
					<Sparkles className="mx-auto h-16 w-16 text-gray-400 mb-4" />
					<h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
						Showcase not found
					</h1>
					<p className="text-gray-600 dark:text-gray-400 mb-6">
						The project you're looking for doesn't exist or hasn't been approved yet.
					</p>
					<Link
						to="/showcase"
						className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
					>
						<ArrowLeft className="w-4 h-4" />
						Back to Showcase Gallery
					</Link>
				</div>
			</div>
		);
	}

	const { showcase } = data;
	const displayScore = Math.max(0, showcase.voteScore);
	const showcaseLibraries = showcase.libraries
		.map((libId) => libraryMap.get(libId as LibraryId))
		.filter(Boolean);

	return (
		<div className="min-h-screen bg-gray-50 dark:bg-gray-950">
			<div className="max-w-4xl mx-auto px-4 py-8">
				{/* Back link */}
				<Link
					to="/showcase"
					className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6"
				>
					<ArrowLeft className="w-4 h-4" />
					Back to Showcase Gallery
				</Link>

				{/* Hero Screenshot */}
				<div className="relative rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-lg mb-8">
					<img
						src={showcase.screenshotUrl}
						alt={`${showcase.name} screenshot`}
						className="w-full aspect-video object-cover"
					/>
				</div>

				{/* Header */}
				<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
					<div className="flex items-start gap-4">
						{showcase.logoUrl && (
							<img
								src={showcase.logoUrl}
								alt=""
								className="w-14 h-14 rounded-xl object-cover shadow-md shrink-0"
							/>
						)}
						<div>
							<h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
								{showcase.name}
							</h1>
							<p className="text-gray-600 dark:text-gray-400 mt-1">{showcase.tagline}</p>
						</div>
					</div>
					<div className="flex gap-2 shrink-0">
						{showcase.sourceUrl && (
							<Button
								as="a"
								href={showcase.sourceUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="px-4 py-2 text-sm"
							>
								View Source
								<Code className="w-4 h-4" />
							</Button>
						)}
						<Button
							as="a"
							href={showcase.url}
							target="_blank"
							rel="noopener noreferrer"
							className="px-4 py-2 text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-gray-900 dark:border-white hover:bg-gray-700 dark:hover:bg-gray-200"
						>
							Visit Site
							<ExternalLink className="w-4 h-4" />
						</Button>
					</div>
				</div>

				{/* Description */}
				{showcase.description && (
					<div className="mb-8">
						<p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
							{showcase.description}
						</p>
					</div>
				)}

				{/* Libraries */}
				<div className="mb-6">
					<h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
						Built with
					</h2>
					<div className="flex flex-wrap gap-2">
						{showcaseLibraries.map((lib) => (
							<Link
								key={lib!.id}
								to={lib!.to}
								className={twMerge(
									'inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
									'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700',
									lib!.textStyle,
								)}
							>
								{lib!.name}
							</Link>
						))}
					</div>
				</div>

				{/* Use Cases */}
				{showcase.useCases && showcase.useCases.length > 0 && (
					<div className="mb-8">
						<h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
							Use Cases
						</h2>
						<div className="flex flex-wrap gap-2">
							{showcase.useCases.map((useCase: ShowcaseUseCase) => (
								<span
									key={useCase}
									className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
								>
									{USE_CASE_LABELS[useCase] || useCase}
								</span>
							))}
						</div>
					</div>
				)}

				{/* Voting */}
				<div className="flex items-center gap-4 py-6 border-t border-gray-200 dark:border-gray-800">
					<span className="text-sm text-gray-500 dark:text-gray-400">Rate this project</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => handleVote(showcaseId, 1)}
							disabled={voteMutation.isPending}
							className={twMerge(
								'p-2 rounded-lg transition-colors',
								currentUserVote === 1
									? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
									: 'text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-800',
								voteMutation.isPending && 'opacity-50 cursor-not-allowed',
							)}
							title="Upvote"
						>
							<ThumbsUp
								className="w-5 h-5"
								fill={currentUserVote === 1 ? 'currentColor' : 'none'}
							/>
						</button>

						<span
							className={twMerge(
								'min-w-[2.5rem] text-center text-lg font-semibold',
								displayScore > 0
									? 'text-emerald-600 dark:text-emerald-400'
									: 'text-gray-500 dark:text-gray-400',
							)}
						>
							{displayScore}
						</span>

						<button
							type="button"
							onClick={() => handleVote(showcaseId, -1)}
							disabled={voteMutation.isPending}
							className={twMerge(
								'p-2 rounded-lg transition-colors',
								currentUserVote === -1
									? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
									: 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800',
								voteMutation.isPending && 'opacity-50 cursor-not-allowed',
							)}
							title="Downvote"
						>
							<ThumbsDown
								className="w-5 h-5"
								fill={currentUserVote === -1 ? 'currentColor' : 'none'}
							/>
						</button>
					</div>
				</div>

				{/* Related Projects */}
				{relatedData?.showcases && relatedData.showcases.length > 0 && (
					<div className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-800">
						<h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">More Projects</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
							{relatedData.showcases.map(({ showcase: relatedShowcase }) => (
								<ShowcaseCard
									key={relatedShowcase.id}
									showcase={relatedShowcase}
									currentUserVote={relatedVotesMap.get(relatedShowcase.id)}
									onVote={(value) => handleVote(relatedShowcase.id, value)}
									isVoting={
										voteMutation.isPending &&
										voteMutation.variables?.showcaseId === relatedShowcase.id
									}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

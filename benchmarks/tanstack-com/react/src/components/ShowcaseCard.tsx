import { Link } from '@tanstack/react-router';
import { twMerge } from 'tailwind-merge';
import { ExternalLink, ThumbsUp, ThumbsDown, Code } from 'lucide-react';
import { libraries, type LibraryId } from '~/libraries';
import type { Showcase } from '~/db/types';

interface ShowcaseCardProps {
	showcase: Showcase;
	user?: {
		id: string;
		name: string | null;
		image: string | null;
	} | null;
	currentUserVote?: 1 | -1 | null;
	onVote?: (value: 1 | -1) => void;
	isVoting?: boolean;
	className?: string;
}

const libraryMap = new Map(libraries.map((lib) => [lib.id, lib]));

export function ShowcaseCard({
	showcase,
	currentUserVote,
	onVote,
	isVoting,
	className,
}: ShowcaseCardProps) {
	const displayScore = Math.max(0, showcase.voteScore);

	return (
		<div
			className={twMerge(
				'group relative rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700 flex flex-col h-full',
				className,
			)}
		>
			{/* Main link area - links to detail page */}
			<Link to="/showcase/$id" params={{ id: showcase.id }} className="block flex-1 flex flex-col">
				{/* Screenshot */}
				<div className="relative aspect-video overflow-hidden bg-gray-100 dark:bg-gray-900">
					<img
						src={showcase.screenshotUrl}
						alt={showcase.name}
						loading="lazy"
						decoding="async"
						fetchPriority="low"
						className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
					/>
					{/* Logo overlay */}
					{showcase.logoUrl && (
						<div className="absolute bottom-3 left-3 w-10 h-10 rounded-lg bg-white dark:bg-gray-800 shadow-md overflow-hidden">
							<img
								src={showcase.logoUrl}
								alt=""
								loading="lazy"
								decoding="async"
								className="w-full h-full object-cover"
							/>
						</div>
					)}
				</div>

				{/* Content */}
				<div className="p-4 flex-1">
					<h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
						{showcase.name}
					</h3>
					<p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
						{showcase.tagline}
					</p>
				</div>
			</Link>

			{/* Action buttons - separate from card link */}
			<div className="absolute top-3 right-3 flex gap-2">
				{showcase.sourceUrl && (
					<a
						href={showcase.sourceUrl}
						target="_blank"
						rel="noopener noreferrer"
						onClick={(e) => e.stopPropagation()}
						className="p-2 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm hover:bg-white dark:hover:bg-gray-700 transition-colors"
						title="View source code"
					>
						<Code className="w-4 h-4 text-gray-600 dark:text-gray-300" />
					</a>
				)}
				<a
					href={showcase.url}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="p-2 rounded-full bg-white/90 dark:bg-gray-800/90 shadow-sm hover:bg-white dark:hover:bg-gray-700 transition-colors"
					title="Visit site"
				>
					<ExternalLink className="w-4 h-4 text-gray-600 dark:text-gray-300" />
				</a>
			</div>

			{/* Footer with libraries and voting */}
			<div className="px-4 pb-4 mt-auto">
				<div className="flex items-end justify-between gap-2">
					{/* Libraries */}
					<div className="flex flex-wrap gap-1.5 min-w-0">
						{showcase.libraries.slice(0, 3).map((libId) => {
							const lib = libraryMap.get(libId as LibraryId);
							return (
								<span
									key={libId}
									className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
								>
									{lib?.name?.replace('TanStack ', '') || libId}
								</span>
							);
						})}
						{showcase.libraries.length > 3 && (
							<span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">
								+{showcase.libraries.length - 3}
							</span>
						)}
					</div>

					{/* Voting */}
					<div className="flex items-center gap-1 shrink-0">
						<button
							type="button"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onVote?.(1);
							}}
							disabled={isVoting}
							className={twMerge(
								'p-1.5 rounded-md transition-colors',
								currentUserVote === 1
									? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
									: 'text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-gray-100 dark:hover:bg-gray-700',
								isVoting && 'opacity-50 cursor-not-allowed',
							)}
							title="Upvote"
						>
							<ThumbsUp
								className="w-4 h-4"
								fill={currentUserVote === 1 ? 'currentColor' : 'none'}
							/>
						</button>

						{displayScore > 0 && (
							<span className="text-sm font-medium text-gray-600 dark:text-gray-400 min-w-[1.5rem] text-center">
								{displayScore}
							</span>
						)}

						<button
							type="button"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								onVote?.(-1);
							}}
							disabled={isVoting}
							className={twMerge(
								'p-1.5 rounded-md transition-colors',
								currentUserVote === -1
									? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'
									: 'text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700',
								isVoting && 'opacity-50 cursor-not-allowed',
							)}
							title="Downvote"
						>
							<ThumbsDown
								className="w-4 h-4"
								fill={currentUserVote === -1 ? 'currentColor' : 'none'}
							/>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function ShowcaseCardSkeleton() {
	return (
		<div className="rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 animate-pulse">
			<div className="aspect-video bg-gray-200 dark:bg-gray-700" />
			<div className="p-4">
				<div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
				<div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mt-2" />
				<div className="flex gap-1.5 mt-3">
					<div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
					<div className="h-5 w-14 bg-gray-200 dark:bg-gray-700 rounded-full" />
				</div>
			</div>
		</div>
	);
}

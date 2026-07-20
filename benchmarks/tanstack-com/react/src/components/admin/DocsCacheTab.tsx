import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock3, Database, GitBranch, RefreshCw } from 'lucide-react';
import { AdminEmptyState, AdminLoading, AdminPageHeader, StatsCard } from '~/components/admin';
import { Card } from '~/components/Card';
import { formatDistanceToNow } from '~/utils/dates';
import { invalidateDocsCache, listDocsCacheRepos } from '~/utils/docs-admin.functions';
import { docsWebhookSources } from '~/utils/docs-webhook-sources';
import { Button } from '~/ui';

const docsCacheQueryKey = ['admin', 'docs-cache'] as const;

type DocsCacheResponse = Awaited<ReturnType<typeof listDocsCacheRepos>>;
type DocsCacheRepo = DocsCacheResponse['repos'][number];

function getRepoStatus(repo: DocsCacheRepo) {
	if (repo.totalEntries === 0) {
		return {
			label: 'No Cache',
			className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
		};
	}

	if (repo.staleEntries === 0) {
		return {
			label: 'Fresh',
			className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
		};
	}

	if (repo.staleEntries === repo.totalEntries) {
		return {
			label: 'Stale',
			className: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
		};
	}

	return {
		label: 'Mixed',
		className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
	};
}

export function DocsCacheTab() {
	const queryClient = useQueryClient();
	const docsCacheQuery = useQuery({
		queryKey: docsCacheQueryKey,
		queryFn: () => listDocsCacheRepos(),
		staleTime: 0,
	});

	const invalidateMutation = useMutation({
		mutationFn: (repo: string | null) => invalidateDocsCache({ data: repo ? { repo } : {} }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: docsCacheQueryKey });
		},
	});

	const data = docsCacheQuery.data;
	const repos =
		data && data.repos.length > 0
			? data.repos
			: docsWebhookSources.map((source) => ({
					repo: source.repo,
					refs: source.refs,
					isWatched: true,
					contentEntries: 0,
					artifactEntries: 0,
					staleContentEntries: 0,
					staleArtifactEntries: 0,
					totalEntries: 0,
					staleEntries: 0,
					cachedRefCount: source.refs.length,
					lastUpdatedAt: null,
				}));

	if (docsCacheQuery.isLoading && !data) {
		return <AdminLoading />;
	}

	if (!data && !docsCacheQuery.isError && repos.length === 0) {
		return (
			<div className="space-y-6">
				<AdminPageHeader icon={<BookOpen />} title="Docs Cache" />
				<AdminEmptyState
					icon={<Database className="h-6 w-6" />}
					title="No docs cache repos found"
					description="No watched repos or cached docs entries are available yet."
				/>
			</div>
		);
	}

	const invalidatingRepo = invalidateMutation.variables;
	const invalidatingAll = invalidateMutation.isPending && invalidatingRepo === null;

	return (
		<div className="space-y-6">
			<AdminPageHeader
				icon={<BookOpen />}
				title="Docs Cache"
				isLoading={docsCacheQuery.isFetching}
				actions={
					<Button
						size="sm"
						color="orange"
						onClick={() => invalidateMutation.mutate(null)}
						disabled={invalidateMutation.isPending || (data?.summary.totalEntries ?? 0) === 0}
						title="Mark every cached docs row stale so the next docs request repopulates it"
					>
						<RefreshCw className={invalidatingAll ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
						{invalidatingAll ? 'Invalidating...' : 'Invalidate All Docs'}
					</Button>
				}
			/>

			<Card className="p-4">
				<p className="text-sm text-gray-600 dark:text-gray-400">
					Marks cached docs content and generated docs artifacts stale in the database. Nothing is
					deleted. The next docs request for that repo will fetch fresh content from GitHub and
					rebuild derived artifacts.
				</p>
			</Card>

			{docsCacheQuery.isError ? (
				<MutationBanner
					tone="error"
					title="Docs cache overview failed to load"
					description={
						docsCacheQuery.error instanceof Error
							? docsCacheQuery.error.message
							: String(docsCacheQuery.error)
					}
					onDismiss={() => docsCacheQuery.refetch()}
				/>
			) : null}

			{invalidateMutation.data ? (
				<MutationBanner
					tone={invalidateMutation.data.totalInvalidated > 0 ? 'success' : 'neutral'}
					title={
						invalidateMutation.data.repo
							? `Invalidated ${invalidateMutation.data.repo}`
							: 'Invalidated all docs repos'
					}
					description={`${invalidateMutation.data.totalInvalidated.toLocaleString()} entries marked stale (${invalidateMutation.data.staleContentCount.toLocaleString()} content, ${invalidateMutation.data.staleArtifactCount.toLocaleString()} artifacts).`}
					onDismiss={() => invalidateMutation.reset()}
				/>
			) : null}

			{invalidateMutation.isError ? (
				<MutationBanner
					tone="error"
					title="Docs invalidation failed"
					description={
						invalidateMutation.error instanceof Error
							? invalidateMutation.error.message
							: String(invalidateMutation.error)
					}
					onDismiss={() => invalidateMutation.reset()}
				/>
			) : null}

			<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
				<StatsCard
					label="Watched Repos"
					value={data?.summary.watchedRepoCount ?? docsWebhookSources.length}
					icon={<GitBranch className="h-5 w-5" />}
				/>
				<StatsCard
					label="Cached Repos"
					value={data?.summary.cachedRepoCount ?? 0}
					icon={<Database className="h-5 w-5" />}
				/>
				<StatsCard
					label="Content Rows"
					value={data?.summary.contentEntries ?? 0}
					icon={<BookOpen className="h-5 w-5" />}
				/>
				<StatsCard
					label="Artifact Rows"
					value={data?.summary.artifactEntries ?? 0}
					icon={<Clock3 className="h-5 w-5" />}
				/>
			</div>

			<Card className="overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950/40">
							<tr>
								<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
									Repo
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
									Refs
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
									Cache Rows
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
									Status
								</th>
								<th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
									Last Touched
								</th>
								<th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
									Action
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-gray-200 dark:divide-gray-800">
							{repos.map((repo) => {
								const status = getRepoStatus(repo);
								const isInvalidatingRepo =
									invalidateMutation.isPending && invalidatingRepo === repo.repo;

								return (
									<tr key={repo.repo} className="bg-white dark:bg-gray-900/70">
										<td className="px-4 py-3 align-top">
											<div className="font-mono text-xs text-gray-900 dark:text-gray-100">
												{repo.repo}
											</div>
											<div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
												{repo.isWatched ? 'watched' : 'cached only'}
											</div>
										</td>
										<td className="px-4 py-3 align-top">
											{repo.refs.length > 0 ? (
												<div className="flex flex-wrap gap-1">
													{repo.refs.map((ref) => (
														<span
															key={ref}
															className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300"
														>
															{ref}
														</span>
													))}
												</div>
											) : repo.cachedRefCount > 0 ? (
												<span className="text-xs text-gray-500 dark:text-gray-400">
													{repo.cachedRefCount} cached ref
													{repo.cachedRefCount === 1 ? '' : 's'}
												</span>
											) : (
												<span className="text-xs text-gray-400 dark:text-gray-500">—</span>
											)}
										</td>
										<td className="px-4 py-3 align-top">
											<div className="font-medium text-gray-900 dark:text-gray-100">
												{repo.totalEntries.toLocaleString()}
											</div>
											<div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
												{repo.contentEntries.toLocaleString()} content,{' '}
												{repo.artifactEntries.toLocaleString()} artifacts
											</div>
											{repo.staleEntries > 0 ? (
												<div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
													{repo.staleEntries.toLocaleString()} already stale
												</div>
											) : null}
										</td>
										<td className="px-4 py-3 align-top">
											<span
												className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.className}`}
											>
												{status.label}
											</span>
										</td>
										<td className="px-4 py-3 align-top text-xs text-gray-500 dark:text-gray-400">
											{repo.lastUpdatedAt
												? formatDistanceToNow(new Date(repo.lastUpdatedAt), {
														addSuffix: true,
													})
												: 'Never'}
										</td>
										<td className="px-4 py-3 align-top text-right">
											<Button
												size="sm"
												color="orange"
												onClick={() => invalidateMutation.mutate(repo.repo)}
												disabled={invalidateMutation.isPending || repo.totalEntries === 0}
												title={`Mark ${repo.repo} docs cache entries stale`}
											>
												<RefreshCw
													className={isInvalidatingRepo ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
												/>
												{isInvalidatingRepo ? 'Invalidating...' : 'Invalidate'}
											</Button>
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</Card>
		</div>
	);
}

function MutationBanner({
	title,
	description,
	tone,
	onDismiss,
}: {
	title: string;
	description: string;
	tone: 'error' | 'neutral' | 'success';
	onDismiss: () => void;
}) {
	const className = {
		success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30',
		neutral: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30',
		error: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30',
	}[tone];

	return (
		<div className={`rounded-lg border p-4 ${className}`}>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-sm font-medium text-gray-900 dark:text-white">{title}</div>
					<div className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</div>
				</div>
				<button
					type="button"
					onClick={onDismiss}
					className="text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
				>
					dismiss
				</button>
			</div>
		</div>
	);
}

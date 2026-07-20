import { libraries } from '~/libraries';
import { docsWebhookSources } from '~/utils/docs-webhook-sources';
import { requireCapability } from './auth.server';
import {
	listDocsCacheRepoStats,
	markDocsArtifactsStale,
	markGitHubContentStale,
} from './github-content-cache.server';
import { purgeHostingCacheTags } from './hosting-cache.server';

export async function listDocsCacheReposAdmin() {
	await requireCapability({ data: { capability: 'admin' } });

	const cacheRows = await listDocsCacheRepoStats();
	const watchedRefsByRepo = new Map(docsWebhookSources.map((source) => [source.repo, source.refs]));
	const cacheByRepo = new Map(cacheRows.map((row) => [row.repo, row]));
	const repoNames = new Set<string>();

	for (const repo of watchedRefsByRepo.keys()) {
		repoNames.add(repo);
	}

	for (const repo of cacheByRepo.keys()) {
		repoNames.add(repo);
	}

	const repos = Array.from(repoNames)
		.map((repo) => {
			const cache = cacheByRepo.get(repo);
			const refs = watchedRefsByRepo.get(repo) ?? [];
			const contentEntries = cache?.contentEntries ?? 0;
			const artifactEntries = cache?.artifactEntries ?? 0;
			const staleContentEntries = cache?.staleContentEntries ?? 0;
			const staleArtifactEntries = cache?.staleArtifactEntries ?? 0;

			return {
				repo,
				refs,
				isWatched: watchedRefsByRepo.has(repo),
				contentEntries,
				artifactEntries,
				staleContentEntries,
				staleArtifactEntries,
				totalEntries: contentEntries + artifactEntries,
				staleEntries: staleContentEntries + staleArtifactEntries,
				cachedRefCount: cache?.cachedRefCount ?? 0,
				lastUpdatedAt: cache?.lastUpdatedAt ?? null,
			};
		})
		.sort((a, b) => b.totalEntries - a.totalEntries || a.repo.localeCompare(b.repo));

	return {
		repos,
		summary: {
			watchedRepoCount: docsWebhookSources.length,
			cachedRepoCount: repos.filter((repo) => repo.totalEntries > 0).length,
			contentEntries: repos.reduce((total, repo) => total + repo.contentEntries, 0),
			artifactEntries: repos.reduce((total, repo) => total + repo.artifactEntries, 0),
			staleEntries: repos.reduce((total, repo) => total + repo.staleEntries, 0),
			totalEntries: repos.reduce((total, repo) => total + repo.totalEntries, 0),
		},
	};
}

export async function invalidateDocsCacheAdmin(opts: {
	data: {
		repo?: string;
	};
}) {
	await requireCapability({ data: { capability: 'admin' } });

	const [staleContentCount, staleArtifactCount] = await Promise.all([
		markGitHubContentStale({ repo: opts.data.repo }),
		markDocsArtifactsStale({ repo: opts.data.repo }),
	]);

	const tags = opts.data.repo
		? [
				`docs-config:${opts.data.repo}`,
				...libraries
					.filter((library) => library.repo === opts.data.repo)
					.map((library) => `docs:${library.id}`),
			]
		: ['docs:all', 'docs-config:all'];

	const purge = await purgeHostingCacheTags(tags);

	return {
		repo: opts.data.repo ?? null,
		staleContentCount,
		staleArtifactCount,
		totalInvalidated: staleContentCount + staleArtifactCount,
		purge,
	};
}

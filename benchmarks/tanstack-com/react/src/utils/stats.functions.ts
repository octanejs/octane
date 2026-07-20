/**
 * Pure stats functions that can be used by both TanStack Start server functions
 * and Worker cron tasks. No TanStack Start dependencies.
 */

import { envFunctions } from './env.functions';
import type { GitHubStats } from './stats.types';

function getGitHubHeaders() {
	const token = envFunctions.GITHUB_AUTH_TOKEN;

	return {
		...(token && token !== 'USE_A_REAL_KEY_IN_PRODUCTION'
			? { Authorization: `Bearer ${token}` }
			: {}),
		Accept: 'application/vnd.github.v3+json',
		'User-Agent': 'TanStack-Stats',
	};
}

/**
 * Fetch GitHub repository statistics
 */
export async function fetchGitHubRepoStats(repo: string): Promise<GitHubStats> {
	const repoData = await fetch(`https://api.github.com/repos/${repo}`, {
		headers: getGitHubHeaders(),
	}).then(async (res) => {
		if (!res.ok) {
			// Check for rate limiting
			if (res.status === 403) {
				const rateLimitRemaining = res.headers.get('X-RateLimit-Remaining');
				if (rateLimitRemaining === '0') {
					const rateLimitReset = res.headers.get('X-RateLimit-Reset');
					const resetTime = rateLimitReset
						? new Date(parseInt(rateLimitReset, 10) * 1000)
						: new Date(Date.now() + 60 * 60 * 1000);
					throw new Error(`GitHub API rate limit exceeded. Resets at: ${resetTime.toISOString()}`);
				}
			}
			const errorText = await res.text().catch(() => 'Unknown error');
			throw new Error(`GitHub API error: ${res.status} - ${errorText}`);
		}
		return res.json();
	});

	return {
		starCount: repoData.stargazers_count ?? 0,
		contributorCount: 0,
		dependentCount: 0,
		forkCount: repoData.forks_count ?? 0,
	};
}

/**
 * Fetch GitHub organization statistics (aggregate across all repos)
 */
export async function fetchGitHubOwnerStats(owner: string): Promise<GitHubStats> {
	// Fetch all repos for the organization
	const repos: any[] = [];
	let page = 1;
	let hasMore = true;

	while (hasMore) {
		const response = await fetch(
			`https://api.github.com/orgs/${owner}/repos?per_page=100&page=${page}&sort=stars`,
			{
				headers: getGitHubHeaders(),
			},
		);

		if (!response.ok) {
			// Handle rate limiting
			if (response.status === 403) {
				const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
				const rateLimitReset = response.headers.get('X-RateLimit-Reset');

				if (rateLimitRemaining === '0') {
					const resetTime = rateLimitReset
						? new Date(parseInt(rateLimitReset, 10) * 1000)
						: new Date(Date.now() + 60 * 60 * 1000); // Default to 1 hour
					console.error(`[GitHub API] Rate limit exceeded. Resets at: ${resetTime.toISOString()}`);
					throw new Error(`GitHub API rate limit exceeded. Resets at: ${resetTime.toISOString()}`);
				}

				// 403 without rate limit means permission issue
				const errorText = await response.text().catch(() => 'Unknown error');
				console.error(
					`[GitHub API] 403 Forbidden for org/${owner}. Token may lack required permissions. Error: ${errorText}`,
				);
				throw new Error(
					`GitHub API 403 Forbidden. Token may lack required permissions for organization access.`,
				);
			}

			// Handle other errors
			const errorText = await response.text().catch(() => 'Unknown error');
			console.error(`[GitHub API] Error ${response.status} fetching org/${owner}: ${errorText}`);
			throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
		}

		const pageRepos = await response.json();
		repos.push(...pageRepos);

		// Check if there are more pages
		const linkHeader = response.headers.get('Link');
		hasMore = linkHeader?.includes('rel="next"') ?? false;
		page++;
	}

	// Aggregate stats
	const starCount = repos.reduce((sum, repo) => sum + (repo.stargazers_count ?? 0), 0);

	const forkCount = repos.reduce((sum, repo) => sum + (repo.forks_count ?? 0), 0);

	return {
		starCount,
		contributorCount: 0,
		dependentCount: 0,
		forkCount,
		repositoryCount: repos.length,
	};
}

export async function getNpmOrgPackageNames(org: string): Promise<string[]> {
	const response = await fetch(`https://registry.npmjs.org/-/org/${org}/package`, {
		headers: {
			Accept: 'application/json',
			'User-Agent': 'TanStack-Stats',
		},
	});

	if (!response.ok) {
		console.error(
			`[NPM Stats] Org packages fetch failed: ${response.status} ${response.statusText}`,
		);
		throw new Error(`NPM API error: ${response.status}`);
	}

	const data = await response.json();
	const packageNames = Object.keys(data);

	if (packageNames.length === 0) {
		console.error(`[NPM Stats] No packages found for org ${org}`);
		return [];
	}

	const { libraries } = await import('~/libraries');
	const legacyPackages = libraries.flatMap((library) => library.legacyPackages ?? []);

	return [...new Set([...packageNames, ...legacyPackages])];
}

/**
 * Refresh GitHub organization statistics
 * Fetches and caches GitHub stats for the org and all library repos
 */
export async function refreshGitHubOrgStats(org: string): Promise<{
	orgStats: GitHubStats;
	libraryResults: Array<{ repo: string; stars: number }>;
	libraryErrors: Array<{ repo: string; error: string }>;
}> {
	const { setCachedGitHubStats, rebuildOssStatsCache } = await import('./stats-db.server');

	// Refresh GitHub org stats
	console.log('[GitHub Stats] Refreshing GitHub org stats...');
	const githubCacheKey = `org:${org}`;
	const githubStats = await fetchGitHubOwnerStats(org);
	await setCachedGitHubStats(githubCacheKey, githubStats, 1);

	// Refresh GitHub stats for each library repo
	console.log('[GitHub Stats] Refreshing GitHub stats for individual libraries...');
	const { libraries } = await import('~/libraries');
	console.log(
		`[GitHub Stats] Found ${libraries.length} libraries to process:`,
		libraries.map((lib) => ({ id: lib.id, repo: lib.repo })),
	);
	const libraryResults = [];
	const libraryErrors = [];

	for (let i = 0; i < libraries.length; i++) {
		const library = libraries[i];
		if (!library.repo) {
			console.log(`[GitHub Stats] Skipping library ${library.id} - no repo`);
			continue;
		}

		console.log(`[GitHub Stats] Processing library ${library.id} (${library.repo})...`);
		try {
			const repoStats = await fetchGitHubRepoStats(library.repo);
			console.log(`[GitHub Stats] Fetched stats for ${library.repo}: ${repoStats.starCount} stars`);
			await setCachedGitHubStats(library.repo, repoStats, 1);
			console.log(`[GitHub Stats] ✓ Successfully cached stats for ${library.repo}`);
			libraryResults.push({
				repo: library.repo,
				stars: repoStats.starCount,
			});

			// Add delay between requests to avoid rate limiting (except for last item)
			if (i < libraries.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[GitHub Stats] Failed to refresh ${library.repo}:`, errorMessage);
			libraryErrors.push({
				repo: library.repo,
				error: errorMessage,
			});
		}
	}

	await rebuildOssStatsCache(org);

	return {
		orgStats: githubStats,
		libraryResults,
		libraryErrors,
	};
}

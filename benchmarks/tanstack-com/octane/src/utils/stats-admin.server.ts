/**
 * Admin server functions for managing GitHub and NPM stats
 */

import { db } from '~/db/client';
import { githubStatsCache } from '~/db/schema';
import { desc, like } from 'drizzle-orm';
import { fetchGitHubOwnerStats, fetchGitHubRepoStats } from './stats.functions';
import { rebuildOssStatsCache, setCachedGitHubStats } from './stats-db.server';
import { requireCapability } from './auth.server';
import { refreshHomepageNpmStatsSummary } from './homepage-npm-stats.server';

/**
 * List all GitHub stats cache entries
 */
export async function listGitHubStatsCache() {
	await requireCapability({ data: { capability: 'admin' } });

	const entries = await db.query.githubStatsCache.findMany({
		orderBy: [desc(githubStatsCache.updatedAt)],
	});

	return entries.map((entry) => ({
		cacheKey: entry.cacheKey,
		stats: entry.stats as any,
		previousStats: entry.previousStats as any,
		expiresAt: entry.expiresAt,
		createdAt: entry.createdAt,
		updatedAt: entry.updatedAt,
	}));
}

/**
 * Refresh GitHub stats for a specific repo or org
 */
export async function refreshGitHubStats({ data }: { data: any }) {
	await requireCapability({ data: { capability: 'admin' } });

	const isOrg = data.cacheKey.startsWith('org:');
	const identifier = isOrg ? data.cacheKey.replace('org:', '') : data.cacheKey;

	let stats;
	if (isOrg) {
		stats = await fetchGitHubOwnerStats(identifier);
	} else {
		stats = await fetchGitHubRepoStats(identifier);
	}

	await setCachedGitHubStats(data.cacheKey, stats, 1);
	await rebuildOssStatsCache('tanstack');

	return {
		success: true,
		cacheKey: data.cacheKey,
		stats,
	};
}

/**
 * Refresh all GitHub stats cache entries
 * Processes all libraries from the libraries array, plus any existing org cache entries
 */
export async function refreshAllGitHubStats() {
	await requireCapability({ data: { capability: 'admin' } });

	const results = [];
	const errors = [];

	// First, refresh all libraries from the libraries array
	const { libraries } = await import('~/libraries');
	console.log(
		`[GitHub Stats Refresh] Processing ${libraries.length} libraries from libraries array`,
	);

	for (let i = 0; i < libraries.length; i++) {
		const library = libraries[i];
		if (!library.repo) {
			console.log(`[GitHub Stats Refresh] Skipping library ${library.id} - no repo`);
			continue;
		}

		try {
			const stats = await fetchGitHubRepoStats(library.repo);
			await setCachedGitHubStats(library.repo, stats, 1);

			results.push({
				cacheKey: library.repo,
				success: true,
				stats,
			});

			// Add delay between requests to avoid rate limiting (except for last item)
			if (i < libraries.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[GitHub Stats Refresh] Failed to refresh ${library.repo}:`, errorMessage);
			errors.push({
				cacheKey: library.repo,
				success: false,
				error: errorMessage,
			});
		}
	}

	// Also refresh any org-level cache entries (like "org:tanstack")
	const orgEntries = await db.query.githubStatsCache.findMany({
		where: like(githubStatsCache.cacheKey, 'org:%'),
	});

	for (let i = 0; i < orgEntries.length; i++) {
		const entry = orgEntries[i];
		try {
			const identifier = entry.cacheKey.replace('org:', '');
			const stats = await fetchGitHubOwnerStats(identifier);
			await setCachedGitHubStats(entry.cacheKey, stats, 1);

			results.push({
				cacheKey: entry.cacheKey,
				success: true,
				stats,
			});

			// Add delay between requests to avoid rate limiting (except for last item)
			if (i < orgEntries.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			console.error(`[GitHub Stats Refresh] Failed to refresh ${entry.cacheKey}:`, errorMessage);
			errors.push({
				cacheKey: entry.cacheKey,
				success: false,
				error: errorMessage,
			});
		}
	}

	await rebuildOssStatsCache('tanstack');

	return {
		success: true,
		refreshed: results.length,
		failed: errors.length,
		results,
		errors,
	};
}

export async function refreshAllNpmStats({ data }: { data: any }) {
	console.log(`[Admin] refreshAllNpmStats handler called with org: ${data.org}`);

	await requireCapability({ data: { capability: 'admin' } });

	const summary = await refreshHomepageNpmStatsSummary({ org: data.org });

	return {
		success: true,
		org: data.org,
		summary,
	};
}

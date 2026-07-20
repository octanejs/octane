/**
 * GitHub Example Fetching Utilities
 *
 * Functions for fetching example files from GitHub repositories.
 */

import {
	cancelUnusedResponseBody,
	fetchGitHubRecursiveTree,
	getGitHubContentFetchOptions,
	GitHubContentError,
	isGitHubAuthFailureStatus,
} from './documents.server';
import { getCachedGitHubTextFile } from './github-content-cache.server';
import { fetchWithTimeout, readResponseTextWithLimit } from './outbound-fetch.server';

const RAW_FETCH_CONCURRENCY = 6;
const MAX_EXAMPLE_FILES = 500;
const MAX_EXAMPLE_FILE_BYTES = 1 * 1024 * 1024;
const EXAMPLE_FETCH_TIMEOUT_MS = 10_000;

export interface FetchExampleFilesResult {
	success: true;
	files: Record<string, string>;
}

export interface FetchExampleFilesError {
	success: false;
	error: string;
}

/**
 * Fetch all files from a GitHub example directory.
 */
export async function fetchExampleFiles(
	repo: string,
	branch: string,
	examplePath: string,
): Promise<FetchExampleFilesResult | FetchExampleFilesError> {
	console.log('[fetchExampleFiles] Fetching:', { repo, branch, examplePath });

	const tree = await fetchGitHubRecursiveTree(repo, branch);

	if (!tree) {
		return {
			success: false,
			error: `Failed to fetch example directory: ${examplePath}`,
		};
	}

	const normalizedExamplePath = examplePath.replace(/^\/+|\/+$/g, '');
	const fileEntries = tree.filter(
		(entry) =>
			entry.type === 'blob' &&
			entry.path.startsWith(`${normalizedExamplePath}/`) &&
			!shouldExcludeFile(entry.path.slice(normalizedExamplePath.length + 1)),
	);

	if (fileEntries.length > MAX_EXAMPLE_FILES) {
		return {
			success: false,
			error: `Example has too many files; maximum is ${MAX_EXAMPLE_FILES}`,
		};
	}

	if (fileEntries.length === 0) {
		return {
			success: false,
			error: `No files found in example path: ${examplePath}`,
		};
	}

	try {
		const files = Object.fromEntries(
			await mapWithConcurrency(fileEntries, RAW_FETCH_CONCURRENCY, async (entry) => {
				const relativePath = entry.path.slice(normalizedExamplePath.length + 1);
				const content = await fetchRawGitHubFile(repo, branch, entry.path);

				if (content === null) {
					throw new Error(`Missing file content for ${entry.path}`);
				}

				return [relativePath, content] as const;
			}),
		);

		console.log('[fetchExampleFiles] Fetched', Object.keys(files).length, 'files');

		return { success: true, files };
	} catch (error) {
		console.error('[fetchExampleFiles] Failed:', error);

		return {
			success: false,
			error: error instanceof Error ? error.message : 'Failed to fetch example files',
		};
	}
}

async function fetchRawGitHubFile(repo: string, branch: string, filePath: string) {
	return getCachedGitHubTextFile({
		repo,
		gitRef: branch,
		path: filePath,
		origin: async () => {
			const href = new URL(`${repo}/${branch}/${filePath}`, 'https://raw.githubusercontent.com/')
				.href;

			let response: Response;

			try {
				response = await fetchWithTimeout(href, {
					...getGitHubContentFetchOptions({
						includeApiVersion: false,
						userAgent: `examples:${repo}`,
					}),
					timeoutMs: EXAMPLE_FETCH_TIMEOUT_MS,
				});

				if (isGitHubAuthFailureStatus(response.status)) {
					await cancelUnusedResponseBody(response);
					response = await fetchWithTimeout(href, {
						...getGitHubContentFetchOptions({
							includeApiVersion: false,
							includeAuthorization: false,
							userAgent: `examples:${repo}`,
						}),
						timeoutMs: EXAMPLE_FETCH_TIMEOUT_MS,
					});
				}
			} catch (error) {
				throw new GitHubContentError('network', `Failed to fetch ${repo}@${branch}:${filePath}`, {
					cause: error,
				});
			}

			if (!response.ok) {
				await cancelUnusedResponseBody(response);

				if (response.status === 404) {
					return null;
				}

				throw new GitHubContentError(
					response.status === 403 || response.status === 429
						? 'rate-limit'
						: response.status >= 500
							? 'server'
							: 'forbidden',
					`GitHub failed to serve ${repo}@${branch}:${filePath}`,
					{ status: response.status },
				);
			}

			return readResponseTextWithLimit(response, MAX_EXAMPLE_FILE_BYTES);
		},
	});
}

async function mapWithConcurrency<T, TResult>(
	values: Array<T>,
	concurrency: number,
	fn: (value: T) => Promise<TResult>,
) {
	const results = new Array<TResult>(values.length);
	let index = 0;

	const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
		while (index < values.length) {
			const currentIndex = index;
			index += 1;
			results[currentIndex] = await fn(values[currentIndex]);
		}
	});

	await Promise.all(workers);

	return results;
}

/**
 * Files/directories to exclude when copying examples
 */
const EXCLUDED_PATTERNS = [
	'node_modules',
	'.git',
	'dist',
	'.output',
	'.netlify',
	'.vercel',
	'.DS_Store',
	'.nitro',
	'test-results',
	'playwright-report',
];

/**
 * Check if a file should be excluded
 */
export function shouldExcludeFile(path: string): boolean {
	return EXCLUDED_PATTERNS.some((pattern) => path === pattern || path.startsWith(`${pattern}/`));
}

/**
 * Filter out excluded files from a files record
 */
export function filterExcludedFiles(files: Record<string, string>): Record<string, string> {
	const filtered: Record<string, string> = {};

	for (const [path, content] of Object.entries(files)) {
		if (!shouldExcludeFile(path)) {
			filtered[path] = content;
		}
	}

	return filtered;
}

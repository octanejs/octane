/**
 * GitHub Repository Utilities
 *
 * Functions for creating and managing GitHub repositories via the API.
 */
import { fetchWithTimeout } from '~/utils/outbound-fetch.server';

export interface CreateRepoOptions {
	name: string;
	description?: string;
	isPrivate?: boolean;
	autoInit?: boolean;
}

export interface CreateRepoResult {
	success: true;
	repoUrl: string;
	owner: string;
	name: string;
}

export interface CreateRepoError {
	success: false;
	error: string;
	code: 'NAME_TAKEN' | 'INVALID_NAME' | 'RATE_LIMITED' | 'UNAUTHORIZED' | 'UNKNOWN';
}

export interface GitHubFileBudgetOptions {
	maxFiles?: number;
	maxFileBytes?: number;
	maxTotalBytes?: number;
}

const GITHUB_API_TIMEOUT_MS = 10_000;
const DEFAULT_GITHUB_FILE_BUDGET = {
	maxFiles: 500,
	maxFileBytes: 1 * 1024 * 1024,
	maxTotalBytes: 8 * 1024 * 1024,
} satisfies Required<GitHubFileBudgetOptions>;

const BLOCKED_GITHUB_PATH_SEGMENTS = new Set(['.git', '.hg', '.svn', 'node_modules']);

async function fetchGitHub(input: string | URL | Request, init: RequestInit = {}) {
	return fetchWithTimeout(input, {
		...init,
		timeoutMs: GITHUB_API_TIMEOUT_MS,
	});
}

function isSafeGitHubPath(path: string) {
	if (!path || path.length > 260) return false;
	if (path.startsWith('/') || path.includes('\\')) return false;

	const segments = path.split('/');
	return segments.every(
		(segment) =>
			segment && segment !== '.' && segment !== '..' && !BLOCKED_GITHUB_PATH_SEGMENTS.has(segment),
	);
}

export function validateGitHubFiles(
	files: Record<string, string>,
	options: GitHubFileBudgetOptions = {},
): { valid: true } | { valid: false; error: string } {
	const budget = {
		...DEFAULT_GITHUB_FILE_BUDGET,
		...options,
	};
	const entries = Object.entries(files);

	if (entries.length === 0) {
		return { valid: false, error: 'No files to push' };
	}

	if (entries.length > budget.maxFiles) {
		return {
			valid: false,
			error: `Too many files to push; maximum is ${budget.maxFiles}`,
		};
	}

	let totalBytes = 0;
	const encoder = new TextEncoder();

	for (const [path, content] of entries) {
		if (!isSafeGitHubPath(path)) {
			return { valid: false, error: `Invalid file path: ${path}` };
		}

		const fileBytes = encoder.encode(content).byteLength;
		if (fileBytes > budget.maxFileBytes) {
			return {
				valid: false,
				error: `File is too large: ${path}`,
			};
		}

		totalBytes += fileBytes;
		if (totalBytes > budget.maxTotalBytes) {
			return {
				valid: false,
				error: `Total file size exceeds ${budget.maxTotalBytes} bytes`,
			};
		}
	}

	return { valid: true };
}

/**
 * Create a new GitHub repository
 */
export async function createRepository(
	accessToken: string,
	options: CreateRepoOptions,
): Promise<CreateRepoResult | CreateRepoError> {
	const response = await fetchGitHub('https://api.github.com/user/repos', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/vnd.github.v3+json',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name: options.name,
			description: options.description,
			private: options.isPrivate ?? false,
			auto_init: options.autoInit ?? false,
		}),
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		const message = error.message ?? 'Unknown error';
		const errors = error.errors ?? [];
		console.error('[GitHub] Create repo failed:', {
			status: response.status,
			message,
			errors,
		});

		if (response.status === 401) {
			return { success: false, error: message, code: 'UNAUTHORIZED' };
		}
		if (response.status === 403) {
			return { success: false, error: message, code: 'RATE_LIMITED' };
		}
		if (response.status === 422) {
			// Check for name already exists in message or errors array
			const nameExists =
				message.includes('name already exists') ||
				errors.some((e: { message?: string }) => e.message?.includes('name already exists'));
			if (nameExists) {
				return {
					success: false,
					error: 'Repository name already exists',
					code: 'NAME_TAKEN',
				};
			}
			// Return more detailed error message
			const detailedError =
				errors.length > 0 ? errors.map((e: { message?: string }) => e.message).join(', ') : message;
			return { success: false, error: detailedError, code: 'INVALID_NAME' };
		}
		return { success: false, error: message, code: 'UNKNOWN' };
	}

	const repo = await response.json();
	return {
		success: true,
		repoUrl: repo.html_url,
		owner: repo.owner.login,
		name: repo.name,
	};
}

/**
 * Check if a repository name is available
 */
export async function checkRepoNameAvailable(accessToken: string, name: string): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5000);

	try {
		// Get the authenticated user's username
		const userResponse = await fetchGitHub('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github.v3+json',
			},
			signal: controller.signal,
		});

		if (!userResponse.ok) return true; // Assume available on error

		const user = await userResponse.json();
		const username = user.login;

		// Check if repo exists
		const repoResponse = await fetchGitHub(`https://api.github.com/repos/${username}/${name}`, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github.v3+json',
			},
			signal: controller.signal,
		});

		// 404 means repo doesn't exist, so name is available
		return repoResponse.status === 404;
	} catch {
		// On timeout or network error, assume available (don't block the user)
		return true;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Validate a repository name
 */
export function validateRepoName(name: string): {
	valid: boolean;
	error?: string;
} {
	if (!name) {
		return { valid: false, error: 'Repository name is required' };
	}

	if (name.length > 100) {
		return {
			valid: false,
			error: 'Repository name must be 100 characters or less',
		};
	}

	// GitHub repo name rules: alphanumeric, hyphens, underscores, periods
	// Cannot start with a period or hyphen
	const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
	if (!validPattern.test(name)) {
		return {
			valid: false,
			error: 'Repository name can only contain letters, numbers, hyphens, underscores, and periods',
		};
	}

	// Reserved names
	const reserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
	if (reserved.includes(name.toUpperCase())) {
		return { valid: false, error: 'This name is reserved' };
	}

	return { valid: true };
}

/**
 * Generate a repository description from selected integrations
 */
export function generateRepoDescription(integrations: Array<string>): string {
	if (integrations.length === 0) {
		return 'A TanStack Start project';
	}

	const formatted = integrations.map((id) => {
		// Convert kebab-case to Title Case
		return id
			.split('-')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	});

	if (formatted.length === 1) {
		return `A TanStack Start project with ${formatted[0]}`;
	}

	if (formatted.length === 2) {
		return `A TanStack Start project with ${formatted[0]} and ${formatted[1]}`;
	}

	const last = formatted.pop();
	return `A TanStack Start project with ${formatted.join(', ')}, and ${last}`;
}

export interface PushFilesOptions {
	owner: string;
	repo: string;
	files: Record<string, string>;
	message?: string;
	branch?: string;
}

/**
 * Encode string to base64 (handles unicode)
 */
function toBase64(str: string): string {
	// Handle unicode by encoding to UTF-8 first
	const utf8Bytes = new TextEncoder().encode(str);
	let binary = '';
	for (let i = 0; i < utf8Bytes.length; i++) {
		binary += String.fromCharCode(utf8Bytes[i]);
	}
	return btoa(binary);
}

/**
 * Push files to a GitHub repository
 * For empty repos, bootstraps with Contents API then uses Git Data API
 */
export async function pushFiles(
	accessToken: string,
	options: PushFilesOptions,
): Promise<{ success: true; commitSha: string } | { success: false; error: string }> {
	const {
		owner,
		repo,
		files,
		message = 'Initial commit from TanStack Builder',
		branch = 'main',
	} = options;

	const fileValidation = validateGitHubFiles(files);
	if (!fileValidation.valid) {
		return { success: false, error: fileValidation.error };
	}

	// Log file paths for debugging
	const paths = Object.keys(files);
	console.log(
		`[Deploy] Pushing ${paths.length} files:`,
		paths.slice(0, 10),
		paths.length > 10 ? `... and ${paths.length - 10} more` : '',
	);

	const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
	const headers = {
		Authorization: `Bearer ${accessToken}`,
		Accept: 'application/vnd.github.v3+json',
		'Content-Type': 'application/json',
	};

	// Check if the repo is empty by trying to get the branch
	const refResponse = await fetchGitHub(`${baseUrl}/git/ref/heads/${branch}`, {
		headers,
	});
	if (!refResponse.ok && refResponse.status !== 404) {
		return { success: false, error: 'Failed to inspect repository branch' };
	}
	const isEmptyRepo = refResponse.status === 404;

	if (isEmptyRepo) {
		// For empty repos, bootstrap with Contents API (creates first commit)
		// Then add remaining files with Git Data API
		const fileEntries = Object.entries(files);

		if (fileEntries.length === 0) {
			return { success: false, error: 'No files to push' };
		}

		// Pick a small file to bootstrap (README or package.json preferred)
		const bootstrapEntry =
			fileEntries.find(([p]) => p === 'README.md') ??
			fileEntries.find(([p]) => p === 'package.json') ??
			fileEntries[0];

		const [bootstrapPath, bootstrapContent] = bootstrapEntry;

		// Create first file using Contents API
		const createFileResponse = await fetchGitHub(`${baseUrl}/contents/${bootstrapPath}`, {
			method: 'PUT',
			headers,
			body: JSON.stringify({
				message,
				content: toBase64(bootstrapContent),
				branch,
			}),
		});

		if (!createFileResponse.ok) {
			const error = await createFileResponse.json().catch(() => ({}));
			return {
				success: false,
				error: `Failed to create initial file: ${error.message ?? 'Unknown error'}`,
			};
		}

		const createResult = await createFileResponse.json();
		const baseSha = createResult.commit.sha;

		// If only one file, we're done
		if (fileEntries.length === 1) {
			return { success: true, commitSha: baseSha };
		}

		// Get remaining files
		const remainingFiles = Object.fromEntries(fileEntries.filter(([p]) => p !== bootstrapPath));

		// Now use Git Data API to add remaining files in one commit
		// Get base commit's tree using the SHA from the bootstrap commit
		const baseCommitResponse = await fetchGitHub(`${baseUrl}/git/commits/${baseSha}`, { headers });
		if (!baseCommitResponse.ok) {
			const error = await baseCommitResponse.json().catch(() => ({}));
			return {
				success: false,
				error: `Failed to get base commit: ${error.message ?? 'Unknown error'}`,
			};
		}
		const baseCommit = await baseCommitResponse.json();

		// Create tree with remaining files
		const treeEntries = Object.entries(remainingFiles).map(([path, content]) => ({
			path,
			mode: '100644' as const,
			type: 'blob' as const,
			content,
		}));

		const treeResponse = await fetchGitHub(`${baseUrl}/git/trees`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				base_tree: baseCommit.tree.sha,
				tree: treeEntries,
			}),
		});

		if (!treeResponse.ok) {
			const error = await treeResponse.json().catch(() => ({}));
			return {
				success: false,
				error: `Failed to create tree: ${error.message ?? 'Unknown error'}`,
			};
		}

		const tree = await treeResponse.json();

		// Create commit
		const commitResponse = await fetchGitHub(`${baseUrl}/git/commits`, {
			method: 'POST',
			headers,
			body: JSON.stringify({
				message: 'Add project files',
				tree: tree.sha,
				parents: [baseSha],
			}),
		});

		if (!commitResponse.ok) {
			const error = await commitResponse.json().catch(() => ({}));
			return {
				success: false,
				error: `Failed to create commit: ${error.message ?? 'Unknown error'}`,
			};
		}

		const commit = await commitResponse.json();

		// Update branch ref
		const updateRefResponse = await fetchGitHub(`${baseUrl}/git/refs/heads/${branch}`, {
			method: 'PATCH',
			headers,
			body: JSON.stringify({ sha: commit.sha }),
		});

		if (!updateRefResponse.ok) {
			const error = await updateRefResponse.json().catch(() => ({}));
			return {
				success: false,
				error: `Failed to update ref: ${error.message ?? 'Unknown error'}`,
			};
		}

		return { success: true, commitSha: commit.sha };
	}

	// For non-empty repos, use the standard Git Data API flow
	const ref = await refResponse.json();
	const baseSha = ref.object.sha;

	// Get the base tree
	const baseCommitResponse = await fetchGitHub(`${baseUrl}/git/commits/${baseSha}`, {
		headers,
	});
	if (!baseCommitResponse.ok) {
		return { success: false, error: 'Failed to get base commit' };
	}
	const baseCommit = await baseCommitResponse.json();

	// Create tree with base_tree
	const treeEntries = Object.entries(files).map(([path, content]) => ({
		path,
		mode: '100644' as const,
		type: 'blob' as const,
		content,
	}));

	const treeResponse = await fetchGitHub(`${baseUrl}/git/trees`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			base_tree: baseCommit.tree.sha,
			tree: treeEntries,
		}),
	});

	if (!treeResponse.ok) {
		const error = await treeResponse.json().catch(() => ({}));
		return {
			success: false,
			error: `Failed to create tree: ${error.message ?? 'Unknown error'}`,
		};
	}

	const tree = await treeResponse.json();

	// Create commit with parent
	const commitResponse = await fetchGitHub(`${baseUrl}/git/commits`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			message,
			tree: tree.sha,
			parents: [baseSha],
		}),
	});

	if (!commitResponse.ok) {
		const error = await commitResponse.json().catch(() => ({}));
		return {
			success: false,
			error: `Failed to create commit: ${error.message ?? 'Unknown error'}`,
		};
	}

	const commit = await commitResponse.json();

	// Update the branch reference
	const updateRefResponse = await fetchGitHub(`${baseUrl}/git/refs/heads/${branch}`, {
		method: 'PATCH',
		headers,
		body: JSON.stringify({ sha: commit.sha }),
	});

	if (!updateRefResponse.ok) {
		const error = await updateRefResponse.json().catch(() => ({}));
		return {
			success: false,
			error: `Failed to update ref: ${error.message ?? 'Unknown error'}`,
		};
	}

	return { success: true, commitSha: commit.sha };
}

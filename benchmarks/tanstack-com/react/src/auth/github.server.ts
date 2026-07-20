/**
 * GitHub Auth Utilities
 *
 * Helper functions for checking GitHub OAuth scopes and tokens.
 */

import { env } from '~/utils/env';
import { buildGitHubAuthUrl, generateOAuthState, getOAuthAccountRepository } from './index.server';

const REPO_SCOPE = 'public_repo';

function hasRepoScopeInString(tokenScope: string | null): boolean {
	if (!tokenScope) return false;
	const scopes = tokenScope.split(/[,\s]+/);
	return scopes.includes(REPO_SCOPE) || scopes.includes('repo');
}

/**
 * Check if a user has the public_repo scope for GitHub
 */
export async function hasGitHubRepoScope(userId: string): Promise<boolean> {
	const repo = getOAuthAccountRepository();
	const account = await repo.findByUserId(userId, 'github');
	return hasRepoScopeInString(account?.tokenScope ?? null);
}

/**
 * Get a user's GitHub access token
 */
export async function getGitHubToken(userId: string): Promise<string | null> {
	const repo = getOAuthAccountRepository();
	const account = await repo.findByUserId(userId, 'github');
	return account?.accessToken ?? null;
}

/**
 * Get a user's GitHub username from their access token
 */
export async function getGitHubUsername(accessToken: string): Promise<string | null> {
	const response = await fetch('https://api.github.com/user', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'TanStack.com',
		},
	});

	if (!response.ok) return null;

	const profile = await response.json();
	return profile.login ?? null;
}

export interface GitHubAuthState {
	hasGitHubAccount: boolean;
	hasRepoScope: boolean;
	accessToken: string | null;
}

/**
 * Get complete GitHub auth state for a user
 */
export async function getGitHubAuthState(userId: string): Promise<GitHubAuthState> {
	const repo = getOAuthAccountRepository();
	const account = await repo.findByUserId(userId, 'github');

	if (!account) {
		return {
			hasGitHubAccount: false,
			hasRepoScope: false,
			accessToken: null,
		};
	}

	return {
		hasGitHubAccount: true,
		hasRepoScope: hasRepoScopeInString(account.tokenScope),
		accessToken: account.accessToken,
	};
}

/**
 * Build a GitHub re-auth URL with additional scopes
 */
export function buildGitHubReAuthUrl(returnTo: string, additionalScopes: Array<string>): string {
	const clientId = env.GITHUB_OAUTH_CLIENT_ID;
	if (!clientId) {
		throw new Error('GITHUB_OAUTH_CLIENT_ID is not configured');
	}

	const state = generateOAuthState();

	// Build auth URL with additional scopes
	return buildGitHubAuthUrl(clientId, undefined, state, additionalScopes);
}

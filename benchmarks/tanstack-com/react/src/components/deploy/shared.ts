/**
 * Shared Deploy Dialog utilities
 *
 * Common types, constants, and validation for deploy dialogs.
 */

export type DeployProvider = 'cloudflare' | 'netlify' | 'railway';

export type DeployState =
	| { step: 'auth-check' }
	| { step: 'needs-auth' }
	| { step: 'form' }
	| { step: 'deploying'; message: string }
	| { step: 'success'; repoUrl: string; owner: string; repoName: string }
	| { step: 'error'; message: string; code?: string };

export type RepoNameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export interface ProviderInfo {
	name: string;
	color: string;
	deployUrl: (owner: string, repo: string) => string;
}

export const PROVIDER_INFO: Record<DeployProvider, ProviderInfo> = {
	cloudflare: {
		name: 'Cloudflare',
		color: '#F38020',
		deployUrl: (owner, repo) => {
			const url = new URL('https://deploy.workers.cloudflare.com/');

			url.searchParams.set('url', `https://github.com/${owner}/${repo}`);

			return url.toString();
		},
	},
	netlify: {
		name: 'Netlify',
		color: '#00C7B7',
		deployUrl: (owner, repo) => {
			const url = new URL('https://app.netlify.com/start/deploy');

			url.searchParams.set('repository', `https://github.com/${owner}/${repo}`);

			return url.toString();
		},
	},
	railway: {
		name: 'Railway',
		color: '#9B4DCA',
		deployUrl: () => {
			const url = new URL('https://railway.com/new/github');

			url.searchParams.set('utm_medium', 'sponsor');
			url.searchParams.set('utm_source', 'oss');
			url.searchParams.set('utm_campaign', 'tanstack');

			return url.toString();
		},
	},
};

export async function checkRepoNameAvailability(name: string): Promise<{ available: boolean }> {
	const response = await fetch(`/api/builder/deploy/check-name?name=${encodeURIComponent(name)}`);
	return response.json();
}

export function validateRepoNameFormat(name: string): {
	valid: boolean;
	error?: string;
} {
	if (!name.trim()) {
		return { valid: false };
	}

	const validPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
	if (!validPattern.test(name)) {
		return {
			valid: false,
			error: 'Letters, numbers, hyphens, underscores, and periods only',
		};
	}

	if (name.length > 100) {
		return { valid: false, error: 'Must be 100 characters or less' };
	}

	return { valid: true };
}

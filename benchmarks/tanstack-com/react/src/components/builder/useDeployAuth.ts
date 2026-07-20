/**
 * Deploy Auth Hook
 *
 * Manages GitHub authentication state for the deploy flow.
 */

import { useState, useCallback, useEffect } from 'react';

interface DeployAuthState {
	isLoading: boolean;
	authenticated: boolean;
	hasGitHubAccount: boolean;
	hasRepoScope: boolean;
}

interface UseDeployAuthReturn extends DeployAuthState {
	refresh: () => Promise<void>;
	redirectToGitHubAuth: () => void;
}

async function fetchAuthStateFromServer(): Promise<DeployAuthState> {
	try {
		const response = await fetch('/api/builder/deploy/github');
		const data = await response.json();
		return {
			isLoading: false,
			authenticated: data.authenticated ?? false,
			hasGitHubAccount: data.hasGitHubAccount ?? false,
			hasRepoScope: data.hasRepoScope ?? false,
		};
	} catch {
		return {
			isLoading: false,
			authenticated: false,
			hasGitHubAccount: false,
			hasRepoScope: false,
		};
	}
}

export function useDeployAuth(): UseDeployAuthReturn {
	const [state, setState] = useState<DeployAuthState>({
		isLoading: true,
		authenticated: false,
		hasGitHubAccount: false,
		hasRepoScope: false,
	});

	const fetchAuthState = useCallback(async () => {
		setState((s) => ({ ...s, isLoading: true }));
		const newState = await fetchAuthStateFromServer();
		setState(newState);
	}, []);

	// Fetch auth state on mount
	useEffect(() => {
		let cancelled = false;
		fetchAuthStateFromServer().then((newState) => {
			if (!cancelled) {
				setState(newState);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const redirectToGitHubAuth = useCallback(() => {
		// Open GitHub OAuth in a popup so user doesn't lose their place
		const authUrl = `/auth/github/start?popup=true&scope=public_repo`;
		const width = 500;
		const height = 700;
		const left = window.screenX + (window.outerWidth - width) / 2;
		const top = window.screenY + (window.outerHeight - height) / 2;
		const popup = window.open(
			authUrl,
			'github-auth',
			`width=${width},height=${height},left=${left},top=${top},popup=yes`,
		);

		// Poll for popup close and refresh auth state
		if (popup) {
			const checkClosed = setInterval(() => {
				if (popup.closed) {
					clearInterval(checkClosed);
					// Refresh auth state after popup closes
					fetchAuthState();
				}
			}, 500);
		}
	}, [fetchAuthState]);

	return {
		...state,
		refresh: fetchAuthState,
		redirectToGitHubAuth,
	};
}

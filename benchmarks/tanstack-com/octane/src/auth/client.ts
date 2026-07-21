/**
 * Auth Client Module
 *
 * Client-side authentication utilities and navigation helpers.
 * This module is safe to import in browser code.
 */

import type { OAuthProvider } from './types';
import { openCenteredPopupWindow } from '~/utils/browser-effects';

// ============================================================================
// Auth Client
// ============================================================================

/**
 * Client-side auth utilities for OAuth flows
 */
export const authClient = {
	signIn: {
		/**
		 * Initiate OAuth sign-in with a social provider (full page redirect)
		 */
		social: ({ provider, returnTo }: { provider: OAuthProvider; returnTo?: string }) => {
			const url = returnTo
				? `/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`
				: `/auth/${provider}/start`;
			window.location.href = url;
		},

		/**
		 * Initiate OAuth sign-in in a popup window (for modal-based login)
		 */
		socialPopup: ({ provider }: { provider: OAuthProvider }) => {
			return openCenteredPopupWindow({
				url: `/auth/${provider}/start?popup=true`,
				target: 'tanstack-oauth',
				width: 500,
				height: 600,
				features: ['popup=yes'],
			});
		},
	},

	/**
	 * Sign out the current user
	 */
	signOut: async () => {
		window.location.href = '/auth/signout';
	},
};

// ============================================================================
// Navigation Helpers
// ============================================================================

/**
 * Navigate to sign-in page
 */
export function navigateToSignIn(provider?: OAuthProvider, returnTo?: string): void {
	if (provider) {
		const url = returnTo
			? `/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`
			: `/auth/${provider}/start`;
		window.location.href = url;
	} else {
		const url = returnTo ? `/login?redirect=${encodeURIComponent(returnTo)}` : '/login';
		window.location.href = url;
	}
}

/**
 * Navigate to sign-out
 */
export function navigateToSignOut(): void {
	window.location.href = '/auth/signout';
}

/**
 * Get current URL path for return-to parameter
 */
export function getCurrentPath(): string {
	return window.location.pathname + window.location.search;
}

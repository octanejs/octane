/**
 * OAuth Server Utilities
 *
 * This module delegates to the isolated auth module at ~/auth/
 * for backward compatibility with existing imports.
 *
 * For new code, import directly from '~/auth/index.server'.
 */

import { getOAuthService, getOAuthAccountRepository } from '~/auth/index.server';
import type { OAuthProvider, OAuthProfile, OAuthResult } from '~/auth/index.server';

// Re-export types for backward compatibility
export type { OAuthProvider, OAuthProfile };

/**
 * Get OAuth account by provider and account ID
 */
export async function getOAuthAccount(provider: OAuthProvider, providerAccountId: string) {
	const repository = getOAuthAccountRepository();
	return repository.findByProviderAndAccountId(provider, providerAccountId);
}

/**
 * Upsert OAuth account and user
 */
export async function upsertOAuthAccount(
	provider: OAuthProvider,
	profile: OAuthProfile,
): Promise<OAuthResult> {
	const oauthService = getOAuthService();
	return oauthService.upsertOAuthAccount(provider, profile);
}

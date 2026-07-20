/**
 * @deprecated Import from '~/auth/oauthClient.server' instead
 * This file is kept for backwards compatibility
 */
export {
	generateToken,
	hashToken,
	validateRedirectUri,
	verifyCodeChallenge,
	isOAuthClientToken,
	isOAuthRefreshToken,
	createAuthorizationCode,
	exchangeAuthorizationCode,
	refreshAccessToken,
	validateOAuthToken,
	listConnectedApps,
	revokeTokensForClient,
	cleanupExpiredTokens,
} from '~/auth/oauthClient.server';

export type { OAuthValidationResult } from '~/auth/oauthClient.server';

// Re-export for MCP-specific usage (backwards compat)
import type { AuthResult } from './auth.server';
import { validateOAuthToken as validateOAuthTokenGeneric } from '~/auth/oauthClient.server';

/**
 * @deprecated Use validateOAuthToken from '~/auth/oauthClient.server' directly
 * Validate an OAuth access token for MCP requests (legacy wrapper)
 */
export async function validateOAuthTokenForMcp(token: string): Promise<AuthResult> {
	const result = await validateOAuthTokenGeneric(token);

	if (!result.success) {
		return {
			success: false,
			error: result.error,
			status: result.status,
		};
	}

	return {
		success: true,
		keyId: result.tokenId,
		userId: result.userId,
		rateLimitPerMinute: 200, // Default rate limit for OAuth tokens
	};
}

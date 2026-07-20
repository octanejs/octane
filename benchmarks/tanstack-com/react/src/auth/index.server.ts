/**
 * Auth Module - Server Entry Point
 *
 * This is the main entry point for server-side auth functionality.
 * Import from '~/auth/index.server' for server-side code.
 *
 * Example usage:
 *
 * ```ts
 * import { getAuthService, getAuthGuards } from '~/auth/index.server'
 *
 * // In a server function or loader
 * const authService = getAuthService()
 * const user = await authService.getCurrentUser(request)
 *
 * // Or use guards
 * const guards = getAuthGuards()
 * const user = await guards.requireAuth(request)
 * ```
 */

// ============================================================================
// Types (re-exported from types module)
// ============================================================================

export type {
	// Core types
	Capability,
	OAuthProvider,
	OAuthProfile,
	OAuthResult,
	SessionCookieData,
	AuthUser,
	DbUser,
	// Interfaces for IoC
	IUserRepository,
	IOAuthAccountRepository,
	ICapabilitiesRepository,
	ISessionService,
	IAuthService,
	IOAuthService,
	AuthContext,
	// Error types
	AuthErrorCode,
} from './types';

export { VALID_CAPABILITIES, AuthError } from './types';

// ============================================================================
// Services
// ============================================================================

export { AuthService } from './auth.server';
export { SessionService } from './session.server';
export { CapabilitiesService } from './capabilities.server';
export { OAuthService } from './oauth.server';

// ============================================================================
// Session Utilities
// ============================================================================

export {
	generateOAuthState,
	createOAuthStateCookie,
	clearOAuthStateCookie,
	getOAuthStateCookie,
	createOAuthPopupCookie,
	clearOAuthPopupCookie,
	isOAuthPopupMode,
	createOAuthReturnToCookie,
	clearOAuthReturnToCookie,
	getOAuthReturnTo,
	SESSION_DURATION_MS,
	SESSION_MAX_AGE_SECONDS,
} from './session.server';

// ============================================================================
// Capability Utilities
// ============================================================================

export {
	hasCapability,
	hasAllCapabilities,
	hasAnyCapability,
	isAdmin,
	userHasCapability,
	userIsAdmin,
} from './capabilities';

// ============================================================================
// OAuth Utilities
// ============================================================================

export {
	buildGitHubAuthUrl,
	buildGoogleAuthUrl,
	exchangeGitHubCode,
	exchangeGoogleCode,
	fetchGitHubProfile,
	fetchGoogleProfile,
} from './oauth.server';

// ============================================================================
// Guards
// ============================================================================

export { createAuthGuards, withCapability, withAuth } from './guards.server';
export type { AuthGuards } from './guards.server';

// ============================================================================
// Repositories (for custom implementations)
// ============================================================================

export {
	DrizzleUserRepository,
	DrizzleOAuthAccountRepository,
	DrizzleCapabilitiesRepository,
	createRepositories,
} from './repositories.server';

// ============================================================================
// Context & Service Accessors (Application-specific)
// ============================================================================

export {
	getAuthContext,
	getAuthService,
	getSessionService,
	getCapabilitiesService,
	getOAuthService,
	getAuthGuards,
	getUserRepository,
	getOAuthAccountRepository,
	getCapabilitiesRepository,
} from './context.server';

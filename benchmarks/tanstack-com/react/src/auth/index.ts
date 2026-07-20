/**
 * Auth Module - Client Entry Point
 *
 * This is the main entry point for client-side auth functionality.
 * Import from '~/auth' for client-side code.
 *
 * For server-side code, import from '~/auth/index.server' instead.
 *
 * Example usage:
 *
 * ```tsx
 * import { authClient, navigateToSignIn } from '~/auth'
 *
 * // Sign in with GitHub
 * authClient.signIn.social({ provider: 'github' })
 *
 * // Sign out
 * authClient.signOut()
 * ```
 */

// ============================================================================
// Types (client-safe types only)
// ============================================================================

export type { Capability, OAuthProvider, AuthUser, AuthErrorCode } from './types';

export { VALID_CAPABILITIES, AuthError } from './types';

// ============================================================================
// Client Auth
// ============================================================================

export { authClient, navigateToSignIn, navigateToSignOut, getCurrentPath } from './client';

// ============================================================================
// Capability Utilities (client-safe)
// ============================================================================

export {
	hasCapability,
	hasAllCapabilities,
	hasAnyCapability,
	isAdmin,
	userHasCapability,
	userIsAdmin,
} from './capabilities';

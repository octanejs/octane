/**
 * Auth Service
 *
 * Main authentication service that coordinates session validation
 * and user retrieval. Uses inversion of control for all dependencies.
 */

import type {
	AuthUser,
	Capability,
	DbUser,
	IAuthService,
	ICapabilitiesRepository,
	ISessionService,
	IUserRepository,
	SessionCookieData,
} from './types';
import { AuthError } from './types';

// ============================================================================
// Auth Service Implementation
// ============================================================================

export class AuthService implements IAuthService {
	constructor(
		private sessionService: ISessionService,
		private userRepository: IUserRepository,
		private capabilitiesRepository: ICapabilitiesRepository,
	) {}

	/**
	 * Get current user from request
	 * Returns null if not authenticated
	 */
	async getCurrentUser(request: Request): Promise<AuthUser | null> {
		const signedCookie = this.sessionService.getSessionCookie(request);

		if (!signedCookie) {
			return null;
		}

		try {
			const cookieData = await this.sessionService.verifyCookie(signedCookie);

			if (!cookieData) {
				console.error(
					'[AuthService] Session cookie verification failed - invalid signature or expired',
				);
				return null;
			}

			const result = await this.validateSession(cookieData);
			if (!result) {
				return null;
			}

			return this.mapDbUserToAuthUser(result.user, result.capabilities);
		} catch (error) {
			console.error('[AuthService] Failed to get user from session:', {
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined,
			});
			return null;
		}
	}

	/**
	 * Validate session data against the database
	 */
	async validateSession(
		sessionData: SessionCookieData,
	): Promise<{ user: DbUser; capabilities: Capability[] } | null> {
		const user = await this.userRepository.findById(sessionData.userId);

		if (!user) {
			console.error(
				`[AuthService] Session cookie references non-existent user ${sessionData.userId}`,
			);
			return null;
		}

		// Verify session version matches (for session revocation)
		if (user.sessionVersion !== sessionData.version) {
			console.error(
				`[AuthService] Session version mismatch for user ${user.id} - expected ${user.sessionVersion}, got ${sessionData.version}`,
			);
			return null;
		}

		// Get effective capabilities
		const capabilities = await this.capabilitiesRepository.getEffectiveCapabilities(user.id);

		return { user, capabilities };
	}

	/**
	 * Map database user to AuthUser type
	 */
	private mapDbUserToAuthUser(user: DbUser, capabilities: Capability[]): AuthUser {
		return {
			userId: user.id,
			email: user.email,
			name: user.name,
			image: user.image,
			oauthImage: user.oauthImage,
			displayUsername: user.displayUsername,
			capabilities,
			adsDisabled: user.adsDisabled,
			interestedInHidingAds: user.interestedInHidingAds,
			lastUsedFramework: user.lastUsedFramework,
			signupSources: user.signupSources,
		};
	}
}

// ============================================================================
// Auth Guard Functions
// ============================================================================

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuthentication(
	authService: IAuthService,
	request: Request,
): Promise<AuthUser> {
	const user = await authService.getCurrentUser(request);
	if (!user) {
		throw new AuthError('Not authenticated', 'NOT_AUTHENTICATED');
	}
	return user;
}

/**
 * Require specific capability - throws if not authorized
 */
export async function requireCapability(
	authService: IAuthService,
	request: Request,
	capability: Capability,
): Promise<AuthUser> {
	const user = await requireAuthentication(authService, request);

	const hasAccess = user.capabilities.includes('admin') || user.capabilities.includes(capability);

	if (!hasAccess) {
		throw new AuthError(`Missing required capability: ${capability}`, 'MISSING_CAPABILITY');
	}

	return user;
}

/**
 * Require admin capability - throws if not admin
 */
export async function requireAdmin(authService: IAuthService, request: Request): Promise<AuthUser> {
	return requireCapability(authService, request, 'admin');
}

/**
 * Auth Context Setup
 *
 * Creates and configures the auth services with their dependencies.
 * This is the composition root for the auth module in this application.
 */

import { AuthService } from './auth.server';
import { CapabilitiesService } from './capabilities.server';
import { OAuthService } from './oauth.server';
import { SessionService } from './session.server';
import { createAuthGuards } from './guards.server';
import {
	DrizzleUserRepository,
	DrizzleOAuthAccountRepository,
	DrizzleCapabilitiesRepository,
} from './repositories.server';

// ============================================================================
// Environment Configuration
// ============================================================================

function getSessionSecret(): string {
	const secret = process.env.SESSION_SECRET;
	if (!secret) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error('SESSION_SECRET environment variable is required in production');
		}
		// In development, require explicit opt-in to use insecure default
		if (process.env.ALLOW_INSECURE_SESSION_SECRET !== 'true') {
			throw new Error(
				'SESSION_SECRET environment variable is required. ' +
					'Set ALLOW_INSECURE_SESSION_SECRET=true to use insecure default in development.',
			);
		}
		console.warn(
			'[Auth] WARNING: Using insecure session secret for development. Do NOT use in production.',
		);
		return 'dev-secret-key-change-in-production';
	}
	return secret;
}

function isProduction(): boolean {
	return process.env.NODE_ENV === 'production';
}

// ============================================================================
// Service Instances (Singleton pattern)
// ============================================================================

// Repositories
let _userRepository: DrizzleUserRepository | null = null;
let _oauthAccountRepository: DrizzleOAuthAccountRepository | null = null;
let _capabilitiesRepository: DrizzleCapabilitiesRepository | null = null;

// Services
let _sessionService: SessionService | null = null;
let _authService: AuthService | null = null;
let _capabilitiesService: CapabilitiesService | null = null;
let _oauthService: OAuthService | null = null;

// ============================================================================
// Repository Getters
// ============================================================================

export function getUserRepository(): DrizzleUserRepository {
	if (!_userRepository) {
		_userRepository = new DrizzleUserRepository();
	}
	return _userRepository;
}

export function getOAuthAccountRepository(): DrizzleOAuthAccountRepository {
	if (!_oauthAccountRepository) {
		_oauthAccountRepository = new DrizzleOAuthAccountRepository();
	}
	return _oauthAccountRepository;
}

export function getCapabilitiesRepository(): DrizzleCapabilitiesRepository {
	if (!_capabilitiesRepository) {
		_capabilitiesRepository = new DrizzleCapabilitiesRepository();
	}
	return _capabilitiesRepository;
}

// ============================================================================
// Service Getters
// ============================================================================

export function getSessionService(): SessionService {
	if (!_sessionService) {
		_sessionService = new SessionService(getSessionSecret(), isProduction());
	}
	return _sessionService;
}

export function getAuthService(): AuthService {
	if (!_authService) {
		_authService = new AuthService(
			getSessionService(),
			getUserRepository(),
			getCapabilitiesRepository(),
		);
	}
	return _authService;
}

export function getCapabilitiesService(): CapabilitiesService {
	if (!_capabilitiesService) {
		_capabilitiesService = new CapabilitiesService(getCapabilitiesRepository());
	}
	return _capabilitiesService;
}

export function getOAuthService(): OAuthService {
	if (!_oauthService) {
		_oauthService = new OAuthService(getOAuthAccountRepository(), getUserRepository());
	}
	return _oauthService;
}

// ============================================================================
// Auth Guards (bound to auth service)
// ============================================================================

let _authGuards: ReturnType<typeof createAuthGuards> | null = null;

export function getAuthGuards() {
	if (!_authGuards) {
		_authGuards = createAuthGuards(getAuthService());
	}
	return _authGuards;
}

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Get all auth services configured for this application
 */
export function getAuthContext() {
	return {
		sessionService: getSessionService(),
		authService: getAuthService(),
		capabilitiesService: getCapabilitiesService(),
		oauthService: getOAuthService(),
		guards: getAuthGuards(),
		repositories: {
			user: getUserRepository(),
			oauthAccount: getOAuthAccountRepository(),
			capabilities: getCapabilitiesRepository(),
		},
	};
}

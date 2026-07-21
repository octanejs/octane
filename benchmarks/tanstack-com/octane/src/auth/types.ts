/**
 * Auth Module Types
 *
 * This file defines the core types and interfaces for the authentication module.
 * These types are designed to be framework-agnostic and can be used by both
 * server and client code.
 */

// Re-export shared types from db/types.ts (single source of truth)
export type { Capability, OAuthProvider, SignupSource } from '~/db/types';
export { CAPABILITIES as VALID_CAPABILITIES } from '~/db/types';

import type { Capability, OAuthProvider, SignupSource } from '~/db/types';

export interface OAuthProfile {
	id: string;
	email: string;
	name?: string;
	image?: string;
}

export interface OAuthResult {
	userId: string;
	isNewUser: boolean;
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionCookieData {
	userId: string;
	expiresAt: number; // Unix timestamp in milliseconds
	version: number; // sessionVersion from users table for revocation
}

// ============================================================================
// User Types
// ============================================================================

/**
 * Authenticated user data returned from session validation
 */
export interface AuthUser {
	userId: string;
	email: string;
	name: string | null;
	image: string | null;
	oauthImage: string | null;
	displayUsername: string | null;
	capabilities: Capability[];
	adsDisabled: boolean | null;
	interestedInHidingAds: boolean | null;
	lastUsedFramework: string | null;
	signupSources: SignupSource[];
}

/**
 * Database user record (used by data access layer)
 */
export interface DbUser {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
	oauthImage: string | null;
	displayUsername: string | null;
	capabilities: Capability[];
	adsDisabled: boolean | null;
	interestedInHidingAds: boolean | null;
	lastUsedFramework: string | null;
	signupSources: SignupSource[];
	sessionVersion: number;
	createdAt: Date;
	updatedAt: Date;
}

// ============================================================================
// Data Access Interfaces (for Inversion of Control)
// ============================================================================

/**
 * User repository interface for database operations
 * Implement this interface to inject database access into the auth module
 */
export interface IUserRepository {
	findById(userId: string): Promise<DbUser | null>;
	findByEmail(email: string): Promise<DbUser | null>;
	create(data: {
		email: string;
		name?: string;
		image?: string;
		oauthImage?: string;
		displayUsername?: string;
		capabilities?: Capability[];
		signupSources?: SignupSource[];
	}): Promise<DbUser>;
	update(
		userId: string,
		data: Partial<{
			email: string;
			name: string;
			image: string | null;
			oauthImage: string;
			displayUsername: string;
			capabilities: Capability[];
			adsDisabled: boolean;
			interestedInHidingAds: boolean;
			lastUsedFramework: string;
			signupSources: SignupSource[];
			sessionVersion: number;
			updatedAt: Date;
		}>,
	): Promise<void>;
	incrementSessionVersion(userId: string): Promise<void>;
}

/**
 * OAuth account repository interface
 */
export interface IOAuthAccountRepository {
	findByProviderAndAccountId(
		provider: OAuthProvider,
		providerAccountId: string,
	): Promise<{
		userId: string;
		accessToken: string | null;
		tokenScope: string | null;
	} | null>;
	findByUserId(
		userId: string,
		provider: OAuthProvider,
	): Promise<{ accessToken: string | null; tokenScope: string | null } | null>;
	create(data: {
		userId: string;
		provider: OAuthProvider;
		providerAccountId: string;
		email: string;
		accessToken?: string;
		tokenScope?: string;
	}): Promise<void>;
	updateToken(
		userId: string,
		provider: OAuthProvider,
		accessToken: string,
		tokenScope: string,
	): Promise<void>;
}

/**
 * Capabilities repository interface
 */
export interface ICapabilitiesRepository {
	getEffectiveCapabilities(userId: string): Promise<Capability[]>;
	getBulkEffectiveCapabilities(userIds: string[]): Promise<Record<string, Capability[]>>;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Session service interface for cookie-based session management
 */
export interface ISessionService {
	signCookie(data: SessionCookieData): Promise<string>;
	verifyCookie(signedCookie: string): Promise<SessionCookieData | null>;
	getSessionCookie(request: Request): string | null;
	createSessionCookieHeader(signedCookie: string, maxAge: number): string;
	createClearSessionCookieHeader(): string;
}

/**
 * Auth service interface for user authentication
 */
export interface IAuthService {
	getCurrentUser(request: Request): Promise<AuthUser | null>;
	validateSession(
		sessionData: SessionCookieData,
	): Promise<{ user: DbUser; capabilities: Capability[] } | null>;
}

/**
 * OAuth service interface for OAuth operations
 */
export interface IOAuthService {
	upsertOAuthAccount(
		provider: OAuthProvider,
		profile: OAuthProfile,
		tokenInfo?: { accessToken: string; scope: string },
	): Promise<OAuthResult>;
}

// ============================================================================
// Auth Context (Dependency Injection Container)
// ============================================================================

/**
 * Auth context contains all dependencies required by the auth module
 * Use this to inject implementations at runtime
 */
export interface AuthContext {
	userRepository: IUserRepository;
	oauthAccountRepository: IOAuthAccountRepository;
	capabilitiesRepository: ICapabilitiesRepository;
	sessionSecret: string;
	isProduction: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export class AuthError extends Error {
	constructor(
		message: string,
		public code: AuthErrorCode,
	) {
		super(message);
		this.name = 'AuthError';
	}
}

export type AuthErrorCode =
	| 'NOT_AUTHENTICATED'
	| 'MISSING_CAPABILITY'
	| 'INVALID_SESSION'
	| 'SESSION_EXPIRED'
	| 'SESSION_REVOKED'
	| 'USER_NOT_FOUND'
	| 'OAUTH_ERROR';

/**
 * OAuth Service
 *
 * Handles OAuth account management and user creation/linking.
 * Uses inversion of control for database access.
 */

import type {
	IOAuthService,
	IOAuthAccountRepository,
	IUserRepository,
	OAuthProfile,
	OAuthProvider,
	OAuthResult,
} from './types';
import { AuthError } from './types';

const GITHUB_USER_AGENT = 'TanStack.com';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

async function parseOAuthJson(response: Response, context: string): Promise<unknown> {
	const text = await response.text();

	try {
		return JSON.parse(text);
	} catch {
		const body = text.trim().slice(0, 300);
		console.error(
			`[OAuth] ${context} returned non-JSON response: status=${response.status}, statusText=${response.statusText}, body=${body}`,
		);
		throw new AuthError(`${context} returned non-JSON response`, 'OAUTH_ERROR');
	}
}

function getStringField(record: Record<string, unknown>, key: string) {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
}

function getGitHubApiError(data: unknown) {
	return isRecord(data) ? getStringField(data, 'message') : undefined;
}

// ============================================================================
// OAuth Service Implementation
// ============================================================================

export class OAuthService implements IOAuthService {
	constructor(
		private oauthAccountRepository: IOAuthAccountRepository,
		private userRepository: IUserRepository,
	) {}

	/**
	 * Upsert OAuth account and associated user
	 * - If OAuth account exists, updates user info and returns existing user
	 * - If user with email exists, links OAuth account to existing user
	 * - Otherwise, creates new user and OAuth account
	 */
	async upsertOAuthAccount(
		provider: OAuthProvider,
		profile: OAuthProfile,
		tokenInfo?: { accessToken: string; scope: string },
	): Promise<OAuthResult> {
		try {
			// Check if OAuth account already exists
			const existingAccount = await this.oauthAccountRepository.findByProviderAndAccountId(
				provider,
				profile.id,
			);

			if (existingAccount) {
				// Account exists, update user info if needed
				const user = await this.userRepository.findById(existingAccount.userId);

				if (!user) {
					console.error(
						`[OAuthService] OAuth account exists for ${provider}:${profile.id} but user ${existingAccount.userId} not found`,
					);
					throw new AuthError('User not found for existing OAuth account', 'USER_NOT_FOUND');
				}

				const updates: {
					email?: string;
					name?: string;
					oauthImage?: string;
					updatedAt?: Date;
				} = {};

				if (profile.email && user.email !== profile.email) {
					updates.email = profile.email;
				}
				if (profile.name && user.name !== profile.name) {
					updates.name = profile.name;
				}
				// Always update oauthImage from provider (it may have changed)
				if (profile.image && user.oauthImage !== profile.image) {
					updates.oauthImage = profile.image;
				}

				if (Object.keys(updates).length > 0) {
					updates.updatedAt = new Date();
					await this.userRepository.update(existingAccount.userId, updates);
				}

				// Update token if provided
				if (tokenInfo) {
					await this.oauthAccountRepository.updateToken(
						existingAccount.userId,
						provider,
						tokenInfo.accessToken,
						tokenInfo.scope,
					);
				}

				return {
					userId: existingAccount.userId,
					isNewUser: false,
				};
			}

			// Find user by email (for linking multiple OAuth providers)
			const existingUser = await this.userRepository.findByEmail(profile.email);

			let userId: string;

			if (existingUser) {
				// Link OAuth account to existing user
				console.log(
					`[OAuthService] Linking ${provider} account to existing user ${existingUser.id} (${profile.email})`,
				);
				userId = existingUser.id;

				// Update user info if provided and not already set
				const updates: {
					name?: string;
					image?: string;
					oauthImage?: string;
					updatedAt?: Date;
				} = {};

				if (profile.name && !existingUser.name) {
					updates.name = profile.name;
				}
				if (profile.image && !existingUser.image) {
					updates.image = profile.image;
				}
				// Always update oauthImage from provider
				if (profile.image && existingUser.oauthImage !== profile.image) {
					updates.oauthImage = profile.image;
				}

				if (Object.keys(updates).length > 0) {
					updates.updatedAt = new Date();
					await this.userRepository.update(userId, updates);
				}
			} else {
				// Create new user
				console.log(`[OAuthService] Creating new user for ${provider} login: ${profile.email}`);
				const newUser = await this.userRepository.create({
					email: profile.email,
					name: profile.name,
					image: profile.image,
					oauthImage: profile.image,
					displayUsername: profile.name,
					capabilities: [],
				});

				userId = newUser.id;
			}

			// Create OAuth account link with token if provided
			await this.oauthAccountRepository.create({
				userId,
				provider,
				providerAccountId: profile.id,
				email: profile.email,
				accessToken: tokenInfo?.accessToken,
				tokenScope: tokenInfo?.scope,
			});

			return {
				userId,
				isNewUser: !existingUser,
			};
		} catch (error) {
			if (error instanceof AuthError) {
				throw error;
			}

			console.error(
				`[OAuthService] Failed to upsert OAuth account for ${provider}:${profile.id} (${profile.email}):`,
				{
					error: error instanceof Error ? error.message : 'Unknown error',
					stack: error instanceof Error ? error.stack : undefined,
				},
			);
			throw new AuthError(
				`OAuth account creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
				'OAUTH_ERROR',
			);
		}
	}
}

// ============================================================================
// OAuth Provider Utilities
// ============================================================================

/**
 * Build GitHub OAuth authorization URL
 */
export function buildGitHubAuthUrl(
	clientId: string,
	redirectUri: string | undefined,
	state: string,
	additionalScopes?: Array<string>,
): string {
	const scopes = ['user:email', ...(additionalScopes ?? [])].join(' ');
	const params = new URLSearchParams({
		client_id: clientId,
		scope: scopes,
		state,
	});

	if (redirectUri) {
		params.set('redirect_uri', redirectUri);
	}

	return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Build Google OAuth authorization URL
 */
export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
	return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
		clientId,
	)}&redirect_uri=${encodeURIComponent(
		redirectUri,
	)}&response_type=code&scope=openid email profile&state=${encodeURIComponent(state)}`;
}

export interface GitHubTokenResult {
	accessToken: string;
	scope: string;
}

/**
 * Exchange GitHub authorization code for access token
 */
export async function exchangeGitHubCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri?: string,
): Promise<GitHubTokenResult> {
	const body: {
		client_id: string;
		client_secret: string;
		code: string;
		redirect_uri?: string;
	} = {
		client_id: clientId,
		client_secret: clientSecret,
		code,
	};

	if (redirectUri) {
		body.redirect_uri = redirectUri;
	}

	const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			'User-Agent': GITHUB_USER_AGENT,
		},
		body: JSON.stringify(body),
	});

	const tokenData = await parseOAuthJson(tokenResponse, 'GitHub token exchange');
	if (!isRecord(tokenData)) {
		throw new AuthError('Invalid GitHub token response', 'OAUTH_ERROR');
	}

	const error = getStringField(tokenData, 'error');
	if (error) {
		const errorDescription = getStringField(tokenData, 'error_description');
		console.error(
			`[OAuth] GitHub token exchange failed: ${error}, description: ${errorDescription || 'none'}`,
		);
		throw new AuthError(`GitHub OAuth error: ${error}`, 'OAUTH_ERROR');
	}

	const accessToken = getStringField(tokenData, 'access_token');
	if (!accessToken) {
		console.error('[OAuth] GitHub token exchange succeeded but no access_token returned');
		throw new AuthError('No access token received from GitHub', 'OAUTH_ERROR');
	}

	return {
		accessToken,
		scope: getStringField(tokenData, 'scope') ?? '',
	};
}

/**
 * Fetch GitHub user profile
 */
export async function fetchGitHubProfile(accessToken: string): Promise<OAuthProfile> {
	const profileResponse = await fetch('https://api.github.com/user', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': GITHUB_USER_AGENT,
		},
	});

	const profile = await parseOAuthJson(profileResponse, 'GitHub profile API');
	if (!isRecord(profile)) {
		throw new AuthError('Invalid GitHub profile response', 'OAUTH_ERROR');
	}

	if (!profileResponse.ok) {
		const message = getGitHubApiError(profile) ?? 'Failed to fetch GitHub user';
		throw new AuthError(message, 'OAUTH_ERROR');
	}

	// Fetch email (may require separate call)
	let email = getStringField(profile, 'email');
	if (!email) {
		const emailResponse = await fetch('https://api.github.com/user/emails', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github.v3+json',
				'User-Agent': GITHUB_USER_AGENT,
			},
		});
		const emails = await parseOAuthJson(emailResponse, 'GitHub emails API');

		if (!Array.isArray(emails)) {
			console.error(`[OAuth] GitHub emails API returned non-array response:`, emails);
			throw new AuthError(
				getGitHubApiError(emails) || 'Failed to fetch GitHub emails',
				'OAUTH_ERROR',
			);
		}

		const primaryEmail = emails.find(
			(emailRecord): emailRecord is Record<string, unknown> =>
				isRecord(emailRecord) &&
				emailRecord.primary === true &&
				emailRecord.verified === true &&
				typeof emailRecord.email === 'string',
		);
		const verifiedEmail = emails.find(
			(emailRecord): emailRecord is Record<string, unknown> =>
				isRecord(emailRecord) &&
				emailRecord.verified === true &&
				typeof emailRecord.email === 'string',
		);
		email =
			getStringField(primaryEmail ?? {}, 'email') || getStringField(verifiedEmail ?? {}, 'email');
	}

	if (!email) {
		console.error(
			`[OAuth] No verified email found for GitHub user ${String(
				profile.id,
			)} (${getStringField(profile, 'login') ?? 'unknown'})`,
		);
		throw new AuthError('No verified email found for GitHub account', 'OAUTH_ERROR');
	}

	return {
		id: String(profile.id),
		email,
		name: getStringField(profile, 'name') || getStringField(profile, 'login'),
		image: getStringField(profile, 'avatar_url'),
	};
}

/**
 * Exchange Google authorization code for access token
 */
export async function exchangeGoogleCode(
	code: string,
	clientId: string,
	clientSecret: string,
	redirectUri: string,
): Promise<string> {
	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			redirect_uri: redirectUri,
			grant_type: 'authorization_code',
		}),
	});

	const tokenData = await tokenResponse.json();
	if (tokenData.error) {
		console.error(
			`[OAuth] Google token exchange failed: ${tokenData.error}, description: ${tokenData.error_description || 'none'}`,
		);
		throw new AuthError(`Google OAuth error: ${tokenData.error}`, 'OAUTH_ERROR');
	}

	if (!tokenData.access_token) {
		console.error('[OAuth] Google token exchange succeeded but no access_token returned');
		throw new AuthError('No access token received from Google', 'OAUTH_ERROR');
	}

	return tokenData.access_token;
}

/**
 * Fetch Google user profile
 */
export async function fetchGoogleProfile(accessToken: string): Promise<OAuthProfile> {
	const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	const profile = await profileResponse.json();

	if (!profile.verified_email) {
		console.error(`[OAuth] Google email not verified for user ${profile.id} (${profile.email})`);
		throw new AuthError('Google email not verified', 'OAUTH_ERROR');
	}

	return {
		id: profile.id,
		email: profile.email,
		name: profile.name,
		image: profile.picture,
	};
}

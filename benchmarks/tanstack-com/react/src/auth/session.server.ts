/**
 * Session Management Module
 *
 * Handles cookie-based session management with HMAC-SHA256 signing.
 * This module is framework-agnostic and uses Web Crypto API.
 */

import type { SessionCookieData, ISessionService } from './types';

// ============================================================================
// Base64URL Utilities
// ============================================================================

function base64UrlEncode(str: string): string {
	return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
	const normalized = str.replace(/-/g, '+').replace(/_/g, '/');
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
	return atob(padded);
}

// ============================================================================
// Session Service Implementation
// ============================================================================

export class SessionService implements ISessionService {
	private secret: string;
	private isProduction: boolean;

	constructor(secret: string, isProduction: boolean = false) {
		if (isProduction && secret === 'dev-secret-key-change-in-production') {
			throw new Error('SESSION_SECRET must be set in production');
		}
		this.secret = secret;
		this.isProduction = isProduction;
	}

	/**
	 * Sign cookie data using HMAC-SHA256
	 */
	async signCookie(data: SessionCookieData): Promise<string> {
		const payload = `${data.userId}:${data.expiresAt}:${data.version}`;
		const payloadBase64 = base64UrlEncode(payload);

		const encoder = new TextEncoder();
		const keyData = encoder.encode(this.secret);
		const messageData = encoder.encode(payloadBase64);

		const key = await crypto.subtle.importKey(
			'raw',
			keyData,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign'],
		);

		const signature = await crypto.subtle.sign('HMAC', key, messageData);
		const signatureArray = new Uint8Array(signature);

		let signatureStr = '';
		for (let i = 0; i < signatureArray.length; i++) {
			signatureStr += String.fromCharCode(signatureArray[i]);
		}
		const signatureBase64 = base64UrlEncode(signatureStr);

		return `${payloadBase64}.${signatureBase64}`;
	}

	/**
	 * Verify and parse signed cookie
	 */
	async verifyCookie(signedCookie: string): Promise<SessionCookieData | null> {
		try {
			const [payloadBase64, signatureBase64] = signedCookie.split('.');

			if (!payloadBase64 || !signatureBase64) {
				return null;
			}

			const encoder = new TextEncoder();
			const keyData = encoder.encode(this.secret);
			const messageData = encoder.encode(payloadBase64);

			const key = await crypto.subtle.importKey(
				'raw',
				keyData,
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['verify'],
			);

			const signatureStr = base64UrlDecode(signatureBase64);
			const signature = Uint8Array.from(signatureStr, (c) => c.charCodeAt(0));

			const isValid = await crypto.subtle.verify('HMAC', key, signature, messageData);

			if (!isValid) {
				return null;
			}

			const payload = base64UrlDecode(payloadBase64);
			const [userId, expiresAtStr, versionStr] = payload.split(':');

			if (!userId || !expiresAtStr || !versionStr) {
				return null;
			}

			const expiresAt = parseInt(expiresAtStr, 10);
			const version = parseInt(versionStr, 10);

			// Check expiration
			if (Date.now() > expiresAt) {
				return null;
			}

			return {
				userId,
				expiresAt,
				version,
			};
		} catch (error) {
			console.error(
				'[SessionService] Error verifying cookie:',
				error instanceof Error ? error.message : 'Unknown error',
			);
			return null;
		}
	}

	/**
	 * Read session cookie from request
	 */
	getSessionCookie(request: Request): string | null {
		const cookies = request.headers.get('cookie') || '';
		const sessionCookie = cookies.split(';').find((c) => c.trim().startsWith('session_token='));

		if (!sessionCookie) {
			return null;
		}

		const tokenValue = sessionCookie.split('=').slice(1).join('=').trim();
		const sessionToken = decodeURIComponent(tokenValue);
		return sessionToken || null;
	}

	/**
	 * Create session cookie header value
	 */
	createSessionCookieHeader(signedCookie: string, maxAge: number): string {
		return `session_token=${encodeURIComponent(signedCookie)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${this.isProduction ? '; Secure' : ''}`;
	}

	/**
	 * Create clear session cookie header value
	 */
	createClearSessionCookieHeader(): string {
		return `session_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${this.isProduction ? '; Secure' : ''}`;
	}
}

// ============================================================================
// OAuth State Cookie Utilities
// ============================================================================

export function generateOAuthState(): string {
	const stateBytes = new Uint8Array(16);
	crypto.getRandomValues(stateBytes);
	const base64 = btoa(String.fromCharCode(...stateBytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function createOAuthStateCookie(state: string, isProduction: boolean): string {
	// Use SameSite=Lax to allow the cookie to be sent on OAuth redirects back from providers
	// Strict would block the cookie since the redirect comes from an external domain (GitHub/Google)
	return `oauth_state=${encodeURIComponent(state)}; HttpOnly; Path=/; Max-Age=${10 * 60}; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function clearOAuthStateCookie(isProduction: boolean): string {
	return `oauth_state=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function getOAuthStateCookie(request: Request): string | null {
	const cookies = request.headers.get('cookie') || '';
	const stateCookie = cookies.split(';').find((c) => c.trim().startsWith('oauth_state='));

	if (!stateCookie) {
		return null;
	}

	return decodeURIComponent(stateCookie.split('=').slice(1).join('=').trim());
}

export function createOAuthPopupCookie(isProduction: boolean): string {
	return `oauth_popup=1; HttpOnly; Path=/; Max-Age=${10 * 60}; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function clearOAuthPopupCookie(isProduction: boolean): string {
	return `oauth_popup=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function isOAuthPopupMode(request: Request): boolean {
	const cookies = request.headers.get('cookie') || '';
	return cookies.split(';').some((c) => c.trim().startsWith('oauth_popup=1'));
}

export function createOAuthReturnToCookie(returnTo: string, isProduction: boolean): string {
	return `oauth_return_to=${encodeURIComponent(returnTo)}; HttpOnly; Path=/; Max-Age=${10 * 60}; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function clearOAuthReturnToCookie(isProduction: boolean): string {
	return `oauth_return_to=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${isProduction ? '; Secure' : ''}`;
}

export function getOAuthReturnTo(request: Request): string | null {
	const cookies = request.headers.get('cookie') || '';
	const returnToCookie = cookies.split(';').find((c) => c.trim().startsWith('oauth_return_to='));

	if (!returnToCookie) {
		return null;
	}

	return decodeURIComponent(returnToCookie.split('=').slice(1).join('=').trim());
}

// ============================================================================
// Session Constants
// ============================================================================

export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

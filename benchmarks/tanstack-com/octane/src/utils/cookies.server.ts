/**
 * Cookie Server Utilities
 *
 * This module delegates to the isolated auth module at ~/auth/
 * for backward compatibility with existing imports.
 *
 * For new code, import directly from '~/auth/index.server'.
 */

import { getSessionService } from '~/auth/index.server';
import type { SessionCookieData } from '~/auth/index.server';

// Re-export type for backward compatibility
export type { SessionCookieData };

/**
 * Sign cookie data using HMAC-SHA256
 */
export async function signCookie(data: SessionCookieData): Promise<string> {
	const sessionService = getSessionService();
	return sessionService.signCookie(data);
}

/**
 * Verify and parse signed cookie
 */
export async function verifyCookie(signedCookie: string): Promise<SessionCookieData | null> {
	const sessionService = getSessionService();
	return sessionService.verifyCookie(signedCookie);
}

/**
 * Read session cookie from request
 */
export function getSessionCookie(request: Request): string | null {
	const sessionService = getSessionService();
	return sessionService.getSessionCookie(request);
}

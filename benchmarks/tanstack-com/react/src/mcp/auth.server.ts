import { db } from '~/db/client';
import { mcpApiKeys, mcpRateLimits } from '~/db/schema';
import { eq, sql } from 'drizzle-orm';
import { validateOAuthToken, isOAuthClientToken } from '~/auth/oauthClient.server';
import { sha256Hex } from '~/utils/hash';
import { getClientIp as getClientIpBase } from '~/utils/request.server';

const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const RATE_LIMIT_CLEANUP_MAX_AGE_MS = 48 * 60 * 60 * 1000;

export type AuthResult =
	| { success: true; keyId: string; userId: string; rateLimitPerMinute: number }
	| { success: false; error: string; status: number };

/**
 * Hash an API key using SHA-256
 */
export const hashApiKey = sha256Hex;

/**
 * Generate a new API key
 * Returns the raw key (only shown once) and the hash for storage
 */
export async function generateApiKey(): Promise<{
	rawKey: string;
	keyHash: string;
	keyPrefix: string;
}> {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const rawKey =
		'ts_' +
		Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	const keyHash = await hashApiKey(rawKey);
	const keyPrefix = rawKey.slice(0, 11);
	return { rawKey, keyHash, keyPrefix };
}

/**
 * Validate MCP authentication from the Authorization header
 * Supports both API keys (ts_...) and OAuth tokens (mcp_...)
 */
export async function validateMcpAuth(authHeader: string | null): Promise<AuthResult> {
	if (!authHeader) {
		return {
			success: false,
			error: 'Missing Authorization header',
			status: 401,
		};
	}

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	if (!match) {
		return {
			success: false,
			error: 'Invalid Authorization header format. Expected: Bearer <token>',
			status: 401,
		};
	}

	const rawToken = match[1];

	// OAuth access token: oa_... or mcp_... (legacy)
	if (isOAuthClientToken(rawToken)) {
		const oauthResult = await validateOAuthToken(rawToken);
		if (!oauthResult.success) {
			return oauthResult;
		}
		return {
			success: true,
			keyId: oauthResult.tokenId,
			userId: oauthResult.userId,
			rateLimitPerMinute: 200, // Default rate limit for OAuth tokens
		};
	}

	// API key: ts_... (or legacy keys without prefix)
	return validateApiKey(rawToken);
}

/**
 * Validate an API key
 */
async function validateApiKey(rawKey: string): Promise<AuthResult> {
	const keyHash = await hashApiKey(rawKey);

	const result = await db
		.select({
			id: mcpApiKeys.id,
			isActive: mcpApiKeys.isActive,
			expiresAt: mcpApiKeys.expiresAt,
			lastUsedAt: mcpApiKeys.lastUsedAt,
			rateLimitPerMinute: mcpApiKeys.rateLimitPerMinute,
			userId: mcpApiKeys.userId,
		})
		.from(mcpApiKeys)
		.where(eq(mcpApiKeys.keyHash, keyHash))
		.limit(1);

	const apiKey = result[0];

	if (!apiKey) {
		return {
			success: false,
			error: 'Invalid API key',
			status: 401,
		};
	}

	if (!apiKey.userId) {
		return {
			success: false,
			error: 'API key has no associated user',
			status: 401,
		};
	}

	if (!apiKey.isActive) {
		return {
			success: false,
			error: 'API key has been revoked',
			status: 401,
		};
	}

	if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
		return {
			success: false,
			error: 'API key has expired',
			status: 401,
		};
	}

	if (
		!apiKey.lastUsedAt ||
		Date.now() - apiKey.lastUsedAt.getTime() > LAST_USED_WRITE_INTERVAL_MS
	) {
		db.update(mcpApiKeys)
			.set({ lastUsedAt: new Date() })
			.where(eq(mcpApiKeys.id, apiKey.id))
			.catch(() => {});
	}

	return {
		success: true,
		keyId: apiKey.id,
		userId: apiKey.userId,
		rateLimitPerMinute: apiKey.rateLimitPerMinute,
	};
}

/**
 * Check and increment rate limit for an identifier
 * Returns true if request is allowed, false if rate limited
 */
export async function checkRateLimit(
	identifier: string,
	identifierType: 'api_key' | 'ip',
	limitPerMinute: number,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
	const scopedIdentifier = `${identifierType}:${identifier}`;
	const now = new Date();
	// Round down to the current minute
	const windowStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		now.getHours(),
		now.getMinutes(),
		0,
		0,
	);
	const resetAt = new Date(windowStart.getTime() + 60 * 1000);

	// Try to increment existing record, or insert new one
	const result = await db
		.insert(mcpRateLimits)
		.values({
			identifier: scopedIdentifier,
			identifierType,
			windowStart,
			requestCount: 1,
		})
		.onConflictDoUpdate({
			target: [mcpRateLimits.identifier, mcpRateLimits.windowStart],
			set: {
				requestCount: sql`${mcpRateLimits.requestCount} + 1`,
			},
		})
		.returning({ requestCount: mcpRateLimits.requestCount });

	const currentCount = result[0]?.requestCount ?? 1;
	const remaining = Math.max(0, limitPerMinute - currentCount);
	const allowed = currentCount <= limitPerMinute;

	return { allowed, remaining, resetAt };
}

/**
 * Get client IP from request headers (with 'unknown' fallback for rate limiting)
 */
export function getClientIp(request: Request): string {
	return getClientIpBase(request, 'unknown');
}

/**
 * Check write rate limit for a user (10 writes per hour by default)
 * Used for MCP write operations like submitting/updating showcases
 */
export async function checkWriteRateLimit(
	userId: string,
	limitPerHour: number = 10,
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
	const now = new Date();
	// Round down to the current hour
	const windowStart = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		now.getHours(),
		0,
		0,
		0,
	);
	const resetAt = new Date(windowStart.getTime() + 60 * 60 * 1000); // 1 hour

	// Try to increment existing record, or insert new one
	const result = await db
		.insert(mcpRateLimits)
		.values({
			identifier: `user_write:${userId}`,
			identifierType: 'user_write',
			windowStart,
			requestCount: 1,
		})
		.onConflictDoUpdate({
			target: [mcpRateLimits.identifier, mcpRateLimits.windowStart],
			set: {
				requestCount: sql`${mcpRateLimits.requestCount} + 1`,
			},
		})
		.returning({ requestCount: mcpRateLimits.requestCount });

	const currentCount = result[0]?.requestCount ?? 1;
	const remaining = Math.max(0, limitPerHour - currentCount);
	const allowed = currentCount <= limitPerHour;

	return { allowed, remaining, resetAt };
}

/**
 * Clean up old rate limit records (older than 2 hours for hourly limits)
 * Call periodically to prevent table bloat
 */
export async function cleanupRateLimits(): Promise<void> {
	const cutoff = new Date(Date.now() - RATE_LIMIT_CLEANUP_MAX_AGE_MS);
	await db.delete(mcpRateLimits).where(sql`${mcpRateLimits.windowStart} < ${cutoff}`);
}

/**
 * Simple IP-based rate limiting for public API endpoints.
 * Uses the existing MCP rate limit infrastructure.
 */

import { db } from '~/db/client';
import { mcpRateLimits } from '~/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { checkRateLimit, getClientIp } from '~/mcp/auth.server';

export interface RateLimitOptions {
	limitPerMinute: number;
	keyPrefix?: string; // Namespace to separate different endpoints
}

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetAt: Date;
	headers: Headers;
}

/**
 * Check rate limit for a request based on client IP.
 * Returns result with pre-built headers for the response.
 */
export async function checkIpRateLimit(
	request: Request,
	options: RateLimitOptions,
): Promise<RateLimitResult> {
	const ip = getClientIp(request);
	const identifier = options.keyPrefix ? `${options.keyPrefix}:${ip}` : ip;

	const result = await checkRateLimit(identifier, 'ip', options.limitPerMinute);

	const headers = new Headers();
	headers.set('X-RateLimit-Limit', options.limitPerMinute.toString());
	headers.set('X-RateLimit-Remaining', result.remaining.toString());
	headers.set('X-RateLimit-Reset', Math.floor(result.resetAt.getTime() / 1000).toString());

	if (!result.allowed) {
		headers.set(
			'Retry-After',
			Math.ceil((result.resetAt.getTime() - Date.now()) / 1000).toString(),
		);
	}

	return {
		allowed: result.allowed,
		remaining: result.remaining,
		resetAt: result.resetAt,
		headers,
	};
}

/**
 * Create a rate-limited error response.
 */
export function rateLimitedResponse(result: RateLimitResult): Response {
	return new Response(
		JSON.stringify({
			error: 'Rate limit exceeded',
			retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
		}),
		{
			status: 429,
			headers: {
				'Cache-Control': 'no-store',
				'Content-Type': 'application/json',
				...Object.fromEntries(result.headers.entries()),
			},
		},
	);
}

export interface WindowRateLimitOptions {
	keyPrefix?: string;
	limit: number;
	windowMs: number;
}

export interface WindowRateLimitStatus {
	limit: number;
	remaining: number;
	resetAt: Date;
}

export async function getIpWindowRateLimitStatus(
	request: Request,
	options: WindowRateLimitOptions,
): Promise<WindowRateLimitStatus> {
	const ip = getClientIp(request);
	const identifier = options.keyPrefix ? `${options.keyPrefix}:${ip}` : ip;
	const now = Date.now();
	const windowStart = new Date(Math.floor(now / options.windowMs) * options.windowMs);
	const resetAt = new Date(windowStart.getTime() + options.windowMs);

	const [existingRecord] = await db
		.select({ requestCount: mcpRateLimits.requestCount })
		.from(mcpRateLimits)
		.where(
			and(eq(mcpRateLimits.identifier, identifier), eq(mcpRateLimits.windowStart, windowStart)),
		)
		.limit(1);

	const currentCount = existingRecord?.requestCount ?? 0;

	return {
		limit: options.limit,
		remaining: Math.max(0, options.limit - currentCount),
		resetAt,
	};
}

export async function checkIpWindowRateLimit(
	request: Request,
	options: WindowRateLimitOptions,
): Promise<RateLimitResult> {
	const ip = getClientIp(request);
	const identifier = options.keyPrefix ? `${options.keyPrefix}:${ip}` : ip;
	const now = Date.now();
	const windowStart = new Date(Math.floor(now / options.windowMs) * options.windowMs);
	const resetAt = new Date(windowStart.getTime() + options.windowMs);

	const result = await db
		.insert(mcpRateLimits)
		.values({
			identifier,
			identifierType: 'ip',
			requestCount: 1,
			windowStart,
		})
		.onConflictDoUpdate({
			target: [mcpRateLimits.identifier, mcpRateLimits.windowStart],
			set: {
				requestCount: sql`${mcpRateLimits.requestCount} + 1`,
			},
		})
		.returning({ requestCount: mcpRateLimits.requestCount });

	const currentCount = result[0]?.requestCount ?? 1;
	const remaining = Math.max(0, options.limit - currentCount);
	const allowed = currentCount <= options.limit;

	const headers = new Headers();
	headers.set('X-RateLimit-Limit', options.limit.toString());
	headers.set('X-RateLimit-Remaining', remaining.toString());
	headers.set('X-RateLimit-Reset', Math.floor(resetAt.getTime() / 1000).toString());

	if (!allowed) {
		headers.set('Retry-After', Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString());
	}

	return {
		allowed,
		headers,
		remaining,
		resetAt,
	};
}

// Preset rate limits for different endpoint types
export const RATE_LIMITS = {
	// Application starter prompt generation: 12 requests/minute
	applicationStarter: { limitPerMinute: 12, keyPrefix: 'application-starter' },
	// Anonymous starter generations before login is required
	applicationStarterAnonymousDaily: {
		keyPrefix: 'application-starter-anon-day',
		limit: 1_000_000,
		windowMs: 24 * 60 * 60 * 1000,
	},
	// Builder remote loading: 30 requests/minute (generous for UX)
	builderRemote: { limitPerMinute: 30, keyPrefix: 'builder-remote' },
	// Builder compile: 60 requests/minute
	builderCompile: { limitPerMinute: 60, keyPrefix: 'builder-compile' },
	// Deploy endpoint: 10 requests/minute (more sensitive)
	deploy: { limitPerMinute: 10, keyPrefix: 'deploy' },
	// CLI auth ticket creation: public endpoint polled by local tools
	cliAuthTicket: { limitPerMinute: 20, keyPrefix: 'cli-auth-ticket' },
} as const;

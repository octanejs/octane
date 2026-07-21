/**
 * Request utilities for extracting client information.
 */

/**
 * Extract client IP address from request headers.
 * Prefers Cloudflare's trusted header, then falls back to common proxy headers.
 *
 * @param request - The incoming request
 * @param fallback - Value to return if no IP found (default: undefined)
 */
export function getClientIp(request: Request): string | undefined;
export function getClientIp<T extends string>(request: Request, fallback: T): string;
export function getClientIp(request: Request, fallback?: string): string | undefined {
	const cfConnectingIp = normalizeIpHeader(request.headers.get('cf-connecting-ip'));
	if (cfConnectingIp) {
		return cfConnectingIp;
	}

	const realIp = normalizeIpHeader(request.headers.get('x-real-ip'));
	if (realIp) {
		return realIp;
	}

	const forwardedFor = request.headers.get('x-forwarded-for');
	if (forwardedFor) {
		const forwardedIp = normalizeIpHeader(forwardedFor.split(',')[0]);
		if (forwardedIp) {
			return forwardedIp;
		}
	}

	return fallback;
}

/**
 * Extract user agent from request headers.
 */
export function getUserAgent(request: Request): string | undefined {
	return request.headers.get('user-agent') || undefined;
}

function normalizeIpHeader(value: string | null | undefined) {
	const ip = value?.trim();

	if (!ip || ip.length > 45) {
		return undefined;
	}

	if (isValidIpv4(ip) || isLikelyIpv6(ip)) {
		return ip;
	}

	return undefined;
}

function isValidIpv4(value: string) {
	const parts = value.split('.');

	return (
		parts.length === 4 &&
		parts.every((part) => {
			if (!/^\d{1,3}$/.test(part)) {
				return false;
			}

			const number = Number(part);
			return number >= 0 && number <= 255 && String(number) === part;
		})
	);
}

function isLikelyIpv6(value: string) {
	return /^[0-9a-f:]+$/i.test(value) && value.includes(':');
}

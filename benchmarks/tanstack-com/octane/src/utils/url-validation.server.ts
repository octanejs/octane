/**
 * URL Validation for SSRF Protection
 *
 * Validates URLs to prevent Server-Side Request Forgery attacks.
 * Only allows fetching from trusted hosts.
 */

// Allowlisted hosts for remote template/integration loading
const ALLOWED_HOSTS = new Set([
	// GitHub raw content
	'raw.githubusercontent.com',
	'github.com',
	'gist.githubusercontent.com',
	// GitLab raw content
	'gitlab.com',
	// Bitbucket raw content
	'bitbucket.org',
	// npm/unpkg CDN (for published packages)
	'unpkg.com',
	'cdn.jsdelivr.net',
	// jsDelivr
	'esm.sh',
]);

// Blocked IP ranges (private, loopback, link-local)
const BLOCKED_IP_PATTERNS = [
	/^127\./, // Loopback
	/^10\./, // Private Class A
	/^172\.(1[6-9]|2[0-9]|3[01])\./, // Private Class B
	/^192\.168\./, // Private Class C
	/^169\.254\./, // Link-local
	/^0\./, // Current network
	/^::1$/, // IPv6 loopback
	/^fe80:/i, // IPv6 link-local
	/^fc00:/i, // IPv6 unique local
	/^fd[0-9a-f]{2}:/i, // IPv6 unique local
];

export interface UrlValidationResult {
	valid: boolean;
	error?: string;
	normalizedUrl?: string;
}

/**
 * Validate a URL for remote resource loading.
 * Returns validation result with normalized URL if valid.
 */
export function validateRemoteUrl(urlString: string): UrlValidationResult {
	if (!urlString || typeof urlString !== 'string') {
		return { valid: false, error: 'URL is required' };
	}

	let url: URL;
	try {
		url = new URL(urlString);
	} catch {
		return { valid: false, error: 'Invalid URL format' };
	}

	// Protocol check (only HTTPS allowed)
	if (url.protocol !== 'https:') {
		return { valid: false, error: 'Only HTTPS URLs are allowed' };
	}

	// Check for IP addresses (blocked to prevent SSRF via IP)
	const hostname = url.hostname.toLowerCase();
	for (const pattern of BLOCKED_IP_PATTERNS) {
		if (pattern.test(hostname)) {
			return { valid: false, error: 'IP addresses are not allowed' };
		}
	}

	// Also block numeric IPs that might bypass the regex
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
		return { valid: false, error: 'IP addresses are not allowed' };
	}

	// Host allowlist check
	if (!ALLOWED_HOSTS.has(hostname)) {
		return {
			valid: false,
			error: `Host '${hostname}' is not in the allowlist. Allowed hosts: ${Array.from(ALLOWED_HOSTS).join(', ')}`,
		};
	}

	// Additional path validation for GitHub (prevent directory traversal)
	if (hostname === 'raw.githubusercontent.com' || hostname === 'github.com') {
		// Must have at least owner/repo in path
		const pathParts = url.pathname.split('/').filter(Boolean);
		if (pathParts.length < 2) {
			return {
				valid: false,
				error: 'Invalid GitHub URL: must include owner and repo',
			};
		}
	}

	// Block suspicious path patterns
	if (url.pathname.includes('..') || url.pathname.includes('//')) {
		return { valid: false, error: 'Invalid URL path' };
	}

	return {
		valid: true,
		normalizedUrl: url.toString(),
	};
}

/**
 * Check if a host is allowed without full URL validation.
 * Useful for quick checks before constructing URLs.
 */
export function isHostAllowed(hostname: string): boolean {
	return ALLOWED_HOSTS.has(hostname.toLowerCase());
}

/**
 * Get the list of allowed hosts for display in error messages.
 */
export function getAllowedHosts(): string[] {
	return Array.from(ALLOWED_HOSTS);
}

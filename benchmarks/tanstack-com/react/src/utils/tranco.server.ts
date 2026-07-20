/**
 * Tranco List API utility
 * https://tranco-list.eu/
 *
 * Tranco is a research-grade ranking of the top 1M websites,
 * combining data from Alexa, Majestic, Umbrella, and Quantcast.
 * Lower rank = more popular (1 = most popular)
 */

interface TrancoRankResponse {
	domain: string;
	ranks: Array<{
		date: string;
		rank: number;
	}>;
}

/**
 * Extract the root domain from a URL
 * e.g., "https://app.example.com/page" -> "example.com"
 */
export function extractDomain(url: string): string | null {
	try {
		const parsed = new URL(url);
		const hostname = parsed.hostname.toLowerCase();

		// Remove www. prefix
		const withoutWww = hostname.replace(/^www\./, '');

		// For simple cases, just return the hostname
		// This handles most cases like "example.com", "sub.example.com"
		const parts = withoutWww.split('.');

		// Handle common TLDs (simplified)
		if (parts.length >= 2) {
			// Check for two-part TLDs like .co.uk, .com.au
			const lastTwo = parts.slice(-2).join('.');
			const twoPartTlds = ['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.br', 'co.in'];
			if (twoPartTlds.includes(lastTwo) && parts.length >= 3) {
				return parts.slice(-3).join('.');
			}
			// Standard case: return last two parts
			return parts.slice(-2).join('.');
		}

		return withoutWww;
	} catch {
		return null;
	}
}

/**
 * Fetch the Tranco rank for a domain
 * Returns the most recent rank, or null if not in top 1M
 */
export async function getTrancoRank(url: string): Promise<number | null> {
	const domain = extractDomain(url);
	if (!domain) {
		return null;
	}

	try {
		const response = await fetch(
			`https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`,
			{
				headers: {
					Accept: 'application/json',
				},
			},
		);

		if (!response.ok) {
			console.error(`Tranco API error: ${response.status}`);
			return null;
		}

		const data: TrancoRankResponse = await response.json();

		// Return the most recent rank (first in array)
		if (data.ranks && data.ranks.length > 0) {
			return data.ranks[0].rank;
		}

		return null;
	} catch (error) {
		console.error('Tranco API fetch error:', error);
		return null;
	}
}

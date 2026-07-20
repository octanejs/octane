/**
 * Isomorphic SHA-256 hashing utilities.
 * Works in both browser and Node.js environments using Web Crypto API.
 */

/**
 * Compute SHA-256 hash of a string, returning hex-encoded result.
 */
export async function sha256Hex(input: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(input);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

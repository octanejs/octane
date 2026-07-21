/**
 * Server-side encryption utilities for sensitive data at rest.
 * Uses AES-256-GCM for authenticated encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHmac } from 'crypto';
import { env } from './env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_VERSION = 1; // Increment when rotating keys

function getEncryptionKey(): Buffer {
	const secret = env.SESSION_SECRET;
	if (!secret) {
		throw new Error('SESSION_SECRET is required for encryption');
	}
	// Derive a 256-bit key from SESSION_SECRET using HMAC
	return createHmac('sha256', secret).update('token-encryption-v1').digest();
}

/**
 * Encrypt a plaintext string.
 * Returns: base64(version:iv:authTag:ciphertext)
 */
export function encryptToken(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, key, iv);

	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	// Format: version(1 byte) + iv(12 bytes) + authTag(16 bytes) + ciphertext
	const result = Buffer.concat([Buffer.from([KEY_VERSION]), iv, authTag, encrypted]);

	return result.toString('base64');
}

/**
 * Decrypt an encrypted token.
 * Returns the original plaintext or null if decryption fails.
 */
export function decryptToken(encryptedBase64: string): string | null {
	try {
		const data = Buffer.from(encryptedBase64, 'base64');

		// Extract components
		const version = data[0];
		if (version !== KEY_VERSION) {
			// Future: handle key rotation by supporting old versions
			console.error(`[CRYPTO] Unsupported key version: ${version}`);
			return null;
		}

		const iv = data.subarray(1, 1 + IV_LENGTH);
		const authTag = data.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + AUTH_TAG_LENGTH);
		const ciphertext = data.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);

		const key = getEncryptionKey();
		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);

		const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

		return decrypted.toString('utf8');
	} catch (err) {
		console.error(
			'[CRYPTO] Decryption failed:',
			err instanceof Error ? err.message : 'Unknown error',
		);
		return null;
	}
}

/**
 * Check if a string looks like an encrypted token (vs plaintext legacy token).
 * Encrypted tokens are base64 and start with version byte.
 */
export function isEncryptedToken(token: string): boolean {
	try {
		const data = Buffer.from(token, 'base64');
		// Must be at least: version(1) + iv(12) + authTag(16) + 1 byte ciphertext
		if (data.length < 30) return false;
		// Check version byte is valid
		return data[0] === KEY_VERSION;
	} catch {
		return false;
	}
}

/**
 * Decrypt a stored token, handling both encrypted and legacy plaintext tokens.
 * Use this when reading tokens from the database.
 */
export function decryptStoredToken(storedToken: string | null): string | null {
	if (!storedToken) return null;
	if (!isEncryptedToken(storedToken)) return storedToken;
	return decryptToken(storedToken);
}
